import { Button } from "@/components/bs-ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/bs-ui/dialog";
import { Input, InputList } from "@/components/bs-ui/input";
import { Label } from "@/components/bs-ui/label";
import { Switch } from "@/components/bs-ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/bs-ui/select";
import {
    createScheduledTaskApi, updateScheduledTaskApi, getWorkflowsForTaskApi
} from "@/controllers/API/scheduled_task";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
    open: boolean;
    task: any | null;
    onClose: () => void;
    onSuccess: () => void;
}

// 常用 cron 预设
const cronPresets = [
    { label: '每分钟', value: '* * * * *' },
    { label: '每5分钟', value: '*/5 * * * *' },
    { label: '每30分钟', value: '*/30 * * * *' },
    { label: '每小时', value: '0 * * * *' },
    { label: '每天 9:00', value: '0 9 * * *' },
    { label: '每天 18:00', value: '0 18 * * *' },
    { label: '工作日 9:00', value: '0 9 * * 1-5' },
    { label: '每周一 9:00', value: '0 9 * * 1' },
    { label: '每月1号 9:00', value: '0 9 1 * *' },
];

export default function TaskFormDialog({ open, task, onClose, onSuccess }: Props) {
    const { t } = useTranslation();
    const isEdit = !!task;

    const [form, setForm] = useState({
        name: '',
        description: '',
        workflow_id: '',
        cron_expression: '0 9 * * *',
        notify_on_failure: false,
        notify_email: '',
        smtp_server: '',
        smtp_port: 465,
        smtp_user: '',
        smtp_password: '',
    });
    const [workflows, setWorkflows] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [showSmtp, setShowSmtp] = useState(false);

    useEffect(() => {
        getWorkflowsForTaskApi().then((res: any) => {
            setWorkflows(res || []);
        });
    }, []);

    useEffect(() => {
        if (task) {
            setForm({
                name: task.name || '',
                description: task.description || '',
                workflow_id: task.workflow_id || '',
                cron_expression: task.cron_expression || '0 9 * * *',
                notify_on_failure: task.notify_on_failure || false,
                notify_email: task.notify_email || '',
                smtp_server: task.smtp_server || '',
                smtp_port: task.smtp_port || 465,
                smtp_user: task.smtp_user || '',
                smtp_password: task.smtp_password || '',
            });
            setShowSmtp(task.notify_on_failure || false);
        }
    }, [task]);

    const validate = () => {
        const errs: Record<string, string> = {};
        if (!form.name.trim()) errs.name = t('scheduledTask.nameRequired');
        if (!form.workflow_id) errs.workflow_id = t('scheduledTask.workflowRequired');
        if (!form.cron_expression.trim()) errs.cron_expression = t('scheduledTask.cronRequired');
        if (form.notify_on_failure && !form.notify_email.trim()) errs.notify_email = t('scheduledTask.emailRequired');
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        try {
            if (isEdit) {
                await updateScheduledTaskApi(task.id, form);
            } else {
                await createScheduledTaskApi(form);
            }
            onSuccess();
        } catch (e: any) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: string, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
            <DialogContent className="max-w-[600px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t('scheduledTask.editTask') : t('scheduledTask.createTask')}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    {/* 任务名称 */}
                    <div className="grid gap-2">
                        <Label>{t('scheduledTask.name')} *</Label>
                        <Input
                            placeholder={t('scheduledTask.namePlaceholder')}
                            value={form.name}
                            onChange={(e) => updateField('name', e.target.value)}
                        />
                        {errors.name && <span className="text-red-500 text-xs">{errors.name}</span>}
                    </div>

                    {/* 任务描述 */}
                    <div className="grid gap-2">
                        <Label>{t('scheduledTask.description')}</Label>
                        <Input
                            placeholder={t('scheduledTask.descriptionPlaceholder')}
                            value={form.description}
                            onChange={(e) => updateField('description', e.target.value)}
                        />
                    </div>

                    {/* 选择工作流 */}
                    <div className="grid gap-2">
                        <Label>{t('scheduledTask.workflow')} *</Label>
                        <Select value={form.workflow_id} onValueChange={(v) => updateField('workflow_id', v)}>
                            <SelectTrigger>
                                <SelectValue placeholder={t('scheduledTask.selectWorkflow')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {workflows.map((w: any) => (
                                        <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        {errors.workflow_id && <span className="text-red-500 text-xs">{errors.workflow_id}</span>}
                    </div>

                    {/* Cron 表达式 */}
                    <div className="grid gap-2">
                        <Label>{t('scheduledTask.cronExpression')} *</Label>
                        <Input
                            placeholder="0 9 * * *"
                            value={form.cron_expression}
                            onChange={(e) => updateField('cron_expression', e.target.value)}
                        />
                        {errors.cron_expression && <span className="text-red-500 text-xs">{errors.cron_expression}</span>}
                        <div className="flex flex-wrap gap-1 mt-1">
                            {cronPresets.map(preset => (
                                <button
                                    key={preset.value}
                                    type="button"
                                    className={`text-xs px-2 py-1 rounded border cursor-pointer transition-colors
                                        ${form.cron_expression === preset.value
                                            ? 'bg-primary text-white border-primary'
                                            : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600'
                                        }`}
                                    onClick={() => updateField('cron_expression', preset.value)}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-gray-400">{t('scheduledTask.cronHelp')}</p>
                    </div>

                    {/* 失败通知 */}
                    <div className="grid gap-2">
                        <div className="flex items-center gap-2">
                            <Switch
                                checked={form.notify_on_failure}
                                onCheckedChange={(v) => {
                                    updateField('notify_on_failure', v);
                                    setShowSmtp(v);
                                }}
                            />
                            <Label>{t('scheduledTask.notifyOnFailure')}</Label>
                        </div>
                    </div>

                    {showSmtp && (
                        <>
                            <div className="grid gap-2">
                                <Label>{t('scheduledTask.notifyEmail')} *</Label>
                                <Input
                                    placeholder={t('scheduledTask.notifyEmailPlaceholder')}
                                    value={form.notify_email}
                                    onChange={(e) => updateField('notify_email', e.target.value)}
                                />
                                {errors.notify_email && <span className="text-red-500 text-xs">{errors.notify_email}</span>}
                            </div>

                            <div className="border rounded-md p-3 mt-1">
                                <h4 className="text-sm font-medium mb-2">{t('scheduledTask.smtpConfig')}</h4>
                                <div className="grid gap-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <Label className="text-xs">{t('scheduledTask.smtpServer')}</Label>
                                            <Input
                                                placeholder="smtp.example.com"
                                                value={form.smtp_server}
                                                onChange={(e) => updateField('smtp_server', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">{t('scheduledTask.smtpPort')}</Label>
                                            <Input
                                                type="number"
                                                placeholder="465"
                                                value={String(form.smtp_port)}
                                                onChange={(e) => updateField('smtp_port', parseInt(e.target.value) || 465)}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Label className="text-xs">{t('scheduledTask.smtpUser')}</Label>
                                        <Input
                                            placeholder={t('scheduledTask.smtpUserPlaceholder')}
                                            value={form.smtp_user}
                                            onChange={(e) => updateField('smtp_user', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-xs">{t('scheduledTask.smtpPassword')}</Label>
                                        <Input
                                            type="password"
                                            placeholder={t('scheduledTask.smtpPasswordPlaceholder')}
                                            value={form.smtp_password}
                                            onChange={(e) => updateField('smtp_password', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? t('scheduledTask.saving') : t('save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
