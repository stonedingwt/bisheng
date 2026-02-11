import { Button } from '@/components/bs-ui/button';
import { Input } from '@/components/bs-ui/input';
import { useToast } from '@/components/bs-ui/toast/use-toast';
import { updateLangGraphWorkflow } from '@/controllers/API/langgraph';
import { ArrowLeft, Play, Save, Square } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useLangGraphStore } from './store';

interface HeaderProps {
    workflowData: any;
    onRun: () => void;
    onStop: () => void;
    onSave: () => void;
}

export default function Header({ workflowData, onRun, onStop, onSave }: HeaderProps) {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { toast } = useToast();
    const isZh = i18n.language?.startsWith('zh');

    const { workflowName, setWorkflowName, isRunning, isDirty } = useLangGraphStore();
    const [editingName, setEditingName] = useState(false);

    return (
        <div className="h-12 bg-white border-b flex items-center justify-between px-4">
            {/* Left: Back + Name */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate('/build/apps')}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                {editingName ? (
                    <Input
                        className="w-48 h-8 text-sm"
                        value={workflowName}
                        onChange={(e) => setWorkflowName(e.target.value)}
                        onBlur={() => setEditingName(false)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
                        autoFocus
                    />
                ) : (
                    <span
                        className="text-sm font-semibold cursor-pointer hover:text-blue-500"
                        onClick={() => setEditingName(true)}
                    >
                        {workflowName || (isZh ? '未命名 LangGraph 工作流' : 'Untitled LangGraph Workflow')}
                    </span>
                )}
                <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-600 rounded-full">
                    LangGraph
                </span>
                {isDirty && (
                    <span className="w-2 h-2 rounded-full bg-orange-400" title={isZh ? '未保存' : 'Unsaved'} />
                )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={onSave} disabled={!isDirty}>
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {isZh ? '保存' : 'Save'}
                </Button>
                {isRunning ? (
                    <Button variant="destructive" size="sm" onClick={onStop}>
                        <Square className="w-3.5 h-3.5 mr-1" />
                        {isZh ? '停止' : 'Stop'}
                    </Button>
                ) : (
                    <Button size="sm" onClick={onRun} className="bg-green-600 hover:bg-green-700">
                        <Play className="w-3.5 h-3.5 mr-1" />
                        {isZh ? '运行' : 'Run'}
                    </Button>
                )}
            </div>
        </div>
    );
}
