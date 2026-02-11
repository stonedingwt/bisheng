import { useLangGraphStore } from './store';
import { useTranslation } from 'react-i18next';
import { Clock, ChevronRight } from 'lucide-react';

export default function DebugTimeline() {
    const { i18n } = useTranslation();
    const isZh = i18n.language?.startsWith('zh');
    const { checkpoints, streamEvents } = useLangGraphStore();

    // Build timeline from stream events
    const timelineItems = streamEvents
        .filter((e: any) => ['node_start', 'node_end', 'human_input', 'workflow_start', 'workflow_end'].includes(e.event_type))
        .map((e: any, idx: number) => ({
            id: idx,
            type: e.event_type,
            nodeId: e.node_id,
            nodeName: e.node_name || e.node_id,
            timestamp: e.timestamp,
        }));

    if (timelineItems.length === 0) {
        return (
            <div className="h-10 bg-gray-50 border-t flex items-center justify-center">
                <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {isZh ? '运行后显示调试时间线' : 'Debug timeline appears after execution'}
                </span>
            </div>
        );
    }

    return (
        <div className="h-14 bg-white border-t flex items-center px-4 overflow-x-auto">
            <Clock className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
            <div className="flex items-center gap-1">
                {timelineItems.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-1">
                        <div
                            className={`px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                                item.type === 'workflow_start' ? 'bg-green-100 text-green-600' :
                                item.type === 'workflow_end' ? 'bg-red-100 text-red-600' :
                                item.type === 'node_start' ? 'bg-blue-100 text-blue-600' :
                                item.type === 'node_end' ? 'bg-purple-100 text-purple-600' :
                                item.type === 'human_input' ? 'bg-pink-100 text-pink-600' :
                                'bg-gray-100 text-gray-600'
                            }`}
                            title={`${item.type} - ${item.nodeName || ''}`}
                        >
                            {item.type === 'workflow_start' ? (isZh ? '开始' : 'Start') :
                             item.type === 'workflow_end' ? (isZh ? '结束' : 'End') :
                             item.nodeName || item.nodeId || item.type}
                        </div>
                        {idx < timelineItems.length - 1 && (
                            <ChevronRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
