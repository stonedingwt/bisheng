"""Code node - executes Python code within the workflow."""

import logging
import traceback
from typing import Any, Dict, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class CodeNode(BaseLGNode):
    """Executes user-defined Python code.

    The code should define a `main(**kwargs)` function that returns a dict.
    Input variables are resolved from state and passed as kwargs.
    Output is written back to state variables.
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        code = self.config.get('code', '')
        code_inputs = self.config.get('code_input', [])
        output_key = self.config.get('output_key', 'output')

        if not code:
            return self.set_variable(state, output_key, '')

        # Build input kwargs
        kwargs = {}
        if isinstance(code_inputs, list):
            for inp in code_inputs:
                key = inp.get('key', '') if isinstance(inp, dict) else ''
                ref = inp.get('ref', '') if isinstance(inp, dict) else ''
                if key and ref:
                    kwargs[key] = self.get_variable(state, ref)
                elif key:
                    value = inp.get('value', '') if isinstance(inp, dict) else ''
                    kwargs[key] = value

        # Execute code safely
        try:
            # Create isolated namespace
            exec_globals = {
                '__builtins__': __builtins__,
                'json': __import__('json'),
                're': __import__('re'),
                'math': __import__('math'),
                'datetime': __import__('datetime'),
            }
            exec_locals = {}
            exec(code, exec_globals, exec_locals)

            # Call main function if defined
            if 'main' in exec_locals:
                result = exec_locals['main'](**kwargs)
            else:
                # If no main(), just get all defined variables
                result = {k: v for k, v in exec_locals.items() if not k.startswith('_')}
        except Exception as e:
            logger.error(f'Code node {self.node_id} error: {e}\n{traceback.format_exc()}')
            result = {'error': str(e)}

        # Map outputs
        output_vars = {}
        if isinstance(result, dict):
            output_vars = result
        else:
            output_vars[output_key] = result

        return {
            'variables': {self.node_id: output_vars},
        }
