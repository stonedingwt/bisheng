import { Background, ReactFlow, addEdge, applyEdgeChanges, applyNodeChanges, Handle, Position } from '@xyflow/react';
import '@xyflow/react/dist/base.css';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

// ─── Node colors ────────────────────────────────────────────────
const NODE_COLORS: Record<string, string> = {
    start: '#10b981', end: '#ef4444', llm: '#8b5cf6', agent: '#3b82f6',
    supervisor: '#f59e0b', tool: '#6366f1', code: '#14b8a6', condition: '#f97316',
    human: '#ec4899', subgraph: '#0ea5e9', map_reduce: '#84cc16',
    loop: '#d946ef', reflection: '#06b6d4',
};

const NODE_LIST = [
    { type: 'start', name: '开始' }, { type: 'end', name: '结束' },
    { type: 'llm', name: 'LLM' }, { type: 'agent', name: 'Agent' },
    { type: 'tool', name: '工具' }, { type: 'code', name: '代码' },
    { type: 'condition', name: '条件分支' }, { type: 'human', name: '人工审核' },
    { type: 'supervisor', name: '多Agent编排' }, { type: 'subgraph', name: '子工作流' },
    { type: 'map_reduce', name: '并行处理' }, { type: 'loop', name: '循环' },
    { type: 'reflection', name: '反思修正' },
];

// ─── Custom node component ─────────────────────────────────────
function LGNode({ data, selected }: any) {
    const nodeType = data?.type || 'llm';
    const color = NODE_COLORS[nodeType] || '#8b5cf6';
    return (
        <div style={{
            background: '#fff',
            border: `2px solid ${selected ? '#3b82f6' : color}`,
            borderRadius: 12, padding: '8px 16px', minWidth: 140,
            boxShadow: selected ? '0 0 0 2px rgba(59,130,246,0.3)' : '0 1px 3px rgba(0,0,0,0.1)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color, whiteSpace: 'nowrap' }}>{data?.name || nodeType}</div>
            </div>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' as const }}>{nodeType}</div>
            {nodeType !== 'start' && <Handle type="target" position={Position.Left} style={{ background: color, width: 10, height: 10, border: '2px solid #fff' }} />}
            {nodeType !== 'end' && <Handle type="source" position={Position.Right} style={{ background: color, width: 10, height: 10, border: '2px solid #fff' }} />}
        </div>
    );
}

const nodeTypes = { lgNode: LGNode };

// ─── Node Config Panel ─────────────────────────────────────────
function NodeConfigPanel({ node, onUpdate, onClose }: { node: any; onUpdate: (data: any) => void; onClose: () => void }) {
    const [name, setName] = useState(node?.data?.name || '');
    const [config, setConfig] = useState(JSON.stringify(node?.data?.config || {}, null, 2));
    const nodeType = node?.data?.type || 'unknown';

    useEffect(() => {
        setName(node?.data?.name || '');
        setConfig(JSON.stringify(node?.data?.config || {}, null, 2));
    }, [node?.id]);

    return (
        <div style={{ width: 300, background: '#fff', borderLeft: '1px solid #e5e7eb', padding: 16, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>节点配置</h3>
                <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>&#10005;</button>
            </div>
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>类型</label>
                <div style={{ fontSize: 13, padding: '6px 10px', background: '#f3f4f6', borderRadius: 6, color: NODE_COLORS[nodeType] || '#8b5cf6', fontWeight: 600 }}>{nodeType}</div>
            </div>
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>名称</label>
                <input value={name} onChange={e => setName(e.target.value)}
                    onBlur={() => onUpdate({ ...node.data, name })}
                    style={{ width: '100%', fontSize: 13, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>配置 (JSON)</label>
                <textarea value={config} onChange={e => setConfig(e.target.value)}
                    onBlur={() => { try { onUpdate({ ...node.data, config: JSON.parse(config) }); } catch { } }}
                    style={{ width: '100%', height: 150, fontSize: 12, fontFamily: 'monospace', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>Node ID: {node?.id}</div>
        </div>
    );
}

// ─── Main Page Component ────────────────────────────────────────
export default function LangGraphPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const rfInstanceRef = useRef<any>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [workflowName, setWorkflowName] = useState('');
    const [nodes, setNodes] = useState<any[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [statusMsg, setStatusMsg] = useState('');

    // Load workflow
    useEffect(() => {
        if (!id) { setError('No workflow ID'); setLoading(false); return; }
        import('@/controllers/API/langgraph').then(mod => {
            mod.getLangGraphWorkflow(id).then((data: any) => {
                setWorkflowName(data?.name || '');
                const wfData = data?.data || {};
                setNodes(wfData.nodes || []);
                setEdges(wfData.edges || []);
                setLoading(false);
            }).catch((e: any) => {
                setError(String(e?.message || e || 'Load failed'));
                setLoading(false);
            });
        });
    }, [id]);

    const onInit = useCallback((instance: any) => { rfInstanceRef.current = instance; }, []);
    const onNodesChange = useCallback((changes: any) => { setNodes(nds => applyNodeChanges(changes, nds)); }, []);
    const onEdgesChange = useCallback((changes: any) => { setEdges(eds => applyEdgeChanges(changes, eds)); }, []);
    const onConnect = useCallback((connection: any) => {
        setEdges(eds => addEdge({ ...connection, id: `e_${connection.source}_${connection.target}_${Date.now()}`, animated: true }, eds));
    }, []);
    const onNodeClick = useCallback((_event: any, node: any) => { setSelectedNode(node); }, []);
    const onNodeDataUpdate = useCallback((nodeId: string, newData: any) => {
        setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: newData } : n));
        setSelectedNode((prev: any) => prev?.id === nodeId ? { ...prev, data: newData } : prev);
    }, []);
    const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
    const onDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const t = e.dataTransfer.getData('lg-type');
        const n = e.dataTransfer.getData('lg-name');
        if (!t) return;
        const instance = rfInstanceRef.current;
        if (!instance?.screenToFlowPosition) return;
        const pos = instance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const nodeId = `${t}_${Date.now().toString(36)}`;
        setNodes(nds => [...nds, { id: nodeId, type: 'lgNode', position: pos, data: { id: nodeId, type: t, name: n || t, config: {} } }]);
    }, []);
    const onPaneClick = useCallback(() => { setSelectedNode(null); }, []);

    // Save
    const handleSave = useCallback(async () => {
        if (!id) return;
        setStatusMsg('保存中...');
        try {
            const mod = await import('@/controllers/API/langgraph');
            await mod.updateLangGraphWorkflow(id, {
                name: workflowName,
                data: {
                    nodes: nodes.map((n: any) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
                    edges: edges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type, data: e.data })),
                    viewport: { x: 0, y: 0, zoom: 1 },
                },
            });
            setStatusMsg('✓ 已保存');
            setTimeout(() => setStatusMsg(''), 2000);
        } catch (e: any) {
            setStatusMsg('✗ 保存失败: ' + (e?.message || e));
            setTimeout(() => setStatusMsg(''), 5000);
        }
    }, [id, workflowName, nodes, edges]);

    // Run
    const handleRun = useCallback(async () => {
        if (!id) return;
        setStatusMsg('保存并运行中...');
        try {
            const mod = await import('@/controllers/API/langgraph');
            await mod.updateLangGraphWorkflow(id, {
                name: workflowName,
                data: {
                    nodes: nodes.map((n: any) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
                    edges: edges.map((e: any) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle, type: e.type, data: e.data })),
                    viewport: { x: 0, y: 0, zoom: 1 },
                },
            });
            const res = await mod.runLangGraphWorkflow(id, { inputs: {}, stream: false });
            if (res?.status === 'success') {
                setStatusMsg('✓ 执行完成');
            } else {
                setStatusMsg('执行结果: ' + JSON.stringify(res).substring(0, 100));
            }
            setTimeout(() => setStatusMsg(''), 5000);
        } catch (e: any) {
            setStatusMsg('✗ 执行失败: ' + (e?.message || e));
            setTimeout(() => setStatusMsg(''), 5000);
        }
    }, [id, workflowName, nodes, edges]);

    if (loading) {
        return (
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#8b5cf6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
                    <p style={{ marginTop: 12, color: '#9ca3af', fontSize: 14 }}>加载 LangGraph 工作流...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', flexDirection: 'column', gap: 16 }}>
                <h2 style={{ color: '#ef4444', fontSize: 18, fontWeight: 600 }}>加载失败</h2>
                <p style={{ color: '#6b7280', fontSize: 14 }}>{error}</p>
                <button onClick={() => navigate('/build/apps')} style={{ padding: '8px 24px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>返回</button>
            </div>
        );
    }

    return (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
            {/* Header */}
            <div style={{ height: 48, background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate('/build/apps')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4 }}>&#8592;</button>
                    <input value={workflowName} onChange={e => setWorkflowName(e.target.value)}
                        style={{ fontSize: 15, fontWeight: 600, border: '1px solid transparent', borderRadius: 4, padding: '2px 8px', outline: 'none', background: 'transparent', width: 200 }}
                        onFocus={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.background = '#fff'; }}
                        onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = 'transparent'; }} />
                    <span style={{ padding: '2px 10px', fontSize: 11, background: '#f3e8ff', color: '#7c3aed', borderRadius: 999 }}>LangGraph</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {statusMsg && (
                        <span style={{ fontSize: 12, color: statusMsg.startsWith('✓') ? '#16a34a' : statusMsg.startsWith('✗') ? '#ef4444' : '#6b7280', marginRight: 8 }}>
                            {statusMsg}
                        </span>
                    )}
                    <button onClick={handleSave}
                        style={{ padding: '6px 16px', fontSize: 13, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
                        &#128190; 保存
                    </button>
                    <button onClick={handleRun}
                        style={{ padding: '6px 16px', fontSize: 13, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                        &#9654; 运行
                    </button>
                </div>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* Sidebar */}
                <div style={{ width: 200, background: '#fff', borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: 8, flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', padding: '4px 8px', marginBottom: 4 }}>节点面板</div>
                    {NODE_LIST.map(node => (
                        <div key={node.type} draggable
                            onDragStart={(e) => { e.dataTransfer.setData('lg-type', node.type); e.dataTransfer.setData('lg-name', node.name); e.dataTransfer.effectAllowed = 'move'; }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'grab', marginBottom: 2, fontSize: 12, color: '#374151', border: '1px solid transparent', transition: 'background 0.15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#f3f4f6'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: (NODE_COLORS[node.type] || '#8b5cf6') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: NODE_COLORS[node.type] || '#8b5cf6' }} />
                            </div>
                            {node.name}
                        </div>
                    ))}
                </div>

                {/* Canvas */}
                <div style={{ flex: 1, height: '100%' }} onDragOver={onDragOver} onDrop={onDrop}>
                    <ReactFlow nodes={nodes} edges={edges}
                        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
                        onInit={onInit} onNodeClick={onNodeClick} onPaneClick={onPaneClick}
                        nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}
                        style={{ background: '#f9fafb' }}>
                        <Background gap={16} size={1} color="#e5e7eb" />
                    </ReactFlow>
                </div>

                {/* Config Panel */}
                {selectedNode && (
                    <NodeConfigPanel node={selectedNode}
                        onUpdate={(newData) => onNodeDataUpdate(selectedNode.id, newData)}
                        onClose={() => setSelectedNode(null)} />
                )}
            </div>
        </div>
    );
}
