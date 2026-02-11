"""Condition node - conditional branching with cycle support."""

import logging
import operator as op
from typing import Any, Dict, List, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)

# Comparison operators
OPERATORS = {
    'equals': lambda a, b: str(a) == str(b),
    'not_equals': lambda a, b: str(a) != str(b),
    'contains': lambda a, b: str(b) in str(a),
    'not_contains': lambda a, b: str(b) not in str(a),
    'greater_than': lambda a, b: float(a) > float(b),
    'less_than': lambda a, b: float(a) < float(b),
    'greater_equal': lambda a, b: float(a) >= float(b),
    'less_equal': lambda a, b: float(a) <= float(b),
    'is_empty': lambda a, b: not a,
    'is_not_empty': lambda a, b: bool(a),
    'starts_with': lambda a, b: str(a).startswith(str(b)),
    'ends_with': lambda a, b: str(a).endswith(str(b)),
}


class ConditionNode(BaseLGNode):
    """Evaluates conditions and routes to different branches.

    Supports back-edges for cycle creation (e.g., routing back to
    a previous node for retry/loop patterns).

    Config expects:
    - cases: List of condition cases, each with:
      - id: case identifier (maps to target node via edges)
      - conditions: List of {left_var, operator, right_value}
      - logic: 'and' | 'or'
    - default_target: node_id for the else branch
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        # Condition node doesn't modify state, just routes
        return {}

    def route(self, state: Dict[str, Any]) -> str:
        """Evaluate conditions and return target node ID."""
        cases = self.config.get('cases', [])

        for case in cases:
            case_id = case.get('id', '')
            conditions = case.get('conditions', [])
            logic = case.get('logic', 'and')

            if not conditions:
                continue

            results = []
            for cond in conditions:
                left_var = cond.get('left_var', '')
                operator_name = cond.get('operator', 'equals')
                right_value = cond.get('right_value', '')

                # Resolve left variable
                left_value = self.get_variable(state, left_var) if left_var else ''

                # Resolve right value (could be a variable reference)
                if isinstance(right_value, str) and '.' in right_value:
                    resolved = self.get_variable(state, right_value)
                    if resolved is not None:
                        right_value = resolved

                # Evaluate
                op_func = OPERATORS.get(operator_name, OPERATORS['equals'])
                try:
                    results.append(op_func(left_value, right_value))
                except (ValueError, TypeError):
                    results.append(False)

            # Apply logic
            if logic == 'or':
                matched = any(results)
            else:
                matched = all(results)

            if matched:
                # Find target node for this case
                for target in self.target_nodes:
                    if case_id in target or target == case_id:
                        return target
                # If case_id matches a target node directly
                if case_id in self.target_nodes:
                    return case_id
                # Return first target as fallback for this case
                if self.target_nodes:
                    return self.target_nodes[0]

        # Default: last target node or end
        default = self.config.get('default_target', '')
        if default and default in self.target_nodes:
            return default
        return self.target_nodes[-1] if self.target_nodes else '__end__'
