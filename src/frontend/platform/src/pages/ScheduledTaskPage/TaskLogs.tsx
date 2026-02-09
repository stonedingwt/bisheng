import { LoadingIcon } from "@/components/bs-icons/loading";
import AutoPagination from "@/components/bs-ui/pagination/autoPagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/bs-ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/bs-ui/table";
import { getAllTaskLogsApi } from "@/controllers/API/scheduled_task";
import { useTable } from "@/util/hook";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/bs-ui/button";

export default function TaskLogs() {
    const { t } = useTranslation();
    const [statusFilter, setStatusFilter] = useState('');

    const { page, pageSize, loading, data: logs, total, setPage, filterData } = useTable<any>(
        { pageSize: 20 },
        (param) => getAllTaskLogsApi({ page: param.page, pageSize: param.pageSize, status: param.status })
    );

    const handleStatusFilter = (value: string) => {
        setStatusFilter(value);
        filterData({ status: value === 'all' ? '' : value });
    };

    const formatTime = (t: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('zh-CN');
    };

    const StatusBadge = ({ status }: { status: string }) => {
        if (status === 'success') return (
            <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" /> {t('scheduledTask.statusSuccess')}
            </span>
        );
        if (status === 'failed') return (
            <span className="inline-flex items-center gap-1 text-red-500 text-sm">
                <XCircle className="w-4 h-4" /> {t('scheduledTask.statusFailed')}
            </span>
        );
        return (
            <span className="inline-flex items-center gap-1 text-blue-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> {t('scheduledTask.statusRunning')}
            </span>
        );
    };

    return (
        <div className="relative">
            {loading && (
                <div className="absolute left-0 top-0 z-10 flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.6)] dark:bg-blur-shared">
                    <LoadingIcon />
                </div>
            )}
            <div className="h-[calc(100vh-180px)] overflow-y-auto px-2 py-4 pb-10">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-semibold">{t('scheduledTask.allLogs')}</h2>
                    <div className="flex gap-2">
                        <Select value={statusFilter || 'all'} onValueChange={handleStatusFilter}>
                            <SelectTrigger className="w-[140px]">
                                <SelectValue placeholder={t('scheduledTask.filterStatus')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectItem value="all">{t('scheduledTask.allStatus')}</SelectItem>
                                    <SelectItem value="success">{t('scheduledTask.statusSuccess')}</SelectItem>
                                    <SelectItem value="failed">{t('scheduledTask.statusFailed')}</SelectItem>
                                    <SelectItem value="running">{t('scheduledTask.statusRunning')}</SelectItem>
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>ID</TableHead>
                            <TableHead>{t('scheduledTask.logTaskName')}</TableHead>
                            <TableHead>{t('scheduledTask.logWorkflow')}</TableHead>
                            <TableHead>{t('scheduledTask.logStatus')}</TableHead>
                            <TableHead>{t('scheduledTask.logStartTime')}</TableHead>
                            <TableHead>{t('scheduledTask.logEndTime')}</TableHead>
                            <TableHead>{t('scheduledTask.logDuration')}</TableHead>
                            <TableHead>{t('scheduledTask.logResult')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {logs.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center text-gray-400 py-10">
                                    {t('scheduledTask.noLogs')}
                                </TableCell>
                            </TableRow>
                        )}
                        {logs.map((log: any) => (
                            <TableRow key={log.id}>
                                <TableCell>{log.id}</TableCell>
                                <TableCell className="text-sm">{log.task_name || '-'}</TableCell>
                                <TableCell className="text-sm">{log.workflow_name || log.workflow_id}</TableCell>
                                <TableCell><StatusBadge status={log.status} /></TableCell>
                                <TableCell className="text-sm">{formatTime(log.started_at)}</TableCell>
                                <TableCell className="text-sm">{formatTime(log.finished_at)}</TableCell>
                                <TableCell className="text-sm">
                                    {log.duration_seconds != null ? `${log.duration_seconds}s` : '-'}
                                </TableCell>
                                <TableCell className="max-w-[200px]">
                                    {log.status === 'failed' ? (
                                        <span className="text-red-500 text-xs break-all">{log.error_message}</span>
                                    ) : (
                                        <span className="text-sm text-gray-500">{log.result || '-'}</span>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>

                {total > 0 && (
                    <div className="flex justify-end mt-4">
                        <AutoPagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onChange={(p) => setPage(p)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
