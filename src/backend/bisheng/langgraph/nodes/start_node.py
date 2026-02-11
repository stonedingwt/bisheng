"""Start node - entry point for LangGraph workflows."""

from datetime import datetime
from typing import Any, Dict, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode


class StartNode(BaseLGNode):
    """Initializes workflow state with global variables and metadata."""

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        # Initialize variables from node config
        init_vars = {}
        for key, value in self.config.items():
            if key == 'current_time':
                init_vars[key] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            elif value is not None:
                init_vars[key] = value

        return {
            'variables': {self.node_id: init_vars},
            'metadata': {
                'workflow_id': self.workflow_id,
                'user_id': self.user_id,
                'start_time': datetime.now().isoformat(),
            },
        }
