"""LangGraph typed state schema for advanced workflow execution."""

import operator
from typing import Annotated, Any, Dict, List, Optional

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


def merge_dicts(left: Dict[str, Any], right: Dict[str, Any]) -> Dict[str, Any]:
    """Merge two dicts, right overrides left."""
    merged = left.copy()
    merged.update(right)
    return merged


def append_list(left: List[Any], right: List[Any]) -> List[Any]:
    """Append right list to left list."""
    return left + right


class LangGraphState(TypedDict):
    """
    Full-featured state schema for LangGraph workflows.

    Unlike the existing TempState(flag: bool), this state carries
    all workflow data natively through LangGraph's state management.
    """

    # Message history with automatic deduplication via add_messages reducer
    messages: Annotated[List[BaseMessage], add_messages]

    # User-defined variables accessible across nodes: {node_id: {key: value}}
    variables: Annotated[Dict[str, Any], merge_dicts]

    # Current active agent name (for multi-agent orchestration)
    current_agent: str

    # Loop/iteration counter
    iteration_count: Annotated[int, operator.add]

    # Intermediate results for Map-Reduce pattern
    intermediate_results: Annotated[List[Any], append_list]

    # Human feedback from human-in-the-loop nodes
    human_feedback: Optional[str]

    # Final output from the workflow
    final_output: Optional[str]

    # Metadata for tracking execution
    metadata: Annotated[Dict[str, Any], merge_dicts]


# Default initial state
DEFAULT_STATE: LangGraphState = {
    'messages': [],
    'variables': {},
    'current_agent': '',
    'iteration_count': 0,
    'intermediate_results': [],
    'human_feedback': None,
    'final_output': None,
    'metadata': {},
}
