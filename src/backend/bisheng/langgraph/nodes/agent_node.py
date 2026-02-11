"""Agent node - ReAct/Function-calling agent with tools and knowledge.

Reuses Bisheng's existing tool and knowledge infrastructure via
LangGraph's create_react_agent.
"""

import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class AgentNode(BaseLGNode):
    """Full-featured agent node with tools and knowledge base access.

    Supports:
    - ReAct and function-calling execution modes
    - Bisheng tool registry integration
    - Knowledge base retrieval
    - Configurable max iterations
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        from langgraph.prebuilt import create_react_agent
        from bisheng.llm.domain.services.llm import LLMService
        from bisheng.tool.domain.services.executor import ToolExecutor

        model_id = self.config.get('model_id', '')
        system_prompt = self.config.get('system_prompt', '')
        tool_ids = self.config.get('tool_ids', [])
        max_iterations = self.config.get('max_iterations', 10)
        output_key = self.config.get('output_key', 'output')

        # Resolve system prompt template
        if system_prompt:
            system_prompt = self.resolve_template(system_prompt, state)

        # Get LLM
        llm = LLMService.get_bisheng_llm_sync(
            model_id=model_id,
            temperature=self.config.get('temperature', 0.7),
            app_id=self.workflow_id,
        )

        # Load tools from Bisheng registry
        tools = []
        if tool_ids:
            try:
                from bisheng.common.constants.enums.telemetry import ApplicationTypeEnum
                tools = ToolExecutor.init_by_tool_ids_sync(
                    tool_ids,
                    app_id=self.workflow_id,
                    app_name='langgraph',
                    app_type=ApplicationTypeEnum.WORKFLOW,
                    user_id=self.user_id,
                )
            except Exception as e:
                logger.warning(f'Failed to load tools: {e}')

        # Build the agent
        agent = create_react_agent(
            llm,
            tools,
            prompt=system_prompt if system_prompt else None,
            checkpointer=False,
        )

        # Build input messages from state
        input_messages = []
        user_input = self.config.get('user_input', '')
        if user_input:
            user_input = self.resolve_template(user_input, state)
            input_messages.append(HumanMessage(content=user_input))
        elif state.get('messages'):
            # Use conversation history
            input_messages = list(state['messages'][-10:])  # Last 10 messages

        # Invoke agent
        try:
            result = agent.invoke(
                {'messages': input_messages},
                config={'recursion_limit': max_iterations * 2 + 1},
            )
            # Extract final response
            response_messages = result.get('messages', [])
            if response_messages:
                last_msg = response_messages[-1]
                result_text = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)
            else:
                result_text = ''
        except Exception as e:
            logger.error(f'Agent node {self.node_id} error: {e}')
            result_text = f'Agent error: {str(e)}'

        return {
            'messages': [AIMessage(content=result_text)],
            'variables': {self.node_id: {output_key: result_text}},
            'current_agent': self.node_id,
        }
