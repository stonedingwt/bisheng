"""End node - terminal node for LangGraph workflows."""

from datetime import datetime
from typing import Any, Dict, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode


class EndNode(BaseLGNode):
    """Marks workflow completion and collects final output."""

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        # Collect final output from configured source or last message
        output_var = self.config.get('output_variable', '')
        final = None

        if output_var:
            final = self.get_variable(state, output_var)

        if final is None and state.get('messages'):
            final = state['messages'][-1].content if state['messages'] else ''

        return {
            'final_output': str(final) if final is not None else '',
            'metadata': {'end_time': datetime.now().isoformat()},
        }
