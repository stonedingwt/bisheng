import { Button } from "@/components/bs-ui/button";
import { LoadingIcon } from "@/components/bs-icons/loading";
import AutoPagination from "@/components/bs-ui/pagination/autoPagination";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/bs-ui/table";
import { Switch } from "@/components/bs-ui/switch";
import { bsConfirm } from "@/components/bs-ui/alertDialog/useConfirm";
import {
    getScheduledTasksApi, deleteScheduledTaskApi, toggleScheduledTaskApi, runScheduledTaskApi
} from "@/controllers/API/scheduled_task";
import { useTable } from "@/util/hook";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import TaskFormDialog from "./TaskFormDialog";
import TaskLogDialog from "./TaskLogDialog";
import { PlayIcon, Pencil, Trash2, FileText } from "lucide-react";

export default function TaskList() {
    const { t } = useTranslation();
    const { page, pageSize, loading, data: tasks, total, setPage, reload } = useTable<any>(
        { pageSize: 20 },
        (param) => getScheduledTasksApi({ page: param.page, pageSize: param.pageSize, keyword: param.keyword })
    );

    const [formOpen, setFormOpen] = useState(false);
    const [editTask, setEditTask] = useState<any>(null);
    const [logDialogOpen, setLogDialogOpen] = useState(false);
    const [logTaskId, setLogTaskId] = useState<number | null>(null);
    const [logTaskName, setLogTaskName] = useState('');

    const handleCreate = () => {
        setEditTask(null);
        setFormOpen(true);
    };

    const handleEdit = (task: any) => {
        setEditTask(task);
        setFormOpen(true);
    };

    const handleDelete = (task: any) => {
        bsConfirm({
            title: t('prompt'),
            desc: t('scheduledTask.deleteConfirm', { name: task.name }),
            okTxt: t('system.confirm'),
            onOk(next) {
                deleteScheduledTaskApi(task.id).then(() => {
                    reload();
                    next();
                });
            },
        });
    };

    const handleToggle = (task: any) => {
        toggleScheduledTaskApi(task.id).then(() => {
            reload();
        });
    };

    const handleRun = (task: any) => {
        bsConfirm({
            title: t('prompt'),
            desc: t('scheduledTask.runConfirm', { name: task.name }),
            okTxt: t('system.confirm'),
            onOk(next) {
                runScheduledTaskApi(task.id).then(() => {
                    reload();
                    next();
                });
            },
        });
    };

    const handleViewLogs = (task: any) => {
        setLogTaskId(task.id);
        setLogTaskName(task.name);
        setLogDialogOpen(true);
    };

    const formatTime = (t: string) => {
        if (!t) return '-';
        return new Date(t).toLocaleString('zh-CN');
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
                    <h2 className="text-lg font-semibold">{t('scheduledTask.title')}</h2>
                    <Button onClick={handleCreate}>{t('scheduledTask.create')}</Button>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[50px]">ID</TableHead>
                            <TableHead>{t('scheduledTask.name')}</TableHead>
                            <TableHead>{t('scheduledTask.workflow')}</TableHead>
                            <TableHead>{t('scheduledTask.cronExpression')}</TableHead>
                            <TableHead>{t('scheduledTask.status')}</TableHead>
                            <TableHead>{t('scheduledTask.lastRunTime')}</TableHead>
                            <TableHead>{t('scheduledTask.nextRunTime')}</TableHead>
                            <TableHead>{t('scheduledTask.notifyOnFailure')}</TableHead>
                            <TableHead className="text-right">{t('scheduledTask.actions')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tasks.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={9} className="text-center text-gray-400 py-10">
                                    {t('scheduledTask.noData')}
                                </TableCell>
                            </TableRow>
                        )}
                        {tasks.map((task: any) => (
                            <TableRow key={task.id}>
                                <TableCell>{task.id}</TableCell>
                                <TableCell>
                                    <div>
                                        <div className="font-medium">{task.name}</div>
                                        {task.description && (
                                            <div className="text-xs text-gray-400 mt-0.5">{task.description}</div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <span className="text-sm">{task.workflow_name || task.workflow_id}</span>
                                </TableCell>
                                <TableCell>
                                    <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">
                                        {task.cron_expression}
                                    </code>
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        checked={task.status === 'enabled'}
                                        onCheckedChange={() => handleToggle(task)}
                                    />
                                </TableCell>
                                <TableCell className="text-sm">{formatTime(task.last_run_time)}</TableCell>
                                <TableCell className="text-sm">{formatTime(task.next_run_time)}</TableCell>
                                <TableCell>
                                    {task.notify_on_failure ? (
                                        <span className="text-green-600 text-sm">{t('scheduledTask.yes')}</span>
                                    ) : (
                                        <span className="text-gray-400 text-sm">{t('scheduledTask.no')}</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="icon" title={t('scheduledTask.runNow')}
                                            onClick={() => handleRun(task)}>
                                            <PlayIcon className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" title={t('scheduledTask.viewLogs')}
                                            onClick={() => handleViewLogs(task)}>
                                            <FileText className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" title={t('scheduledTask.edit')}
                                            onClick={() => handleEdit(task)}>
                                            <Pencil className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" title={t('scheduledTask.delete')}
                                            onClick={() => handleDelete(task)}
                                            className="text-red-500 hover:text-red-700">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
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

            {formOpen && (
                <TaskFormDialog
                    open={formOpen}
                    task={editTask}
                    onClose={() => setFormOpen(false)}
                    onSuccess={() => { setFormOpen(false); reload(); }}
                />
            )}

            {logDialogOpen && logTaskId && (
                <TaskLogDialog
                    open={logDialogOpen}
                    taskId={logTaskId}
                    taskName={logTaskName}
                    onClose={() => setLogDialogOpen(false)}
                />
            )}
        </div>
    );
}
