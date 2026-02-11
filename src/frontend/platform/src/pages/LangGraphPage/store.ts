import { create } from 'zustand';
import { Node, Edge } from '@xyflow/react';

export interface LGWorkflowState {
    workflowId: string;
    workflowName: string;
    nodes: Node[];
    edges: Edge[];
    selectedNodeId: string | null;
    isRunning: boolean;
    activeNodeId: string | null;
    streamEvents: any[];
    stateData: Record<string, any>;
    checkpoints: any[];
    isDirty: boolean;
}

interface LGWorkflowActions {
    setWorkflowId: (id: string) => void;
    setWorkflowName: (name: string) => void;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    setSelectedNodeId: (id: string | null) => void;
    setIsRunning: (running: boolean) => void;
    setActiveNodeId: (id: string | null) => void;
    addStreamEvent: (event: any) => void;
    clearStreamEvents: () => void;
    setStateData: (data: Record<string, any>) => void;
    setCheckpoints: (checkpoints: any[]) => void;
    setIsDirty: (dirty: boolean) => void;
    reset: () => void;
}

const initialState: LGWorkflowState = {
    workflowId: '',
    workflowName: '',
    nodes: [],
    edges: [],
    selectedNodeId: null,
    isRunning: false,
    activeNodeId: null,
    streamEvents: [],
    stateData: {},
    checkpoints: [],
    isDirty: false,
};

export const useLangGraphStore = create<LGWorkflowState & LGWorkflowActions>((set) => ({
    ...initialState,
    setWorkflowId: (id) => set({ workflowId: id }),
    setWorkflowName: (name) => set({ workflowName: name }),
    setNodes: (nodes) => set({ nodes, isDirty: true }),
    setEdges: (edges) => set({ edges, isDirty: true }),
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),
    setIsRunning: (running) => set({ isRunning: running }),
    setActiveNodeId: (id) => set({ activeNodeId: id }),
    addStreamEvent: (event) => set((s) => ({ streamEvents: [...s.streamEvents, event] })),
    clearStreamEvents: () => set({ streamEvents: [] }),
    setStateData: (data) => set({ stateData: data }),
    setCheckpoints: (checkpoints) => set({ checkpoints }),
    setIsDirty: (dirty) => set({ isDirty: dirty }),
    reset: () => set(initialState),
}));
