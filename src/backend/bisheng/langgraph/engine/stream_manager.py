"""Stream event management for LangGraph workflow execution.

Provides structured event types for real-time UI updates including
node execution, token streaming, tool calls, and state changes.
"""

import json
import logging
import time
from enum import Enum
from typing import Any, Callable, Dict, List, Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)


class StreamEventType(str, Enum):
    """Event types for LangGraph workflow streaming."""
    NODE_START = 'node_start'
    NODE_END = 'node_end'
    TOKEN = 'token'
    TOOL_CALL = 'tool_call'
    TOOL_RESULT = 'tool_result'
    STATE_UPDATE = 'state_update'
    HUMAN_INPUT = 'human_input'
    CHECKPOINT = 'checkpoint'
    ERROR = 'error'
    WORKFLOW_START = 'workflow_start'
    WORKFLOW_END = 'workflow_end'


class StreamEvent(BaseModel):
    """A single stream event."""
    event_type: StreamEventType
    node_id: Optional[str] = None
    node_name: Optional[str] = None
    data: Any = None
    timestamp: float = 0.0

    def model_post_init(self, __context):
        if self.timestamp == 0.0:
            self.timestamp = time.time()


class StreamManager:
    """Manages streaming events during LangGraph workflow execution."""

    def __init__(self):
        self._listeners: List[Callable[[StreamEvent], None]] = []
        self._events: List[StreamEvent] = []

    def add_listener(self, callback: Callable[[StreamEvent], None]):
        """Register a callback for stream events."""
        self._listeners.append(callback)

    def remove_listener(self, callback: Callable[[StreamEvent], None]):
        """Remove a callback."""
        self._listeners = [l for l in self._listeners if l != callback]

    def emit(self, event: StreamEvent):
        """Emit a stream event to all listeners."""
        self._events.append(event)
        for listener in self._listeners:
            try:
                listener(event)
            except Exception as e:
                logger.error(f'Stream listener error: {e}')

    def emit_node_start(self, node_id: str, node_name: str = ''):
        self.emit(StreamEvent(
            event_type=StreamEventType.NODE_START,
            node_id=node_id,
            node_name=node_name,
        ))

    def emit_node_end(self, node_id: str, node_name: str = '', data: Any = None):
        self.emit(StreamEvent(
            event_type=StreamEventType.NODE_END,
            node_id=node_id,
            node_name=node_name,
            data=data,
        ))

    def emit_token(self, node_id: str, token: str):
        self.emit(StreamEvent(
            event_type=StreamEventType.TOKEN,
            node_id=node_id,
            data={'token': token},
        ))

    def emit_tool_call(self, node_id: str, tool_name: str, tool_input: Any):
        self.emit(StreamEvent(
            event_type=StreamEventType.TOOL_CALL,
            node_id=node_id,
            data={'tool_name': tool_name, 'tool_input': tool_input},
        ))

    def emit_tool_result(self, node_id: str, tool_name: str, result: Any):
        self.emit(StreamEvent(
            event_type=StreamEventType.TOOL_RESULT,
            node_id=node_id,
            data={'tool_name': tool_name, 'result': result},
        ))

    def emit_state_update(self, state: Dict[str, Any]):
        self.emit(StreamEvent(
            event_type=StreamEventType.STATE_UPDATE,
            data=state,
        ))

    def emit_human_input(self, node_id: str, input_schema: Any):
        self.emit(StreamEvent(
            event_type=StreamEventType.HUMAN_INPUT,
            node_id=node_id,
            data={'input_schema': input_schema},
        ))

    def emit_error(self, node_id: str = None, error: str = ''):
        self.emit(StreamEvent(
            event_type=StreamEventType.ERROR,
            node_id=node_id,
            data={'error': error},
        ))

    def get_events(self) -> List[StreamEvent]:
        """Get all recorded events."""
        return self._events.copy()

    def to_sse_format(self, event: StreamEvent) -> str:
        """Convert event to Server-Sent Events format."""
        data = event.model_dump()
        return f'data: {json.dumps(data, ensure_ascii=False)}\n\n'
