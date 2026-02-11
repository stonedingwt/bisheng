import { useTranslation } from 'react-i18next';
import {
    Play, Square, Brain, Bot, Wrench, Code2, GitFork, UserCheck,
    Users, Layers, Repeat, RotateCcw, Sparkles, CircleDot, Flag
} from 'lucide-react';

const NODE_CATEGORIES = [
    {
        name: 'Flow Control',
        nameZh: '流程控制',
        nodes: [
            { type: 'start', name: 'Start', nameZh: '开始', icon: Play, color: '#10b981' },
            { type: 'end', name: 'End', nameZh: '结束', icon: Flag, color: '#ef4444' },
            { type: 'condition', name: 'Condition', nameZh: '条件分支', icon: GitFork, color: '#f97316' },
            { type: 'loop', name: 'Loop', nameZh: '循环', icon: RotateCcw, color: '#d946ef' },
        ],
    },
    {
        name: 'Agent',
        nameZh: 'Agent 智能体',
        nodes: [
            { type: 'agent', name: 'Agent', nameZh: 'Agent', icon: Bot, color: '#3b82f6' },
            { type: 'supervisor', name: 'Supervisor', nameZh: '多Agent编排', icon: Users, color: '#f59e0b' },
            { type: 'reflection', name: 'Reflection', nameZh: '反思修正', icon: CircleDot, color: '#06b6d4' },
        ],
    },
    {
        name: 'Data Processing',
        nameZh: '数据处理',
        nodes: [
            { type: 'llm', name: 'LLM', nameZh: 'LLM 调用', icon: Sparkles, color: '#8b5cf6' },
            { type: 'tool', name: 'Tool', nameZh: '工具', icon: Wrench, color: '#6366f1' },
            { type: 'code', name: 'Code', nameZh: '代码', icon: Code2, color: '#14b8a6' },
        ],
    },
    {
        name: 'Interaction',
        nameZh: '交互',
        nodes: [
            { type: 'human', name: 'Human Review', nameZh: '人工审核', icon: UserCheck, color: '#ec4899' },
        ],
    },
    {
        name: 'Composition',
        nameZh: '组合',
        nodes: [
            { type: 'subgraph', name: 'SubGraph', nameZh: '子工作流', icon: Layers, color: '#0ea5e9' },
            { type: 'map_reduce', name: 'Map-Reduce', nameZh: '并行处理', icon: Repeat, color: '#84cc16' },
        ],
    },
];

export default function Sidebar() {
    const { t, i18n } = useTranslation();
    const isZh = i18n.language?.startsWith('zh');

    const onDragStart = (event: React.DragEvent, nodeType: string, nodeName: string) => {
        event.dataTransfer.setData('application/langgraph-node-type', nodeType);
        event.dataTransfer.setData('application/langgraph-node-name', nodeName);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div className="w-56 bg-white border-r flex flex-col h-full overflow-hidden">
            <div className="px-3 py-3 border-b">
                <h3 className="text-sm font-semibold text-gray-700">
                    {isZh ? '节点面板' : 'Node Panel'}
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
                {NODE_CATEGORIES.map((category) => (
                    <div key={category.name} className="mb-3">
                        <div className="px-3 py-1 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                            {isZh ? category.nameZh : category.name}
                        </div>
                        <div className="px-2 space-y-1">
                            {category.nodes.map((node) => {
                                const Icon = node.icon;
                                return (
                                    <div
                                        key={node.type}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-grab hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200"
                                        draggable
                                        onDragStart={(e) => onDragStart(e, node.type, isZh ? node.nameZh : node.name)}
                                    >
                                        <div
                                            className="w-6 h-6 rounded flex items-center justify-center"
                                            style={{ backgroundColor: node.color + '15' }}
                                        >
                                            <Icon className="w-3.5 h-3.5" style={{ color: node.color }} />
                                        </div>
                                        <span className="text-xs text-gray-600 font-medium">
                                            {isZh ? node.nameZh : node.name}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
