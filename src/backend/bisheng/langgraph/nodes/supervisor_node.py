"""Supervisor node - multi-agent orchestration via LLM-based routing."""

import json
import logging
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class SupervisorNode(BaseLGNode):
    """Orchestrates multiple agents using a supervisor LLM.

    The supervisor decides which agent to invoke next based on the
    current state and conversation. This enables hierarchical and
    collaborative multi-agent patterns.

    Config:
    - model_id: LLM model for the supervisor
    - agent_nodes: List of agent node IDs this supervisor controls
    - system_prompt: System prompt for the supervisor
    - max_rounds: Maximum routing rounds before forced completion
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        from bisheng.llm.domain.services.llm import LLMService

        model_id = self.config.get('model_id', '')
        agent_nodes = self.config.get('agent_nodes', [])
        system_prompt = self.config.get('system_prompt', '')
        max_rounds = self.config.get('max_rounds', 10)

        if not agent_nodes:
            return {'current_agent': '', 'final_output': 'No agents configured'}

        # Check iteration count
        iteration = state.get('iteration_count', 0)
        if iteration >= max_rounds:
            return {'current_agent': '__end__', 'iteration_count': 1}

        # Build supervisor prompt
        agent_names = ', '.join(agent_nodes)
        default_prompt = (
            f'You are a supervisor managing these agents: [{agent_names}]. '
            f'Based on the conversation, decide which agent should act next. '
            f'Respond with ONLY the agent name, or "FINISH" if the task is complete. '
            f'Available agents: {agent_names}'
        )

        if system_prompt:
            system_prompt = self.resolve_template(system_prompt, state)
        else:
            system_prompt = default_prompt

        # Get conversation context
        messages = [SystemMessage(content=system_prompt)]
        if state.get('messages'):
            messages.extend(state['messages'][-10:])
        else:
            messages.append(HumanMessage(content='What should we do next?'))

        # Ask supervisor LLM
        try:
            llm = LLMService.get_bisheng_llm_sync(
                model_id=model_id,
                temperature=0.0,
                app_id=self.workflow_id,
            )
            response = llm.invoke(messages)
            decision = response.content.strip() if hasattr(response, 'content') else str(response).strip()
        except Exception as e:
            logger.error(f'Supervisor {self.node_id} error: {e}')
            decision = 'FINISH'

        # Parse decision
        next_agent = ''
        if decision.upper() == 'FINISH' or decision.upper() == '__END__':
            next_agent = '__end__'
        else:
            # Match to available agent nodes
            for agent_id in agent_nodes:
                if agent_id in decision or decision in agent_id:
                    next_agent = agent_id
                    break
            if not next_agent:
                # Default to first agent if no match
                next_agent = agent_nodes[0] if agent_nodes else '__end__'

        return {
            'current_agent': next_agent,
            'iteration_count': 1,  # Annotated with operator.add
            'messages': [AIMessage(content=f'Supervisor routed to: {next_agent}')],
        }

    def route(self, state: Dict[str, Any]) -> str:
        """Route to the next agent based on supervisor decision."""
        current = state.get('current_agent', '')
        if current == '__end__' or not current:
            return '__end__'
        if current in self.target_nodes:
            return current
        return self.target_nodes[0] if self.target_nodes else '__end__'
