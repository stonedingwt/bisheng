import axios from "../request";

// ==================== CRUD ====================

export interface LangGraphWorkflow {
    id: string;
    name: string;
    description: string;
    data: any;
    status: number;
    create_time: string;
    update_time: string;
}

export async function createLangGraphWorkflow(params: {
    name: string;
    description?: string;
    data?: any;
    space_id?: number;
}) {
    // axios interceptor auto-unwraps: returns {id, name} directly
    return await axios.post('/api/v1/langgraph/create', params);
}

export async function getLangGraphWorkflow(id: string): Promise<LangGraphWorkflow> {
    // axios interceptor auto-unwraps: returns the full workflow object directly
    return await axios.get(`/api/v1/langgraph/${id}`) as any;
}

export async function updateLangGraphWorkflow(id: string, params: {
    name?: string;
    description?: string;
    data?: any;
}) {
    return await axios.put(`/api/v1/langgraph/${id}`, params);
}

export async function deleteLangGraphWorkflow(id: string) {
    return await axios.delete(`/api/v1/langgraph/${id}`);
}

// ==================== Execution ====================

export interface RunResult {
    status: string;
    output: string;
    thread_id: string;
    events: StreamEvent[];
}

export interface StreamEvent {
    event_type: string;
    node_id?: string;
    node_name?: string;
    data?: any;
    timestamp: number;
}

export async function runLangGraphWorkflow(id: string, params: {
    inputs?: Record<string, any>;
    thread_id?: string;
    stream?: boolean;
}): Promise<RunResult> {
    // axios interceptor auto-unwraps: returns RunResult directly
    return await axios.post(`/api/v1/langgraph/${id}/run`, params) as any;
}

export async function resumeLangGraphWorkflow(id: string, params: {
    thread_id: string;
    human_feedback: string;
    node_data?: Record<string, any>;
}) {
    return await axios.post(`/api/v1/langgraph/${id}/resume`, params);
}

// ==================== State & History ====================

export async function getLangGraphState(id: string, threadId?: string) {
    const qs = threadId ? `?thread_id=${threadId}` : '';
    return await axios.get(`/api/v1/langgraph/${id}/state${qs}`) as any;
}

export async function getLangGraphHistory(id: string, threadId?: string) {
    const qs = threadId ? `?thread_id=${threadId}` : '';
    return await axios.get(`/api/v1/langgraph/${id}/history${qs}`) as any;
}

// ==================== Utilities ====================

export interface NodeTypeInfo {
    type: string;
    name: string;
    description: string;
    category: string;
    config_schema: Record<string, any>;
    has_input: boolean;
    has_output: boolean;
    supports_cycle: boolean;
}

export async function getLangGraphNodeTypes(): Promise<NodeTypeInfo[]> {
    // axios interceptor auto-unwraps: returns NodeTypeInfo[] directly
    return await axios.get('/api/v1/langgraph/node-types') as any;
}

export async function validateLangGraphWorkflow(data: any) {
    return await axios.post('/api/v1/langgraph/validate', { data }) as any;
}

// ==================== Templates ====================

export interface LangGraphTemplate {
    id: string;
    name: string;
    name_zh: string;
    description: string;
    description_zh: string;
    data: any;
}

export async function getLangGraphTemplates(): Promise<LangGraphTemplate[]> {
    // axios interceptor auto-unwraps: returns LangGraphTemplate[] directly
    return await axios.get('/api/v1/langgraph/templates') as any;
}

export async function createFromTemplate(templateId: string, name?: string, spaceId?: number) {
    const params = new URLSearchParams();
    if (name) params.append('name', name);
    if (spaceId) params.append('space_id', String(spaceId));
    return await axios.post(`/api/v1/langgraph/create-from-template/${templateId}?${params.toString()}`);
}

// ==================== OpenAPI Invoke ====================

export async function invokeLangGraphWorkflow(id: string, inputs: Record<string, any> = {}) {
    return await axios.post(`/api/v1/langgraph/${id}/invoke`, { inputs }) as any;
}
