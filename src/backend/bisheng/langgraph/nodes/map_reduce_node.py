"""Map-Reduce node - parallel execution with aggregation."""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableConfig

from bisheng.langgraph.nodes.base import BaseLGNode

logger = logging.getLogger(__name__)


class MapReduceNode(BaseLGNode):
    """Executes a function over multiple items in parallel, then aggregates.

    Config:
    - input_variable: Reference to the list variable to map over
    - map_prompt: Prompt template for each item (use {{item}} placeholder)
    - reduce_prompt: Prompt to aggregate results
    - model_id: LLM model for map/reduce
    - max_concurrency: Maximum parallel executions
    - output_key: Output variable key
    """

    def execute(self, state: Dict[str, Any], config: Optional[RunnableConfig] = None) -> Dict[str, Any]:
        from bisheng.llm.domain.services.llm import LLMService
        from langchain_core.messages import HumanMessage, SystemMessage

        input_var = self.config.get('input_variable', '')
        map_prompt = self.config.get('map_prompt', 'Process this item: {{item}}')
        reduce_prompt = self.config.get('reduce_prompt', 'Summarize these results:\n{{results}}')
        model_id = self.config.get('model_id', '')
        max_concurrency = self.config.get('max_concurrency', 5)
        output_key = self.config.get('output_key', 'output')

        # Get input list
        items = []
        if input_var:
            value = self.get_variable(state, input_var)
            if isinstance(value, list):
                items = value
            elif isinstance(value, str):
                items = [line.strip() for line in value.split('\n') if line.strip()]
            elif value is not None:
                items = [value]

        if not items:
            return self.set_variable(state, output_key, 'No items to process')

        # Get LLM
        llm = LLMService.get_bisheng_llm_sync(
            model_id=model_id,
            temperature=self.config.get('temperature', 0.7),
            app_id=self.workflow_id,
        )

        # Map phase - parallel execution
        map_results = []

        def process_item(item):
            prompt = map_prompt.replace('{{item}}', str(item))
            prompt = self.resolve_template(prompt, state)
            try:
                response = llm.invoke([HumanMessage(content=prompt)])
                return response.content if hasattr(response, 'content') else str(response)
            except Exception as e:
                return f'Error: {str(e)}'

        with ThreadPoolExecutor(max_workers=min(max_concurrency, len(items))) as executor:
            futures = {executor.submit(process_item, item): i for i, item in enumerate(items)}
            map_results = [None] * len(items)
            for future in as_completed(futures):
                idx = futures[future]
                map_results[idx] = future.result()

        # Reduce phase
        results_text = '\n---\n'.join([f'[{i+1}] {r}' for i, r in enumerate(map_results) if r])
        final_prompt = reduce_prompt.replace('{{results}}', results_text)
        final_prompt = self.resolve_template(final_prompt, state)

        try:
            response = llm.invoke([HumanMessage(content=final_prompt)])
            final_result = response.content if hasattr(response, 'content') else str(response)
        except Exception as e:
            final_result = f'Reduce error: {str(e)}'

        return {
            'messages': [AIMessage(content=final_result)],
            'variables': {self.node_id: {output_key: final_result, 'map_results': map_results}},
            'intermediate_results': map_results,
        }
