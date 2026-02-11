"""LangGraph graph builder - constructs StateGraph from workflow JSON.

Unlike the existing GraphEngine which only supports DAGs,
this builder supports cycles, subgraphs, and advanced patterns.
"""

import logging
from typing import Any, Callable, Dict, List, Optional, Set, Tuple

from langgraph.checkpoint.memory import MemorySaver
from langgraph.constants import END, START
from langgraph.graph import StateGraph
from loguru import logger

from bisheng.langgraph.engine.checkpointer import get_checkpointer
from bisheng.langgraph.engine.state_schema import DEFAULT_STATE, LangGraphState
from bisheng.langgraph.engine.stream_manager import StreamManager
from bisheng.langgraph.nodes.base import BaseLGNode
from bisheng.langgraph.nodes import NODE_TYPE_MAP


class LangGraphBuilder:
    """Builds a LangGraph StateGraph from workflow JSON data.

    Supports:
    - Cyclic graphs (loops, reflection patterns)
    - Subgraph nesting
    - Conditional routing with back-edges
    - Human-in-the-loop interrupts
    - Multi-agent orchestration
    """

    def __init__(
        self,
        workflow_id: str,
        workflow_data: Dict[str, Any],
        user_id: int = 0,
        max_steps: int = 50,
        checkpointer_mode: str = 'memory',
        stream_manager: Optional[StreamManager] = None,
    ):
        self.workflow_id = workflow_id
        self.workflow_data = workflow_data
        self.user_id = user_id
        self.max_steps = max_steps
        self.checkpointer_mode = checkpointer_mode
        self.stream_manager = stream_manager or StreamManager()

        # Node instances
        self.nodes_map: Dict[str, BaseLGNode] = {}
        # Edges parsed from JSON
        self.edges_data: List[Dict] = workflow_data.get('edges', [])
        self.nodes_data: List[Dict] = workflow_data.get('nodes', [])

        # Track special nodes
        self.start_node_id: Optional[str] = None
        self.end_node_ids: List[str] = []
        self.interrupt_node_ids: List[str] = []
        self.condition_node_ids: List[str] = []
        self.back_edges: Set[Tuple[str, str]] = set()  # (source, target) for cycle edges

        # Build adjacency
        self.target_map: Dict[str, List[str]] = {}  # node_id -> [target_ids]
        self.source_map: Dict[str, List[str]] = {}  # node_id -> [source_ids]
        self.edge_conditions: Dict[str, Dict] = {}  # edge_id -> condition data

    def build(self):
        """Build and compile the LangGraph StateGraph."""
        self._parse_edges()
        self._parse_nodes()
        graph_builder = StateGraph(LangGraphState)
        self._add_nodes(graph_builder)
        self._add_edges(graph_builder)

        # Compile with checkpointer
        checkpointer = get_checkpointer(mode=self.checkpointer_mode)
        compiled = graph_builder.compile(
            checkpointer=checkpointer,
            interrupt_before=self.interrupt_node_ids if self.interrupt_node_ids else None,
        )

        # Calculate recursion limit based on graph complexity
        node_count = len(self.nodes_map)
        has_cycles = len(self.back_edges) > 0
        recursion_limit = max(node_count * self.max_steps, 50) if has_cycles else max(node_count * 3, 50)

        config = {
            'configurable': {'thread_id': self.workflow_id},
            'recursion_limit': recursion_limit,
        }

        return compiled, config, self.nodes_map

    def _parse_edges(self):
        """Parse edge data from workflow JSON."""
        for edge in self.edges_data:
            source = edge.get('source', '')
            target = edge.get('target', '')
            if not source or not target:
                continue

            # Track back-edges for cycle detection
            if edge.get('data', {}).get('back_edge', False):
                self.back_edges.add((source, target))

            # Build adjacency
            self.target_map.setdefault(source, []).append(target)
            self.source_map.setdefault(target, []).append(source)

            # Track edge conditions
            edge_id = edge.get('id', '')
            if edge.get('data', {}).get('condition'):
                self.edge_conditions[edge_id] = edge['data']['condition']

    def _parse_nodes(self):
        """Parse and instantiate nodes from workflow JSON."""
        for node_data in self.nodes_data:
            data = node_data.get('data', {})
            node_id = data.get('id', '')
            node_type = data.get('type', '')

            if not node_id or not node_type:
                continue

            # Skip note nodes
            if node_type == 'note':
                continue

            # Get the node class
            node_class = NODE_TYPE_MAP.get(node_type)
            if node_class is None:
                logger.warning(f'Unknown LangGraph node type: {node_type}, skipping')
                continue

            # Instantiate the node
            node_instance = node_class(
                node_id=node_id,
                node_type=node_type,
                node_data=data,
                workflow_id=self.workflow_id,
                user_id=self.user_id,
                stream_manager=self.stream_manager,
                target_nodes=self.target_map.get(node_id, []),
            )

            self.nodes_map[node_id] = node_instance

            # Track special nodes
            if node_type == 'start':
                self.start_node_id = node_id
            elif node_type == 'end':
                self.end_node_ids.append(node_id)
            elif node_type == 'human':
                self.interrupt_node_ids.append(node_id)
            elif node_type == 'condition':
                self.condition_node_ids.append(node_id)

    def _add_nodes(self, graph_builder: StateGraph):
        """Add all nodes to the StateGraph."""
        for node_id, node_instance in self.nodes_map.items():
            graph_builder.add_node(node_id, node_instance)

    def _add_edges(self, graph_builder: StateGraph):
        """Add all edges to the StateGraph, including conditional and cycle edges."""
        if not self.start_node_id:
            raise ValueError('LangGraph workflow must have a start node')

        # START -> start_node
        graph_builder.add_edge(START, self.start_node_id)

        # end_nodes -> END
        for end_id in self.end_node_ids:
            graph_builder.add_edge(end_id, END)

        # Process each node's outgoing edges
        processed = set()
        for node_id, node_instance in self.nodes_map.items():
            if node_id in self.end_node_ids:
                continue

            targets = self.target_map.get(node_id, [])
            if not targets:
                continue

            # Condition nodes use conditional edges
            if node_id in self.condition_node_ids:
                route_map = {t: t for t in targets}
                graph_builder.add_conditional_edges(
                    node_id,
                    node_instance.route,
                    route_map,
                )
                processed.add(node_id)
                continue

            # Supervisor nodes use conditional edges for agent routing
            if node_instance.node_type == 'supervisor':
                route_map = {t: t for t in targets}
                route_map['__end__'] = END
                graph_builder.add_conditional_edges(
                    node_id,
                    node_instance.route,
                    route_map,
                )
                processed.add(node_id)
                continue

            # Loop nodes use conditional edges for exit/continue
            if node_instance.node_type == 'loop':
                route_map = {t: t for t in targets}
                # loop back-edge goes to the loop body
                graph_builder.add_conditional_edges(
                    node_id,
                    node_instance.route,
                    route_map,
                )
                processed.add(node_id)
                continue

            # Reflection nodes route to retry or continue
            if node_instance.node_type == 'reflection':
                route_map = {t: t for t in targets}
                graph_builder.add_conditional_edges(
                    node_id,
                    node_instance.route,
                    route_map,
                )
                processed.add(node_id)
                continue

            # Regular nodes: direct edges
            if node_id not in processed:
                if len(targets) == 1:
                    graph_builder.add_edge(node_id, targets[0])
                else:
                    # Multiple targets without conditions - fan-out to first
                    # (shouldn't happen normally; conditions should handle branching)
                    for target in targets:
                        graph_builder.add_edge(node_id, target)

    def get_node(self, node_id: str) -> Optional[BaseLGNode]:
        """Get a node instance by ID."""
        return self.nodes_map.get(node_id)
