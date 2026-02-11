import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLangGraphStore } from './store';
import { Database, MessageSquare, Variable, Activity } from 'lucide-react';

export default function StateInspector() {
    const { i18n } = useTranslation();
    const isZh = i18n.language?.startsWith('zh');
    const { stateData, streamEvents, isRunning } = useLangGraphStore();

    const messages = stateData?.messages || [];
    const variables = stateData?.variables || {};
    const metadata = stateData?.metadata || {};

    return (
        <div className="w-72 bg-white border-l flex flex-col h-full overflow-hidden">
            <div className="px-3 py-3 border-b flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-700">
                    {isZh ? '状态检查器' : 'State Inspector'}
                </h3>
                {isRunning && (
                    <span className="ml-auto flex items-center gap-1 text-[10px] text-green-600">
                        <Activity className="w-3 h-3 animate-pulse" />
                        {isZh ? '运行中' : 'Running'}
                    </span>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Messages */}
                <div className="border-b">
                    <div className="px-3 py-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {isZh ? '消息历史' : 'Messages'} ({messages.length})
                    </div>
                    <div className="px-3 pb-2 space-y-1.5 max-h-48 overflow-y-auto">
                        {messages.length === 0 ? (
                            <p className="text-[11px] text-gray-300 italic">{isZh ? '暂无消息' : 'No messages'}</p>
                        ) : (
                            messages.slice(-10).map((msg: any, idx: number) => (
                                <div
                                    key={idx}
                                    className={`text-[11px] p-1.5 rounded ${
                                        msg.type === 'HumanMessage'
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'bg-gray-50 text-gray-700'
                                    }`}
                                >
                                    <span className="font-medium">{msg.type === 'HumanMessage' ? 'Human' : 'AI'}:</span>{' '}
                                    {(msg.content || '').slice(0, 200)}
                                    {(msg.content || '').length > 200 && '...'}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Variables */}
                <div className="border-b">
                    <div className="px-3 py-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <Variable className="w-3.5 h-3.5" />
                        {isZh ? '变量' : 'Variables'}
                    </div>
                    <div className="px-3 pb-2 max-h-48 overflow-y-auto">
                        {Object.keys(variables).length === 0 ? (
                            <p className="text-[11px] text-gray-300 italic">{isZh ? '暂无变量' : 'No variables'}</p>
                        ) : (
                            <table className="w-full text-[11px]">
                                <tbody>
                                    {Object.entries(variables).map(([nodeId, vars]: [string, any]) => (
                                        Object.entries(vars || {}).map(([key, value]: [string, any]) => (
                                            <tr key={`${nodeId}.${key}`} className="border-b border-gray-50">
                                                <td className="py-1 pr-2 font-mono text-gray-500 truncate max-w-[80px]">{nodeId}.{key}</td>
                                                <td className="py-1 text-gray-700 truncate max-w-[120px]">{String(value).slice(0, 100)}</td>
                                            </tr>
                                        ))
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Events Log */}
                <div>
                    <div className="px-3 py-2 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        <Activity className="w-3.5 h-3.5" />
                        {isZh ? '执行日志' : 'Events'} ({streamEvents.length})
                    </div>
                    <div className="px-3 pb-2 space-y-1 max-h-64 overflow-y-auto">
                        {streamEvents.slice(-20).map((event: any, idx: number) => (
                            <div key={idx} className="text-[10px] text-gray-400 font-mono">
                                <span className={
                                    event.event_type === 'error' ? 'text-red-500' :
                                    event.event_type === 'node_start' ? 'text-green-500' :
                                    event.event_type === 'node_end' ? 'text-blue-500' :
                                    'text-gray-400'
                                }>
                                    [{event.event_type}]
                                </span>{' '}
                                {event.node_id || ''} {event.data ? JSON.stringify(event.data).slice(0, 80) : ''}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
