import { Button } from "@/components/bs-ui/button";
import { LoadingIcon } from "@/components/bs-icons/loading";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/bs-ui/dialog";
import AutoPagination from "@/components/bs-ui/pagination/autoPagination";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/bs-ui/table";
import { getTaskLogsApi } from "@/controllers/API/scheduled_task";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface Props {
    open: boolean;
    taskId: number;
    taskName: string;
    onClose: () => void;
}

export default function TaskLogDialog({ open, taskId, taskName, onClose }: Props) {
    const { t } = useTranslation();
    const [logs, setLogs] = useState<any[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const loadLogs = (p: number) => {
        setLoading(true);
        getTaskLogsApi(taskId, { page: p, pageSize: 10 }).then(res => {
            setLogs(res.data || []);
            setTotal(res.total || 0);
            setLoading(false);
        }).catch(() => setLoading(false));
    };

    useEffect(() => {
        if (open && taskId) {
            loadLogs(page);
        }
    }, [open, taskId, page]);

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
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-[800px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('scheduledTask.logsTitle', { name: taskName })}</DialogTitle>
                </DialogHeader>
                <div className="relative">
                    {loading && (
                        <div className="absolute left-0 top-0 z-10 flex h-full w-full items-center justify-center bg-[rgba(255,255,255,0.6)] dark:bg-blur-shared">
                            <LoadingIcon />
                        </div>
                    )}
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>ID</TableHead>
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
                                    <TableCell colSpan={6} className="text-center text-gray-400 py-10">
                                        {t('scheduledTask.noLogs')}
                                    </TableCell>
                                </TableRow>
                            )}
                            {logs.map((log: any) => (
                                <TableRow key={log.id}>
                                    <TableCell>{log.id}</TableCell>
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
                                pageSize={10}
                                total={total}
                                onChange={(p) => setPage(p)}
                            />
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
