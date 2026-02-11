"""SubGraph node - embeds another LangGraph workflow as a nested node."""

import logging
from typing import Any, Dict, Optional

from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class SubGraphNode(BaseLGNode):
    """Nests another LangGraph workflow as a node in the current workflow.

    This enables modular workflow composition and reuse.

    Config:
    - sub_workflow_id: ID of the workflow to embed
    - input_mapping: Dict mapping parent state keys to child input keys
    - output_mapping: Dict mapping child output keys to parent state keys
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        sub_workflow_id = self.config.get('sub_workflow_id', '')
        input_mapping = self.config.get('input_mapping', {})
        output_mapping = self.config.get('output_mapping', {})
        output_key = self.config.get('output_key', 'output')

        if not sub_workflow_id:
            return self.set_variable(state, output_key, 'Error: No sub-workflow configured')

        try:
            # Load sub-workflow data from database
            from bisheng.database.models.flow import FlowDao
            flow = FlowDao.get_flow_by_id(sub_workflow_id)
            if not flow or not flow.data:
                return self.set_variable(state, output_key, f'Error: Sub-workflow {sub_workflow_id} not found')

            workflow_data = flow.data
            if isinstance(workflow_data, str):
                import json
                workflow_data = json.loads(workflow_data)

            # Build sub-graph
            from bisheng.langgraph.engine.graph_builder import LangGraphBuilder
            builder = LangGraphBuilder(
                workflow_id=f'{self.workflow_id}_sub_{sub_workflow_id}',
                workflow_data=workflow_data,
                user_id=self.user_id,
                checkpointer_mode='memory',  # Sub-graphs use in-memory
                stream_manager=self.stream_manager,
            )
            compiled, sub_config, _ = builder.build()

            # Map input from parent state to sub-graph initial state
            from bisheng.langgraph.engine.state_schema import DEFAULT_STATE
            sub_state = dict(DEFAULT_STATE)
            for parent_key, child_key in input_mapping.items():
                value = self.get_variable(state, parent_key)
                if value is not None:
                    if child_key == 'messages':
                        from langchain_core.messages import HumanMessage
                        sub_state['messages'] = [HumanMessage(content=str(value))]
                    else:
                        sub_state.setdefault('variables', {})
                        sub_state['variables'][child_key] = value

            # Execute sub-graph
            result = None
            for event in compiled.stream(sub_state, config=sub_config):
                result = event

            # Map output back to parent state
            output_vars = {}
            if result:
                for child_key, parent_key in output_mapping.items():
                    # Try to get from sub-graph state
                    if child_key in (result or {}):
                        output_vars[parent_key] = result[child_key]

            # Default: use final_output
            if not output_vars:
                # Get final state
                final_state = compiled.get_state(sub_config)
                if final_state and final_state.values:
                    output_vars[output_key] = final_state.values.get('final_output', '')

        except Exception as e:
            logger.error(f'SubGraph node {self.node_id} error: {e}')
            output_vars = {output_key: f'SubGraph error: {str(e)}'}

        return {
            'variables': {self.node_id: output_vars},
        }
