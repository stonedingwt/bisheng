"""Base class for all LangGraph workflow nodes.

Unlike Bisheng's existing BaseNode which wraps LangGraph indirectly,
BaseLGNode is a native LangGraph callable that directly receives
and returns LangGraphState.
"""

import copy
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.engine.stream_manager import StreamManager

logger = logging.getLogger(__name__)


class BaseLGNode(ABC):
    """Base class for LangGraph nodes.

    Each node is a callable that receives the current state and returns
    a partial state update dict. This integrates natively with LangGraph's
    StateGraph.add_node() API.
    """

    def __init__(
        self,
        node_id: str,
        node_type: str,
        node_data: Dict[str, Any],
        workflow_id: str = '',
        user_id: int = 0,
        stream_manager: Optional[StreamManager] = None,
        target_nodes: Optional[List[str]] = None,
        **kwargs,
    ):
        self.node_id = node_id
        self.node_type = node_type
        self.node_data = node_data
        self.workflow_id = workflow_id
        self.user_id = user_id
        self.stream_manager = stream_manager or StreamManager()
        self.target_nodes = target_nodes or []

        # Parse node configuration from group_params
        self.config: Dict[str, Any] = {}
        self._parse_config()

    def _parse_config(self):
        """Parse configuration from node_data group_params."""
        group_params = self.node_data.get('group_params', [])
        if not group_params:
            return
        for group in group_params:
            params = group.get('params', [])
            for param in params:
                key = param.get('key', '')
                if key:
                    self.config[key] = copy.deepcopy(param.get('value'))

    def __call__(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        """LangGraph native callable interface.

        Args:
            state: Current LangGraphState
            config: LangGraph runnable config

        Returns:
            Partial state update dict
        """
        self.stream_manager.emit_node_start(self.node_id, self.node_data.get('name', ''))
        try:
            result = self.execute(state, config)
            self.stream_manager.emit_node_end(
                self.node_id, self.node_data.get('name', ''), data=result
            )
            return result
        except Exception as e:
            logger.exception(f'Node {self.node_id} execution error: {e}')
            self.stream_manager.emit_error(self.node_id, str(e))
            raise

    @abstractmethod
    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        """Execute node logic. Must return a partial state update dict.

        Subclasses implement this method to define node behavior.
        """
        raise NotImplementedError

    def route(self, state: Dict[str, Any]) -> str:
        """Route to next node. Used for conditional/loop/supervisor nodes.

        Returns the node_id of the next node to execute.
        Default implementation returns the first target node.
        """
        if self.target_nodes:
            return self.target_nodes[0]
        return '__end__'

    def get_variable(self, state: Dict[str, Any], var_ref: str) -> Any:
        """Get a variable from state using node_id.key reference format."""
        variables = state.get('variables', {})
        if '.' in var_ref:
            node_id, key = var_ref.split('.', 1)
            node_vars = variables.get(node_id, {})
            return node_vars.get(key)
        return variables.get(var_ref)

    def set_variable(self, state: Dict[str, Any], key: str, value: Any) -> Dict[str, Any]:
        """Create a state update that sets a variable for this node."""
        return {
            'variables': {self.node_id: {key: value}},
        }

    def resolve_template(self, template: str, state: Dict[str, Any]) -> str:
        """Resolve {{#node_id.key#}} template variables from state."""
        import re
        pattern = r'\{\{#([^#]+)#\}\}'

        def replacer(match):
            var_ref = match.group(1)
            value = self.get_variable(state, var_ref)
            return str(value) if value is not None else ''

        return re.sub(pattern, replacer, template)
