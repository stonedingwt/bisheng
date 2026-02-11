"""Tool node - executes a single Bisheng-registered tool."""

import logging
from typing import Any, Dict, Optional

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class ToolNode(BaseLGNode):
    """Executes a tool from Bisheng's tool registry.

    Bridges LangGraph with Bisheng's ToolExecutor for access to
    all registered tools including preset, API, and MCP tools.
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        from bisheng.tool.domain.services.executor import ToolExecutor

        tool_id = self.config.get('tool_id', '') or self.node_data.get('tool_key', '')
        tool_input_config = self.config.get('tool_input', {})
        output_key = self.config.get('output_key', 'output')

        # Build tool input from config with variable resolution
        tool_input = {}
        if isinstance(tool_input_config, dict):
            for k, v in tool_input_config.items():
                if isinstance(v, str) and '{{#' in v:
                    tool_input[k] = self.resolve_template(v, state)
                else:
                    tool_input[k] = v
        elif isinstance(tool_input_config, str):
            tool_input = self.resolve_template(tool_input_config, state)

        # Execute tool
        try:
            from bisheng.common.constants.enums.telemetry import ApplicationTypeEnum
            tool = ToolExecutor.init_by_tool_id_sync(
                tool_id,
                app_id=self.workflow_id,
                app_name='langgraph',
                app_type=ApplicationTypeEnum.WORKFLOW,
                user_id=self.user_id,
            )
            self.stream_manager.emit_tool_call(self.node_id, str(tool_id), tool_input)
            result = tool.invoke(input=tool_input if isinstance(tool_input, str) else str(tool_input))
            self.stream_manager.emit_tool_result(self.node_id, str(tool_id), result)
        except Exception as e:
            logger.error(f'Tool node {self.node_id} error: {e}')
            result = f'Tool error: {str(e)}'

        result_str = str(result)
        return {
            'messages': [AIMessage(content=f'Tool result: {result_str}')],
            'variables': {self.node_id: {output_key: result_str}},
        }
