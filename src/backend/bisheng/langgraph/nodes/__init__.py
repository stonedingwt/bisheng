"""LangGraph node type registry."""

from bisheng.langgraph.nodes.start_node import StartNode
from bisheng.langgraph.nodes.end_node import EndNode
from bisheng.langgraph.nodes.llm_node import LLMNode
from bisheng.langgraph.nodes.agent_node import AgentNode
from bisheng.langgraph.nodes.tool_node import ToolNode
from bisheng.langgraph.nodes.code_node import CodeNode
from bisheng.langgraph.nodes.condition_node import ConditionNode
from bisheng.langgraph.nodes.human_node import HumanNode
from bisheng.langgraph.nodes.supervisor_node import SupervisorNode
from bisheng.langgraph.nodes.subgraph_node import SubGraphNode
from bisheng.langgraph.nodes.map_reduce_node import MapReduceNode
from bisheng.langgraph.nodes.loop_node import LoopNode
from bisheng.langgraph.nodes.reflection_node import ReflectionNode

NODE_TYPE_MAP = {
    'start': StartNode,
    'end': EndNode,
    'llm': LLMNode,
    'agent': AgentNode,
    'tool': ToolNode,
    'code': CodeNode,
    'condition': ConditionNode,
    'human': HumanNode,
    'supervisor': SupervisorNode,
    'subgraph': SubGraphNode,
    'map_reduce': MapReduceNode,
    'loop': LoopNode,
    'reflection': ReflectionNode,
}

__all__ = [
    'NODE_TYPE_MAP',
    'StartNode', 'EndNode', 'LLMNode', 'AgentNode', 'ToolNode',
    'CodeNode', 'ConditionNode', 'HumanNode', 'SupervisorNode',
    'SubGraphNode', 'MapReduceNode', 'LoopNode', 'ReflectionNode',
]
