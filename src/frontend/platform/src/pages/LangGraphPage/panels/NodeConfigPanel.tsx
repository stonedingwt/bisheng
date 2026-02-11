import { Button } from '@/components/bs-ui/button';
import { Input } from '@/components/bs-ui/input';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLangGraphStore } from '../store';

interface NodeConfigPanelProps {
    node: any;
    onClose: () => void;
    onUpdate: (nodeId: string, data: any) => void;
}

export default function NodeConfigPanel({ node, onClose, onUpdate }: NodeConfigPanelProps) {
    const { i18n } = useTranslation();
    const isZh = i18n.language?.startsWith('zh');

    const [name, setName] = useState(node?.data?.name || '');
    const [description, setDescription] = useState(node?.data?.description || '');
    const [config, setConfig] = useState<Record<string, any>>({});

    useEffect(() => {
        if (node?.data) {
            setName(node.data.name || '');
            setDescription(node.data.description || '');
            // Parse config from group_params
            const cfg: Record<string, any> = {};
            (node.data.group_params || []).forEach((group: any) => {
                (group.params || []).forEach((param: any) => {
                    if (param.key) cfg[param.key] = param.value ?? '';
                });
            });
            setConfig(cfg);
        }
    }, [node]);

    const handleSave = () => {
        const updatedData = {
            ...node.data,
            name,
            description,
            group_params: [{
                name: 'Configuration',
                params: Object.entries(config).map(([key, value]) => ({
                    key,
                    value,
                    type: typeof value === 'number' ? 'number' : 'input',
                    label: key,
                })),
            }],
        };
        onUpdate(node.id, updatedData);
    };

    const nodeType = node?.data?.type || '';

    // Dynamic config fields based on node type
    const configFields = getConfigFields(nodeType, isZh);

    return (
        <div className="w-72 bg-white border-l flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-3 border-b">
                <h3 className="text-sm font-semibold text-gray-700">
                    {isZh ? '节点配置' : 'Node Config'}
                </h3>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                    <X className="w-4 h-4" />
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
                {/* Name */}
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '名称' : 'Name'}</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
                </div>

                {/* Description */}
                <div>
                    <label className="text-xs text-gray-500 mb-1 block">{isZh ? '描述' : 'Description'}</label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-8 text-sm" />
                </div>

                {/* Dynamic config fields */}
                {configFields.map((field) => (
                    <div key={field.key}>
                        <label className="text-xs text-gray-500 mb-1 block">{field.label}</label>
                        {field.type === 'textarea' ? (
                            <textarea
                                className="w-full border rounded-md p-2 text-sm min-h-[80px] resize-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
                                value={config[field.key] ?? field.default ?? ''}
                                onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                                placeholder={field.placeholder || ''}
                            />
                        ) : field.type === 'number' ? (
                            <Input
                                type="number"
                                className="h-8 text-sm"
                                value={config[field.key] ?? field.default ?? 0}
                                onChange={(e) => setConfig({ ...config, [field.key]: Number(e.target.value) })}
                            />
                        ) : field.type === 'select' ? (
                            <select
                                className="w-full border rounded-md p-1.5 text-sm"
                                value={config[field.key] ?? field.default ?? ''}
                                onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                            >
                                {(field.options || []).map((opt: string) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : (
                            <Input
                                className="h-8 text-sm"
                                value={config[field.key] ?? field.default ?? ''}
                                onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                                placeholder={field.placeholder || ''}
                            />
                        )}
                    </div>
                ))}
            </div>

            {/* Save button */}
            <div className="p-3 border-t">
                <Button className="w-full" size="sm" onClick={handleSave}>
                    {isZh ? '应用' : 'Apply'}
                </Button>
            </div>
        </div>
    );
}

function getConfigFields(nodeType: string, isZh: boolean): any[] {
    const fields: Record<string, any[]> = {
        llm: [
            { key: 'model_id', label: isZh ? '模型 ID' : 'Model ID', type: 'input' },
            { key: 'system_prompt', label: isZh ? '系统提示词' : 'System Prompt', type: 'textarea' },
            { key: 'user_prompt', label: isZh ? '用户提示词' : 'User Prompt', type: 'textarea' },
            { key: 'temperature', label: isZh ? '温度' : 'Temperature', type: 'number', default: 0.7 },
            { key: 'output_key', label: isZh ? '输出变量' : 'Output Key', type: 'input', default: 'output' },
        ],
        agent: [
            { key: 'model_id', label: isZh ? '模型 ID' : 'Model ID', type: 'input' },
            { key: 'system_prompt', label: isZh ? '系统提示词' : 'System Prompt', type: 'textarea' },
            { key: 'tool_ids', label: isZh ? '工具 ID（逗号分隔）' : 'Tool IDs (comma sep)', type: 'input' },
            { key: 'max_iterations', label: isZh ? '最大迭代' : 'Max Iterations', type: 'number', default: 10 },
        ],
        supervisor: [
            { key: 'model_id', label: isZh ? '模型 ID' : 'Model ID', type: 'input' },
            { key: 'system_prompt', label: isZh ? '路由提示词' : 'Routing Prompt', type: 'textarea' },
            { key: 'max_rounds', label: isZh ? '最大轮次' : 'Max Rounds', type: 'number', default: 10 },
        ],
        tool: [
            { key: 'tool_id', label: isZh ? '工具 ID' : 'Tool ID', type: 'input' },
            { key: 'output_key', label: isZh ? '输出变量' : 'Output Key', type: 'input', default: 'output' },
        ],
        code: [
            { key: 'code', label: isZh ? 'Python 代码' : 'Python Code', type: 'textarea' },
        ],
        condition: [
            { key: 'default_target', label: isZh ? '默认分支节点' : 'Default Target', type: 'input' },
        ],
        human: [
            { key: 'interaction_type', label: isZh ? '交互类型' : 'Interaction Type', type: 'select', options: ['approve', 'edit', 'input'], default: 'approve' },
            { key: 'prompt', label: isZh ? '提示信息' : 'Prompt', type: 'textarea' },
        ],
        subgraph: [
            { key: 'sub_workflow_id', label: isZh ? '子工作流 ID' : 'Sub-workflow ID', type: 'input' },
        ],
        map_reduce: [
            { key: 'model_id', label: isZh ? '模型 ID' : 'Model ID', type: 'input' },
            { key: 'input_variable', label: isZh ? '输入变量' : 'Input Variable', type: 'input' },
            { key: 'map_prompt', label: isZh ? 'Map 提示词' : 'Map Prompt', type: 'textarea' },
            { key: 'reduce_prompt', label: isZh ? 'Reduce 提示词' : 'Reduce Prompt', type: 'textarea' },
            { key: 'max_concurrency', label: isZh ? '最大并行' : 'Max Concurrency', type: 'number', default: 5 },
        ],
        loop: [
            { key: 'max_iterations', label: isZh ? '最大迭代' : 'Max Iterations', type: 'number', default: 10 },
            { key: 'exit_condition', label: isZh ? '退出条件变量' : 'Exit Condition Var', type: 'input' },
            { key: 'exit_value', label: isZh ? '退出值' : 'Exit Value', type: 'input', default: 'true' },
        ],
        reflection: [
            { key: 'model_id', label: isZh ? '评估模型 ID' : 'Evaluator Model ID', type: 'input' },
            { key: 'evaluation_prompt', label: isZh ? '评估提示词' : 'Evaluation Prompt', type: 'textarea' },
            { key: 'quality_threshold', label: isZh ? '质量标准' : 'Quality Criteria', type: 'textarea' },
            { key: 'max_reflections', label: isZh ? '最大反思次数' : 'Max Reflections', type: 'number', default: 3 },
        ],
        end: [
            { key: 'output_variable', label: isZh ? '输出变量' : 'Output Variable', type: 'input' },
        ],
    };
    return fields[nodeType] || [];
}
