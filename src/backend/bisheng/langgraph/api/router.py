"""LangGraph API router - full CRUD and execution endpoints."""

import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from fastapi.responses import StreamingResponse
from sqlmodel import select

from bisheng.api.v1.schemas import resp_200
from bisheng.database.models.flow import Flow, FlowDao, FlowType, FlowStatus
from bisheng.langgraph.api.schemas import (
    CheckpointInfo,
    LangGraphCreateRequest,
    LangGraphReplayRequest,
    LangGraphResumeRequest,
    LangGraphRunRequest,
    LangGraphUpdateRequest,
    LangGraphValidateRequest,
    NodeTypeInfo,
    StreamEventResponse,
)
from bisheng.langgraph.engine.graph_builder import LangGraphBuilder
from bisheng.langgraph.engine.state_schema import DEFAULT_STATE, LangGraphState
from bisheng.langgraph.engine.stream_manager import StreamEvent, StreamManager
from bisheng.langgraph.nodes import NODE_TYPE_MAP

logger = logging.getLogger(__name__)

router = APIRouter(prefix='/langgraph', tags=['LangGraph'])


# ==================================================================
# STATIC ROUTES (must be declared BEFORE /{workflow_id} to avoid
# FastAPI path-parameter capture)
# ==================================================================

@router.post('/create')
async def create_langgraph_workflow(req: LangGraphCreateRequest):
    """Create a new LangGraph workflow."""
    flow = Flow(
        name=req.name,
        description=req.description,
        data=req.data or {'nodes': [], 'edges': [], 'viewport': {'x': 0, 'y': 0, 'zoom': 1}},
        flow_type=FlowType.LANGGRAPH.value,
        status=FlowStatus.OFFLINE.value,
        space_id=req.space_id,
    )
    flow = FlowDao.create_flow(flow, FlowType.LANGGRAPH.value)
    return resp_200(data={'id': str(flow.id), 'name': flow.name})


@router.get('/node-types')
async def get_node_types():
    """Get all available LangGraph node types and their configuration schemas."""
    node_types = [
        NodeTypeInfo(
            type='start', name='Start', description='Workflow entry point',
            category='flow', has_input=False, config_schema={},
        ),
        NodeTypeInfo(
            type='end', name='End', description='Workflow terminal',
            category='flow', has_output=False, config_schema={
                'output_variable': {'type': 'var_select', 'label': 'Output Variable'},
            },
        ),
        NodeTypeInfo(
            type='llm', name='LLM', description='Single LLM call with prompt templating',
            category='data', config_schema={
                'model_id': {'type': 'model_select', 'label': 'Model'},
                'system_prompt': {'type': 'textarea', 'label': 'System Prompt'},
                'user_prompt': {'type': 'textarea', 'label': 'User Prompt'},
                'temperature': {'type': 'slider', 'label': 'Temperature', 'min': 0, 'max': 2},
                'output_key': {'type': 'input', 'label': 'Output Key', 'default': 'output'},
            },
        ),
        NodeTypeInfo(
            type='agent', name='Agent', description='ReAct/FC agent with tools and knowledge',
            category='agent', supports_cycle=True, config_schema={
                'model_id': {'type': 'model_select', 'label': 'Model'},
                'system_prompt': {'type': 'textarea', 'label': 'System Prompt'},
                'tool_ids': {'type': 'tool_select_multi', 'label': 'Tools'},
                'max_iterations': {'type': 'number', 'label': 'Max Iterations', 'default': 10},
            },
        ),
        NodeTypeInfo(
            type='supervisor', name='Supervisor', description='Multi-agent orchestrator',
            category='agent', supports_cycle=True, config_schema={
                'model_id': {'type': 'model_select', 'label': 'Supervisor Model'},
                'agent_nodes': {'type': 'node_select_multi', 'label': 'Managed Agents'},
                'system_prompt': {'type': 'textarea', 'label': 'Routing Prompt'},
                'max_rounds': {'type': 'number', 'label': 'Max Rounds', 'default': 10},
            },
        ),
        NodeTypeInfo(
            type='tool', name='Tool', description='Execute a single tool',
            category='data', config_schema={
                'tool_id': {'type': 'tool_select', 'label': 'Tool'},
                'tool_input': {'type': 'form', 'label': 'Tool Input'},
            },
        ),
        NodeTypeInfo(
            type='code', name='Code', description='Execute Python code',
            category='data', config_schema={
                'code': {'type': 'code_editor', 'label': 'Python Code'},
                'code_input': {'type': 'form', 'label': 'Input Variables'},
                'code_output': {'type': 'form', 'label': 'Output Variables'},
            },
        ),
        NodeTypeInfo(
            type='condition', name='Condition', description='Conditional branching with cycle support',
            category='flow', supports_cycle=True, config_schema={
                'cases': {'type': 'condition_cases', 'label': 'Conditions'},
                'default_target': {'type': 'node_select', 'label': 'Default Branch'},
            },
        ),
        NodeTypeInfo(
            type='human', name='Human Review', description='Pause for human approval/input',
            category='interaction', config_schema={
                'interaction_type': {'type': 'select', 'label': 'Type', 'options': ['approve', 'edit', 'input']},
                'prompt': {'type': 'textarea', 'label': 'Prompt Message'},
            },
        ),
        NodeTypeInfo(
            type='subgraph', name='SubGraph', description='Embed another workflow',
            category='composition', config_schema={
                'sub_workflow_id': {'type': 'workflow_select', 'label': 'Sub-Workflow'},
                'input_mapping': {'type': 'mapping', 'label': 'Input Mapping'},
                'output_mapping': {'type': 'mapping', 'label': 'Output Mapping'},
            },
        ),
        NodeTypeInfo(
            type='map_reduce', name='Map-Reduce', description='Parallel execution with aggregation',
            category='composition', config_schema={
                'model_id': {'type': 'model_select', 'label': 'Model'},
                'input_variable': {'type': 'var_select', 'label': 'Input List'},
                'map_prompt': {'type': 'textarea', 'label': 'Map Prompt'},
                'reduce_prompt': {'type': 'textarea', 'label': 'Reduce Prompt'},
                'max_concurrency': {'type': 'number', 'label': 'Max Concurrency', 'default': 5},
            },
        ),
        NodeTypeInfo(
            type='loop', name='Loop', description='Iterative execution with exit condition',
            category='flow', supports_cycle=True, config_schema={
                'max_iterations': {'type': 'number', 'label': 'Max Iterations', 'default': 10},
                'exit_condition': {'type': 'var_select', 'label': 'Exit Condition Variable'},
                'exit_value': {'type': 'input', 'label': 'Exit Value', 'default': 'true'},
            },
        ),
        NodeTypeInfo(
            type='reflection', name='Reflection', description='Self-correction via LLM evaluation',
            category='agent', supports_cycle=True, config_schema={
                'model_id': {'type': 'model_select', 'label': 'Evaluator Model'},
                'evaluation_prompt': {'type': 'textarea', 'label': 'Evaluation Prompt'},
                'quality_threshold': {'type': 'textarea', 'label': 'Quality Criteria'},
                'max_reflections': {'type': 'number', 'label': 'Max Reflections', 'default': 3},
            },
        ),
    ]
    return resp_200(data=[nt.model_dump() for nt in node_types])


@router.post('/validate')
async def validate_workflow(req: LangGraphValidateRequest):
    """Validate a LangGraph workflow structure."""
    errors = []
    warnings = []
    data = req.data

    nodes = data.get('nodes', [])
    edges = data.get('edges', [])

    if not nodes:
        errors.append('Workflow must have at least one node')

    # Check for start and end nodes
    node_types_list = [n.get('data', {}).get('type', '') for n in nodes]
    if 'start' not in node_types_list:
        errors.append('Workflow must have a Start node')
    if 'end' not in node_types_list:
        errors.append('Workflow must have an End node')

    # Check for disconnected nodes
    node_ids = {n.get('data', {}).get('id', '') for n in nodes if n.get('data', {}).get('type') != 'note'}
    connected_nodes = set()
    for edge in edges:
        connected_nodes.add(edge.get('source', ''))
        connected_nodes.add(edge.get('target', ''))

    disconnected = node_ids - connected_nodes - {n.get('data', {}).get('id', '') for n in nodes if n.get('data', {}).get('type') in ('start', 'end')}
    if disconnected:
        warnings.append(f'Disconnected nodes: {", ".join(disconnected)}')

    # Check for cycles without exit conditions
    back_edges = [e for e in edges if e.get('data', {}).get('back_edge', False)]
    if back_edges:
        cycle_nodes = {e.get('source', '') for e in back_edges}
        for node_id in cycle_nodes:
            node_data = next((n.get('data', {}) for n in nodes if n.get('data', {}).get('id') == node_id), {})
            node_type = node_data.get('type', '')
            if node_type not in ('condition', 'loop', 'reflection', 'supervisor'):
                warnings.append(f'Back-edge from {node_id} ({node_type}) - ensure exit condition exists')

    return resp_200(data={
        'valid': len(errors) == 0,
        'errors': errors,
        'warnings': warnings,
    })


# ==================== Templates ====================

PRESET_TEMPLATES = [
    {
        'id': 'react_agent',
        'name': 'ReAct Agent',
        'name_zh': 'ReAct 智能体',
        'description': 'A single agent with tool access using ReAct reasoning',
        'description_zh': '使用 ReAct 推理模式的单智能体，支持工具调用',
        'data': {
            'nodes': [
                {'id': 'start_1', 'type': 'lgNode', 'position': {'x': 50, 'y': 200},
                 'data': {'id': 'start_1', 'type': 'start', 'name': 'Start', 'group_params': []}},
                {'id': 'agent_1', 'type': 'lgNode', 'position': {'x': 300, 'y': 200},
                 'data': {'id': 'agent_1', 'type': 'agent', 'name': 'ReAct Agent',
                          'description': 'Agent with tools',
                          'group_params': [{'name': 'config', 'params': [
                              {'key': 'system_prompt', 'value': 'You are a helpful assistant.'},
                              {'key': 'max_iterations', 'value': 10},
                          ]}]}},
                {'id': 'end_1', 'type': 'lgNode', 'position': {'x': 550, 'y': 200},
                 'data': {'id': 'end_1', 'type': 'end', 'name': 'End', 'group_params': []}},
            ],
            'edges': [
                {'id': 'e1', 'source': 'start_1', 'target': 'agent_1', 'type': 'cycleEdge', 'data': {}},
                {'id': 'e2', 'source': 'agent_1', 'target': 'end_1', 'type': 'cycleEdge', 'data': {}},
            ],
            'viewport': {'x': 0, 'y': 0, 'zoom': 1},
        },
    },
    {
        'id': 'multi_agent_supervisor',
        'name': 'Multi-Agent Supervisor',
        'name_zh': '多Agent协作',
        'description': 'Supervisor orchestrates multiple specialized agents',
        'description_zh': '由 Supervisor 调度多个专业化 Agent 协作完成任务',
        'data': {
            'nodes': [
                {'id': 'start_1', 'type': 'lgNode', 'position': {'x': 50, 'y': 200},
                 'data': {'id': 'start_1', 'type': 'start', 'name': 'Start', 'group_params': []}},
                {'id': 'supervisor_1', 'type': 'lgNode', 'position': {'x': 300, 'y': 200},
                 'data': {'id': 'supervisor_1', 'type': 'supervisor', 'name': 'Supervisor',
                          'description': 'Routes to agents', 'group_params': [{'name': 'config', 'params': [
                              {'key': 'agent_nodes', 'value': ['agent_researcher', 'agent_writer']},
                              {'key': 'max_rounds', 'value': 5},
                          ]}]}},
                {'id': 'agent_researcher', 'type': 'lgNode', 'position': {'x': 550, 'y': 100},
                 'data': {'id': 'agent_researcher', 'type': 'agent', 'name': 'Researcher',
                          'description': 'Researches topics', 'group_params': []}},
                {'id': 'agent_writer', 'type': 'lgNode', 'position': {'x': 550, 'y': 300},
                 'data': {'id': 'agent_writer', 'type': 'agent', 'name': 'Writer',
                          'description': 'Writes content', 'group_params': []}},
                {'id': 'end_1', 'type': 'lgNode', 'position': {'x': 800, 'y': 200},
                 'data': {'id': 'end_1', 'type': 'end', 'name': 'End', 'group_params': []}},
            ],
            'edges': [
                {'id': 'e1', 'source': 'start_1', 'target': 'supervisor_1', 'type': 'cycleEdge', 'data': {}},
                {'id': 'e2', 'source': 'supervisor_1', 'target': 'agent_researcher', 'type': 'cycleEdge', 'data': {}},
                {'id': 'e3', 'source': 'supervisor_1', 'target': 'agent_writer', 'type': 'cycleEdge', 'data': {}},
                {'id': 'e4', 'source': 'agent_researcher', 'target': 'supervisor_1', 'type': 'cycleEdge',
                 'data': {'back_edge': True}},
                {'id': 'e5', 'source': 'agent_writer', 'target': 'supervisor_1', 'type': 'cycleEdge',
                 'data': {'back_edge': True}},
                {'id': 'e6', 'source': 'supervisor_1', 'target': 'end_1', 'type': 'cycleEdge', 'data': {}},
            ],
            'viewport': {'x': 0, 'y': 0, 'zoom': 1},
        },
    },
    {
        'id': 'rag_pipeline',
        'name': 'RAG Pipeline',
        'name_zh': 'RAG 流水线',
        'description': 'Retrieval-Augmented Generation with knowledge base',
        'description_zh': '基于知识库的检索增强生成流水线',
        'data': {
            'nodes': [
                {'id': 'start_1', 'type': 'lgNode', 'position': {'x': 50, 'y': 200},
                 'data': {'id': 'start_1', 'type': 'start', 'name': 'Start', 'group_params': []}},
                {'id': 'llm_1', 'type': 'lgNode', 'position': {'x': 300, 'y': 200},
                 'data': {'id': 'llm_1', 'type': 'llm', 'name': 'RAG LLM',
                          'description': 'Answer with context', 'group_params': [{'name': 'config', 'params': [
                              {'key': 'system_prompt', 'value': 'Answer based on the context provided.'},
                          ]}]}},
                {'id': 'end_1', 'type': 'lgNode', 'position': {'x': 550, 'y': 200},
                 'data': {'id': 'end_1', 'type': 'end', 'name': 'End', 'group_params': []}},
            ],
            'edges': [
                {'id': 'e1', 'source': 'start_1', 'target': 'llm_1', 'type': 'cycleEdge', 'data': {}},
                {'id': 'e2', 'source': 'llm_1', 'target': 'end_1', 'type': 'cycleEdge', 'data': {}},
            ],
            'viewport': {'x': 0, 'y': 0, 'zoom': 1},
        },
    },
    {
        'id': 'reflection_loop',
        'name': 'Reflection Loop',
        'name_zh': '反思循环',
        'description': 'Generate content with self-correction loop',
        'description_zh': '生成内容并通过反思循环自我修正',
        'data': {
            'nodes': [
                {'id': 'start_1', 'type': 'lgNode', 'position': {'x': 50, 'y': 200},
                 'data': {'id': 'start_1', 'type': 'start', 'name': 'Start', 'group_params': []}},
                {'id': 'llm_gen', 'type': 'lgNode', 'position': {'x': 300, 'y': 200},
                 'data': {'id': 'llm_gen', 'type': 'llm', 'name': 'Generator',
                          'description': 'Generate content', 'group_params': []}},
                {'id': 'reflect_1', 'type': 'lgNode', 'position': {'x': 550, 'y': 200},
                 'data': {'id': 'reflect_1', 'type': 'reflection', 'name': 'Evaluator',
                          'description': 'Evaluate quality', 'group_params': [{'name': 'config', 'params': [
                              {'key': 'max_reflections', 'value': 3},
                              {'key': 'quality_threshold', 'value': 'Content must be accurate and well-structured.'},
                          ]}]}},
                {'id': 'end_1', 'type': 'lgNode', 'position': {'x': 800, 'y': 200},
                 'data': {'id': 'end_1', 'type': 'end', 'name': 'End', 'group_params': []}},
            ],
            'edges': [
                {'id': 'e1', 'source': 'start_1', 'target': 'llm_gen', 'type': 'cycleEdge', 'data': {}},
                {'id': 'e2', 'source': 'llm_gen', 'target': 'reflect_1', 'type': 'cycleEdge', 'data': {}},
                {'id': 'e3', 'source': 'reflect_1', 'target': 'llm_gen', 'type': 'cycleEdge',
                 'data': {'back_edge': True}},
                {'id': 'e4', 'source': 'reflect_1', 'target': 'end_1', 'type': 'cycleEdge', 'data': {}},
            ],
            'viewport': {'x': 0, 'y': 0, 'zoom': 1},
        },
    },
]


@router.get('/templates')
async def get_templates():
    """Get preset LangGraph workflow templates."""
    return resp_200(data=PRESET_TEMPLATES)


@router.post('/create-from-template/{template_id}')
async def create_from_template(template_id: str, name: str = '', space_id: Optional[int] = None):
    """Create a new LangGraph workflow from a preset template."""
    template = next((t for t in PRESET_TEMPLATES if t['id'] == template_id), None)
    if not template:
        raise HTTPException(status_code=404, detail=f'Template {template_id} not found')

    flow_name = name or template['name']
    flow = Flow(
        name=flow_name,
        description=template.get('description', ''),
        data=template['data'],
        flow_type=FlowType.LANGGRAPH.value,
        status=FlowStatus.OFFLINE.value,
        space_id=space_id,
    )
    flow = FlowDao.create_flow(flow, FlowType.LANGGRAPH.value)
    return resp_200(data={'id': str(flow.id), 'name': flow.name})


# ==================================================================
# DYNAMIC ROUTES (with {workflow_id} path parameter)
# ==================================================================

# ==================== CRUD ====================

@router.get('/{workflow_id}')
async def get_langgraph_workflow(workflow_id: str):
    """Get a LangGraph workflow by ID."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or flow.flow_type != FlowType.LANGGRAPH.value:
        raise HTTPException(status_code=404, detail='LangGraph workflow not found')
    return resp_200(data={
        'id': str(flow.id),
        'name': flow.name,
        'description': flow.description,
        'data': flow.data,
        'status': flow.status,
        'create_time': str(flow.create_time) if flow.create_time else '',
        'update_time': str(flow.update_time) if flow.update_time else '',
    })


@router.put('/{workflow_id}')
async def update_langgraph_workflow(workflow_id: str, req: LangGraphUpdateRequest):
    """Update a LangGraph workflow."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or flow.flow_type != FlowType.LANGGRAPH.value:
        raise HTTPException(status_code=404, detail='LangGraph workflow not found')

    if req.name is not None:
        flow.name = req.name
    if req.description is not None:
        flow.description = req.description
    if req.data is not None:
        flow.data = req.data

    FlowDao.update_flow(flow)
    return resp_200(data={'id': str(flow.id)})


@router.delete('/{workflow_id}')
async def delete_langgraph_workflow(workflow_id: str):
    """Delete a LangGraph workflow."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or flow.flow_type != FlowType.LANGGRAPH.value:
        raise HTTPException(status_code=404, detail='LangGraph workflow not found')
    FlowDao.delete_flow(flow)
    return resp_200(data={'deleted': True})


# ==================== Execution ====================

@router.post('/{workflow_id}/run')
async def run_langgraph_workflow(workflow_id: str, req: LangGraphRunRequest):
    """Execute a LangGraph workflow (blocking)."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or not flow.data:
        raise HTTPException(status_code=404, detail='Workflow not found')

    workflow_data = flow.data
    if isinstance(workflow_data, str):
        workflow_data = json.loads(workflow_data)

    stream_manager = StreamManager()
    builder = LangGraphBuilder(
        workflow_id=workflow_id,
        workflow_data=workflow_data,
        user_id=0,
        checkpointer_mode='memory',
        stream_manager=stream_manager,
    )

    compiled, config, nodes_map = builder.build()

    # Override thread_id if provided
    if req.thread_id:
        config['configurable']['thread_id'] = req.thread_id

    # Build initial state
    initial_state = dict(DEFAULT_STATE)
    if req.inputs:
        from langchain_core.messages import HumanMessage
        if 'message' in req.inputs:
            initial_state['messages'] = [HumanMessage(content=req.inputs['message'])]
        initial_state['variables'] = {'input': req.inputs}

    # Execute
    try:
        result = None
        for event in compiled.stream(initial_state, config=config):
            result = event

        # Get final state
        final_state = compiled.get_state(config)
        final_output = ''
        if final_state and final_state.values:
            final_output = final_state.values.get('final_output', '')
            if not final_output and final_state.values.get('messages'):
                last_msg = final_state.values['messages'][-1]
                final_output = last_msg.content if hasattr(last_msg, 'content') else str(last_msg)

        return resp_200(data={
            'status': 'success',
            'output': final_output,
            'thread_id': config['configurable']['thread_id'],
            'events': [e.model_dump() for e in stream_manager.get_events()],
        })
    except Exception as e:
        logger.exception(f'Workflow execution error: {e}')
        return resp_200(data={'status': 'error', 'error': str(e)})


@router.post('/{workflow_id}/stream')
async def stream_langgraph_workflow(workflow_id: str, req: LangGraphRunRequest):
    """Execute a LangGraph workflow with SSE streaming."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or not flow.data:
        raise HTTPException(status_code=404, detail='Workflow not found')

    workflow_data = flow.data
    if isinstance(workflow_data, str):
        workflow_data = json.loads(workflow_data)

    stream_manager = StreamManager()

    async def event_generator():
        builder = LangGraphBuilder(
            workflow_id=workflow_id,
            workflow_data=workflow_data,
            user_id=0,
            checkpointer_mode='memory',
            stream_manager=stream_manager,
        )
        compiled, config, _ = builder.build()

        if req.thread_id:
            config['configurable']['thread_id'] = req.thread_id

        initial_state = dict(DEFAULT_STATE)
        if req.inputs:
            from langchain_core.messages import HumanMessage
            if 'message' in req.inputs:
                initial_state['messages'] = [HumanMessage(content=req.inputs['message'])]
            initial_state['variables'] = {'input': req.inputs}

        yield f'data: {json.dumps({"event_type": "workflow_start", "timestamp": time.time()})}\n\n'

        try:
            for event in compiled.stream(initial_state, config=config):
                for node_id, node_output in event.items():
                    yield f'data: {json.dumps({"event_type": "node_end", "node_id": node_id, "data": str(node_output)[:500], "timestamp": time.time()})}\n\n'
        except Exception as e:
            yield f'data: {json.dumps({"event_type": "error", "data": {"error": str(e)}, "timestamp": time.time()})}\n\n'

        yield f'data: {json.dumps({"event_type": "workflow_end", "timestamp": time.time()})}\n\n'

    return StreamingResponse(event_generator(), media_type='text/event-stream')


@router.post('/{workflow_id}/resume')
async def resume_langgraph_workflow(workflow_id: str, req: LangGraphResumeRequest):
    """Resume a paused LangGraph workflow after human input."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or not flow.data:
        raise HTTPException(status_code=404, detail='Workflow not found')

    workflow_data = flow.data
    if isinstance(workflow_data, str):
        workflow_data = json.loads(workflow_data)

    stream_manager = StreamManager()
    builder = LangGraphBuilder(
        workflow_id=workflow_id,
        workflow_data=workflow_data,
        user_id=0,
        checkpointer_mode='memory',
        stream_manager=stream_manager,
    )
    compiled, config, _ = builder.build()
    config['configurable']['thread_id'] = req.thread_id

    # Update state with human feedback
    compiled.update_state(
        config,
        {'human_feedback': req.human_feedback},
    )

    # Resume execution
    try:
        result = None
        for event in compiled.stream(None, config=config):
            result = event

        final_state = compiled.get_state(config)
        final_output = final_state.values.get('final_output', '') if final_state else ''

        return resp_200(data={
            'status': 'success',
            'output': final_output,
        })
    except Exception as e:
        return resp_200(data={'status': 'error', 'error': str(e)})


@router.post('/{workflow_id}/invoke')
async def invoke_langgraph_workflow(workflow_id: str, req: LangGraphRunRequest):
    """OpenAPI-compatible invocation endpoint for external calls and scheduled tasks."""
    return await run_langgraph_workflow(workflow_id, req)


# ==================== State & History ====================

@router.get('/{workflow_id}/state')
async def get_workflow_state(workflow_id: str, thread_id: str = Query(default=None)):
    """Get current workflow state."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or not flow.data:
        raise HTTPException(status_code=404, detail='Workflow not found')

    workflow_data = flow.data
    if isinstance(workflow_data, str):
        workflow_data = json.loads(workflow_data)

    builder = LangGraphBuilder(
        workflow_id=workflow_id,
        workflow_data=workflow_data,
        checkpointer_mode='memory',
    )
    compiled, config, _ = builder.build()

    if thread_id:
        config['configurable']['thread_id'] = thread_id

    state = compiled.get_state(config)
    if state:
        values = state.values or {}
        serialized = {}
        for k, v in values.items():
            if k == 'messages':
                serialized[k] = [
                    {'type': type(m).__name__, 'content': m.content}
                    for m in (v or [])
                ]
            else:
                try:
                    json.dumps(v)
                    serialized[k] = v
                except (TypeError, ValueError):
                    serialized[k] = str(v)

        return resp_200(data={
            'state': serialized,
            'next_nodes': list(state.next) if state.next else [],
        })
    return resp_200(data={'state': {}, 'next_nodes': []})


@router.get('/{workflow_id}/history')
async def get_workflow_history(workflow_id: str, thread_id: str = Query(default=None)):
    """Get checkpoint history for time travel debugging."""
    flow = FlowDao.get_flow_by_id(workflow_id)
    if not flow or not flow.data:
        raise HTTPException(status_code=404, detail='Workflow not found')

    workflow_data = flow.data
    if isinstance(workflow_data, str):
        workflow_data = json.loads(workflow_data)

    builder = LangGraphBuilder(
        workflow_id=workflow_id,
        workflow_data=workflow_data,
        checkpointer_mode='memory',
    )
    compiled, config, _ = builder.build()

    if thread_id:
        config['configurable']['thread_id'] = thread_id

    history = []
    for state in compiled.get_state_history(config):
        checkpoint = {
            'checkpoint_id': state.config.get('configurable', {}).get('checkpoint_id', ''),
            'thread_id': state.config.get('configurable', {}).get('thread_id', ''),
            'next_nodes': list(state.next) if state.next else [],
            'created_at': state.config.get('configurable', {}).get('checkpoint_ns', ''),
        }
        history.append(checkpoint)

    return resp_200(data={'history': history})
