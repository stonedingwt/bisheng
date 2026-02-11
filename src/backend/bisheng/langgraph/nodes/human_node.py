"""Human-in-the-loop node - pauses execution for human review/input."""

import logging
from typing import Any, Dict, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class HumanNode(BaseLGNode):
    """Pauses workflow for human review, approval, or input.

    Uses LangGraph's interrupt_before mechanism. When the graph reaches
    this node, execution pauses and the frontend displays an approval panel.

    Supports three interaction modes:
    - approve: Pass/reject with optional comment
    - edit: Human can modify the pending output
    - input: Free-form user input

    The human feedback is stored in state['human_feedback'] and
    can be consumed by subsequent nodes.
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        interaction_type = self.config.get('interaction_type', 'approve')
        prompt_message = self.config.get('prompt', 'Please review and provide feedback.')
        output_key = self.config.get('output_key', 'feedback')

        # Resolve prompt template
        if prompt_message:
            prompt_message = self.resolve_template(prompt_message, state)

        # Emit human input event for frontend
        self.stream_manager.emit_human_input(self.node_id, {
            'type': interaction_type,
            'prompt': prompt_message,
            'node_name': self.node_data.get('name', 'Human Review'),
        })

        # The human_feedback field will be populated by the resume API
        # when the user provides input. On first execution, it may be None.
        feedback = state.get('human_feedback')

        return {
            'variables': {self.node_id: {output_key: feedback or ''}},
            'human_feedback': None,  # Reset after consumption
        }
