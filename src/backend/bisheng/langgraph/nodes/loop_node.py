"""Loop node - iterative execution with exit condition."""

import logging
from typing import Any, Dict, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class LoopNode(BaseLGNode):
    """Controls loop iteration with configurable exit conditions.

    Uses conditional edges to route back to the loop body or
    forward to the next node. Prevents infinite loops via max_iterations.

    Config:
    - max_iterations: Maximum loop count (default: 10)
    - exit_condition: Variable reference that determines exit
    - exit_value: Value that triggers exit (compared with equals)
    - loop_target: Node ID to route back to (loop body)
    - exit_target: Node ID to route to on exit
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        current_count = state.get('iteration_count', 0)
        return {
            'iteration_count': 1,  # Will be added via operator.add
            'variables': {self.node_id: {'current_iteration': current_count + 1}},
        }

    def route(self, state: Dict[str, Any]) -> str:
        """Decide whether to continue looping or exit."""
        max_iterations = self.config.get('max_iterations', 10)
        exit_condition_var = self.config.get('exit_condition', '')
        exit_value = self.config.get('exit_value', 'true')
        loop_target = self.config.get('loop_target', '')
        exit_target = self.config.get('exit_target', '')

        current_count = state.get('iteration_count', 0)

        # Check max iterations
        if current_count >= max_iterations:
            logger.info(f'Loop {self.node_id} reached max iterations ({max_iterations})')
            return exit_target if exit_target in self.target_nodes else (self.target_nodes[-1] if self.target_nodes else '__end__')

        # Check exit condition
        if exit_condition_var:
            value = self.get_variable(state, exit_condition_var)
            if str(value) == str(exit_value):
                return exit_target if exit_target in self.target_nodes else (self.target_nodes[-1] if self.target_nodes else '__end__')

        # Continue looping
        if loop_target and loop_target in self.target_nodes:
            return loop_target
        return self.target_nodes[0] if self.target_nodes else '__end__'
