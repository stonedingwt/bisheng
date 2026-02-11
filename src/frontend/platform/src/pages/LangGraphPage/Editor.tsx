import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
    useReactFlow,
    type Node,
    type OnConnect,
    type OnNodesChange,
    type OnEdgesChange,
} from '@xyflow/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLangGraphStore } from './store';
import LGNode from './nodes/LGNode';
import CycleEdge from './edges/CycleEdge';
import NodeConfigPanel from './panels/NodeConfigPanel';

let nodeIdCounter = 0;
function generateNodeId(type: string): string {
    nodeIdCounter++;
    return `${type}_${Date.now().toString(36)}_${nodeIdCounter}`;
}

const nodeTypes = { lgNode: LGNode };
const edgeTypes = { cycleEdge: CycleEdge };

export default function EditorCanvas() {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const { screenToFlowPosition } = useReactFlow();

    const {
        nodes, edges, setNodes, setEdges,
        selectedNodeId, setSelectedNodeId,
    } = useLangGraphStore();

    const [showConfig, setShowConfig] = useState(false);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => setNodes(applyNodeChanges(changes, nodes)),
        [nodes, setNodes]
    );

    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => setEdges(applyEdgeChanges(changes, edges)),
        [edges, setEdges]
    );

    const onConnect: OnConnect = useCallback(
        (connection) => {
            const sourceIdx = nodes.findIndex((n) => n.id === connection.source);
            const targetIdx = nodes.findIndex((n) => n.id === connection.target);
            const isBackEdge = targetIdx < sourceIdx;
            const newEdge = {
                ...connection,
                id: `e_${connection.source}_${connection.target}_${Date.now()}`,
                type: 'cycleEdge',
                animated: true,
                data: { back_edge: isBackEdge },
            };
            setEdges(addEdge(newEdge, edges));
        },
        [nodes, edges, setEdges]
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const nodeType = event.dataTransfer.getData('application/langgraph-node-type');
            const nodeName = event.dataTransfer.getData('application/langgraph-node-name');
            if (!nodeType) return;

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const nodeId = generateNodeId(nodeType);
            const newNode: Node = {
                id: nodeId,
                type: 'lgNode',
                position,
                data: {
                    id: nodeId,
                    type: nodeType,
                    name: nodeName || nodeType,
                    description: '',
                    group_params: [],
                },
            };
            setNodes([...nodes, newNode]);
        },
        [nodes, setNodes, screenToFlowPosition]
    );

    const onNodeClick = useCallback((_: any, node: Node) => {
        setSelectedNodeId(node.id);
        setShowConfig(true);
    }, [setSelectedNodeId]);

    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        setShowConfig(false);
    }, [setSelectedNodeId]);

    const handleNodeUpdate = useCallback((nodeId: string, data: any) => {
        setNodes(nodes.map((n) => (n.id === nodeId ? { ...n, data } : n)));
        setShowConfig(false);
    }, [nodes, setNodes]);

    const selectedNode = useMemo(
        () => nodes.find((n) => n.id === selectedNodeId),
        [nodes, selectedNodeId]
    );

    return (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
            {/* ReactFlow canvas wrapper - MUST have explicit dimensions */}
            <div
                ref={reactFlowWrapper}
                style={{ flex: 1, height: '100%', position: 'relative' }}
                onDragOver={onDragOver}
                onDrop={onDrop}
            >
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    onPaneClick={onPaneClick}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    defaultEdgeOptions={{ type: 'cycleEdge', animated: true }}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    style={{ background: '#f9fafb' }}
                >
                    <Background gap={16} size={1} color="#e5e7eb" />
                    <Controls showInteractive={false} />
                    <MiniMap
                        nodeStrokeWidth={3}
                        maskColor="rgba(0,0,0,0.08)"
                    />
                </ReactFlow>
            </div>

            {/* Config panel */}
            {showConfig && selectedNode && (
                <NodeConfigPanel
                    node={selectedNode}
                    onClose={() => { setShowConfig(false); setSelectedNodeId(null); }}
                    onUpdate={handleNodeUpdate}
                />
            )}
        </div>
    );
}
