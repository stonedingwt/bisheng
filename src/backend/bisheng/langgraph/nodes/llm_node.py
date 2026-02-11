"""LLM node - single LLM call with prompt templating."""

import logging
from typing import Any, Dict, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class LLMNode(BaseLGNode):
    """Executes a single LLM call.

    Reuses Bisheng's LLMService for model management.
    Supports system/user prompt templates with variable substitution.
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        from bisheng.llm.domain.services.llm import LLMService

        model_id = self.config.get('model_id', '')
        temperature = self.config.get('temperature', 0.7)
        system_prompt = self.config.get('system_prompt', '')
        user_prompt = self.config.get('user_prompt', '')
        output_key = self.config.get('output_key', 'output')

        # Resolve template variables
        if system_prompt:
            system_prompt = self.resolve_template(system_prompt, state)
        if user_prompt:
            user_prompt = self.resolve_template(user_prompt, state)

        # If no user prompt, use last message
        if not user_prompt and state.get('messages'):
            last_msg = state['messages'][-1]
            user_prompt = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)

        # Build messages
        messages = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=user_prompt))

        # Get LLM and invoke
        try:
            llm = LLMService.get_bisheng_llm_sync(
                model_id=model_id,
                temperature=temperature,
                app_id=self.workflow_id,
            )
            response = llm.invoke(messages)
            result_text = response.content if hasattr(response, 'content') else str(response)
        except Exception as e:
            logger.error(f'LLM node {self.node_id} error: {e}')
            result_text = f'Error: {str(e)}'

        # Stream tokens if available
        self.stream_manager.emit_token(self.node_id, result_text)

        return {
            'messages': [AIMessage(content=result_text)],
            'variables': {self.node_id: {output_key: result_text}},
        }
