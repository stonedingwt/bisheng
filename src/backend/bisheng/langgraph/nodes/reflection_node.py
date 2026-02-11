"""Reflection node - self-correction via LLM evaluation loop."""

import logging
from typing import Any, Dict, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class ReflectionNode(BaseLGNode):
    """Evaluates LLM output and decides whether to retry or accept.

    Implements the reflection pattern: generate -> evaluate -> retry/accept.
    Uses conditional edges to route back to the generator or forward.

    Config:
    - model_id: LLM model for evaluation
    - evaluation_prompt: Prompt template for quality evaluation
    - input_variable: Variable reference to the content being evaluated
    - quality_threshold: Acceptance criteria description
    - max_reflections: Maximum retry count (default: 3)
    - retry_target: Node ID to route back to for retry
    - accept_target: Node ID to route to on acceptance
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        from bisheng.llm.domain.services.llm import LLMService

        model_id = self.config.get('model_id', '')
        eval_prompt = self.config.get('evaluation_prompt', '')
        input_var = self.config.get('input_variable', '')
        quality_threshold = self.config.get('quality_threshold', 'The output should be accurate and complete.')
        output_key = self.config.get('output_key', 'evaluation')

        # Get content to evaluate
        content = ''
        if input_var:
            content = self.get_variable(state, input_var) or ''
        if not content and state.get('messages'):
            last = state['messages'][-1]
            content = last.content if hasattr(last, 'content') else str(last)

        # Build evaluation prompt
        if not eval_prompt:
            eval_prompt = (
                f'Evaluate the following content against this criteria: {quality_threshold}\n\n'
                f'Content to evaluate:\n{content}\n\n'
                f'Respond with EXACTLY one of:\n'
                f'- "ACCEPT" if the content meets the criteria\n'
                f'- "RETRY: <feedback>" if the content needs improvement, '
                f'including specific feedback for improvement'
            )
        else:
            eval_prompt = self.resolve_template(eval_prompt, state)
            eval_prompt = eval_prompt.replace('{{content}}', str(content))

        # Evaluate with LLM
        try:
            llm = LLMService.get_bisheng_llm_sync(
                model_id=model_id,
                temperature=0.0,
                app_id=self.workflow_id,
            )
            response = llm.invoke([
                SystemMessage(content='You are a quality evaluator. Be strict but fair.'),
                HumanMessage(content=eval_prompt),
            ])
            evaluation = response.content.strip() if hasattr(response, 'content') else str(response).strip()
        except Exception as e:
            logger.error(f'Reflection node {self.node_id} error: {e}')
            evaluation = 'ACCEPT'  # Accept on error to prevent infinite loops

        # Parse decision
        accepted = evaluation.upper().startswith('ACCEPT')
        feedback = evaluation.split(':', 1)[1].strip() if ':' in evaluation else evaluation

        return {
            'variables': {self.node_id: {
                output_key: evaluation,
                'accepted': accepted,
                'feedback': feedback,
            }},
            'iteration_count': 1,
            'messages': [AIMessage(content=f'Reflection: {evaluation}')],
        }

    def route(self, state: Dict[str, Any]) -> str:
        """Route based on evaluation result."""
        max_reflections = self.config.get('max_reflections', 3)
        retry_target = self.config.get('retry_target', '')
        accept_target = self.config.get('accept_target', '')

        # Check if accepted
        node_vars = state.get('variables', {}).get(self.node_id, {})
        accepted = node_vars.get('accepted', False)

        # Check max reflections
        iteration = state.get('iteration_count', 0)
        if iteration >= max_reflections:
            accepted = True

        if accepted:
            if accept_target and accept_target in self.target_nodes:
                return accept_target
            return self.target_nodes[-1] if self.target_nodes else '__end__'
        else:
            if retry_target and retry_target in self.target_nodes:
                return retry_target
            return self.target_nodes[0] if self.target_nodes else '__end__'
