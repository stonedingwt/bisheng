import { Handle, Position } from '@xyflow/react';
import { memo, useMemo } from 'react';
import { useLangGraphStore } from '../store';
import {
    Play, Square, Brain, Bot, Wrench, Code2, GitFork, UserCheck,
    Users, Layers, Repeat, RotateCcw, Sparkles, CircleDot, Flag
} from 'lucide-react';

// Node type visual config
const NODE_STYLES: Record<string, { icon: any; color: string; bgColor: string; borderColor: string }> = {
    start: { icon: Play, color: '#10b981', bgColor: '#ecfdf5', borderColor: '#6ee7b7' },
    end: { icon: Flag, color: '#ef4444', bgColor: '#fef2f2', borderColor: '#fca5a5' },
    llm: { icon: Sparkles, color: '#8b5cf6', bgColor: '#f5f3ff', borderColor: '#c4b5fd' },
    agent: { icon: Bot, color: '#3b82f6', bgColor: '#eff6ff', borderColor: '#93c5fd' },
    supervisor: { icon: Users, color: '#f59e0b', bgColor: '#fffbeb', borderColor: '#fcd34d' },
    tool: { icon: Wrench, color: '#6366f1', bgColor: '#eef2ff', borderColor: '#a5b4fc' },
    code: { icon: Code2, color: '#14b8a6', bgColor: '#f0fdfa', borderColor: '#5eead4' },
    condition: { icon: GitFork, color: '#f97316', bgColor: '#fff7ed', borderColor: '#fdba74' },
    human: { icon: UserCheck, color: '#ec4899', bgColor: '#fdf2f8', borderColor: '#f9a8d4' },
    subgraph: { icon: Layers, color: '#0ea5e9', bgColor: '#f0f9ff', borderColor: '#7dd3fc' },
    map_reduce: { icon: Repeat, color: '#84cc16', bgColor: '#f7fee7', borderColor: '#bef264' },
    loop: { icon: RotateCcw, color: '#d946ef', bgColor: '#fdf4ff', borderColor: '#e879f9' },
    reflection: { icon: CircleDot, color: '#06b6d4', bgColor: '#ecfeff', borderColor: '#67e8f9' },
};

interface LGNodeData {
    id: string;
    type: string;
    name: string;
    description?: string;
    group_params?: any[];
    [key: string]: any;
}

function LGNodeComponent({ id, data, selected }: { id: string; data: LGNodeData; selected: boolean }) {
    const activeNodeId = useLangGraphStore((s) => s.activeNodeId);
    const isActive = activeNodeId === id;

    const nodeType = data.type || 'llm';
    const style = NODE_STYLES[nodeType] || NODE_STYLES.llm;
    const Icon = style.icon;
    const hasInput = nodeType !== 'start';
    const hasOutput = nodeType !== 'end';

    return (
        <div
            className={`rounded-xl shadow-sm border-2 transition-all duration-200 min-w-[180px] max-w-[280px] ${
                isActive ? 'ring-2 ring-offset-2 ring-blue-500 animate-pulse' : ''
            } ${selected ? 'shadow-lg border-blue-400' : ''}`}
            style={{
                backgroundColor: style.bgColor,
                borderColor: selected ? '#60a5fa' : isActive ? '#3b82f6' : style.borderColor,
            }}
        >
            {/* Header */}
            <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: style.borderColor }}>
                <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: style.color + '20' }}
                >
                    <Icon className="w-4 h-4" style={{ color: style.color }} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: style.color }}>
                        {data.name || nodeType}
                    </div>
                    <div className="text-[10px] text-gray-400 uppercase tracking-wider">{nodeType}</div>
                </div>
            </div>

            {/* Description */}
            {data.description && (
                <div className="px-3 py-1.5 text-xs text-gray-500 truncate">
                    {data.description}
                </div>
            )}

            {/* Config summary */}
            <div className="px-3 py-1.5 text-[11px] text-gray-400">
                {nodeType === 'supervisor' && data.group_params?.length > 0 && 'Multi-Agent Orchestration'}
                {nodeType === 'loop' && 'Iterative Loop'}
                {nodeType === 'reflection' && 'Self-Correction'}
                {nodeType === 'map_reduce' && 'Parallel Processing'}
                {nodeType === 'subgraph' && 'Nested Workflow'}
                {nodeType === 'human' && 'Human-in-the-Loop'}
                {!['supervisor', 'loop', 'reflection', 'map_reduce', 'subgraph', 'human'].includes(nodeType) && (
                    <span className="opacity-60">Click to configure</span>
                )}
            </div>

            {/* Handles */}
            {hasInput && (
                <Handle
                    type="target"
                    position={Position.Left}
                    className="!w-3 !h-3 !border-2 !border-white"
                    style={{ backgroundColor: style.color }}
                />
            )}
            {hasOutput && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className="!w-3 !h-3 !border-2 !border-white"
                    style={{ backgroundColor: style.color }}
                />
            )}
        </div>
    );
}

export default memo(LGNodeComponent);
