"""Request/Response schemas for LangGraph API."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class LangGraphCreateRequest(BaseModel):
    """Request to create a new LangGraph workflow."""
    name: str = Field(..., description='Workflow name')
    description: str = Field(default='', description='Workflow description')
    data: Dict[str, Any] = Field(default_factory=dict, description='Workflow data (nodes, edges, viewport)')
    space_id: Optional[int] = Field(default=None, description='Space ID')


class LangGraphUpdateRequest(BaseModel):
    """Request to update a LangGraph workflow."""
    name: Optional[str] = None
    description: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class LangGraphRunRequest(BaseModel):
    """Request to execute a LangGraph workflow."""
    inputs: Dict[str, Any] = Field(default_factory=dict, description='Input variables')
    thread_id: Optional[str] = Field(default=None, description='Thread ID for persistence')
    stream: bool = Field(default=False, description='Enable streaming')


class LangGraphResumeRequest(BaseModel):
    """Request to resume a paused LangGraph workflow."""
    thread_id: str = Field(..., description='Thread ID')
    human_feedback: str = Field(default='', description='Human feedback')
    node_data: Dict[str, Any] = Field(default_factory=dict, description='Additional node data')


class LangGraphReplayRequest(BaseModel):
    """Request to replay from a checkpoint."""
    thread_id: str = Field(..., description='Thread ID')
    checkpoint_id: str = Field(..., description='Checkpoint ID to replay from')


class LangGraphValidateRequest(BaseModel):
    """Request to validate a workflow graph structure."""
    data: Dict[str, Any] = Field(..., description='Workflow data to validate')


class NodeTypeInfo(BaseModel):
    """Information about an available node type."""
    type: str
    name: str
    description: str
    category: str
    config_schema: Dict[str, Any] = Field(default_factory=dict)
    has_input: bool = True
    has_output: bool = True
    supports_cycle: bool = False


class CheckpointInfo(BaseModel):
    """Information about a workflow checkpoint."""
    checkpoint_id: str
    thread_id: str
    timestamp: float
    node_id: Optional[str] = None
    state_summary: Dict[str, Any] = Field(default_factory=dict)


class StreamEventResponse(BaseModel):
    """A streaming event response."""
    event_type: str
    node_id: Optional[str] = None
    node_name: Optional[str] = None
    data: Any = None
    timestamp: float = 0.0
