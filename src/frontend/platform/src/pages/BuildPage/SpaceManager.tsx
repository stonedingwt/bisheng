/**
 * SpaceManager - 空间管理对话框 (仅管理员)
 * - 创建、编辑、删除空间
 * - 管理每个空间的角色授权 (哪些角色可以访问该空间)
 */
import { Button } from "@/components/bs-ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/bs-ui/dialog";
import { Input } from "@/components/bs-ui/input";
import { Label } from "@/components/bs-ui/label";
import { bsConfirm } from "@/components/bs-ui/alertDialog/useConfirm";
import {
    getSpacesApi, createSpaceApi, updateSpaceApi, deleteSpaceApi,
    getAllRolesApi, getSpaceRolesApi, setSpaceRolesApi
} from "@/controllers/API/workspace_space";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2, Plus, Shield, Check } from "lucide-react";

interface Props {
    open: boolean;
    onClose: () => void;
    onChanged: () => void;
}

const PRESET_COLORS = [
    '#22C55E', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

export default function SpaceManager({ open, onClose, onChanged }: Props) {
    const { t } = useTranslation();
    const [spaces, setSpaces] = useState<any[]>([]);
    const [editSpace, setEditSpace] = useState<any>(null);
    const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);

    // 角色授权相关
    const [allRoles, setAllRoles] = useState<any[]>([]);
    const [roleDialogSpace, setRoleDialogSpace] = useState<any>(null); // 当前正在配置角色的空间
    const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
    const [savingRoles, setSavingRoles] = useState(false);

    const loadSpaces = () => {
        getSpacesApi().then(res => setSpaces(res || []));
    };

    useEffect(() => {
        if (open) {
            loadSpaces();
            // 预加载所有角色
            getAllRolesApi().then(res => setAllRoles(res || [])).catch(() => {});
        }
    }, [open]);

    const handleAdd = () => {
        setEditSpace(null);
        setForm({ name: '', description: '', color: '#3B82F6' });
        setShowForm(true);
    };

    const handleEdit = (space: any) => {
        setEditSpace(space);
        setForm({ name: space.name, description: space.description || '', color: space.color || '#3B82F6' });
        setShowForm(true);
    };

    const handleDelete = (space: any) => {
        if (space.is_default) return;
        bsConfirm({
            title: t('prompt'),
            desc: t('space.deleteConfirm', { name: space.name }),
            okTxt: t('system.confirm'),
            onOk(next) {
                deleteSpaceApi(space.id).then(() => {
                    loadSpaces();
                    onChanged();
                    next();
                });
            },
        });
    };

    const handleSave = async () => {
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            if (editSpace) {
                await updateSpaceApi(editSpace.id, form);
            } else {
                await createSpaceApi(form);
            }
            setShowForm(false);
            loadSpaces();
            onChanged();
        } finally {
            setSaving(false);
        }
    };

    // 打开角色授权对话框
    const handleOpenRoles = async (space: any) => {
        setRoleDialogSpace(space);
        try {
            const roleIds = await getSpaceRolesApi(space.id);
            setSelectedRoleIds(roleIds || []);
        } catch {
            setSelectedRoleIds([]);
        }
    };

    const toggleRole = (roleId: number) => {
        setSelectedRoleIds(prev =>
            prev.includes(roleId)
                ? prev.filter(id => id !== roleId)
                : [...prev, roleId]
        );
    };

    const handleSaveRoles = async () => {
        if (!roleDialogSpace) return;
        setSavingRoles(true);
        try {
            await setSpaceRolesApi(roleDialogSpace.id, selectedRoleIds);
            setRoleDialogSpace(null);
            onChanged();
        } finally {
            setSavingRoles(false);
        }
    };

    return (
        <>
            {/* 主对话框 - 空间管理 */}
            <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
                <DialogContent className="max-w-[560px]">
                    <DialogHeader>
                        <DialogTitle>{t('space.manageSpaces')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {spaces.map(space => (
                            <div key={space.id}
                                className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: space.color || '#3B82F6' }} />
                                    <div>
                                        <div className="font-medium text-sm">{space.name}</div>
                                        {space.description && <div className="text-xs text-gray-400">{space.description}</div>}
                                    </div>
                                    {space.is_default && (
                                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded">
                                            {t('space.default')}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-8 w-8"
                                        title={t('space.manageRoles')}
                                        onClick={() => handleOpenRoles(space)}>
                                        <Shield className="w-4 h-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8"
                                        onClick={() => handleEdit(space)}>
                                        <Pencil className="w-4 h-4" />
                                    </Button>
                                    {!space.is_default && (
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500"
                                            onClick={() => handleDelete(space)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        ))}
                        {!showForm && (
                            <Button variant="outline" className="w-full" onClick={handleAdd}>
                                <Plus className="w-4 h-4 mr-2" /> {t('space.addSpace')}
                            </Button>
                        )}
                        {showForm && (
                            <div className="border rounded-lg p-4 space-y-3 bg-gray-50 dark:bg-gray-900">
                                <h4 className="text-sm font-medium">
                                    {editSpace ? t('space.editSpace') : t('space.addSpace')}
                                </h4>
                                <div>
                                    <Label className="text-xs">{t('space.name')}</Label>
                                    <Input
                                        placeholder={t('space.namePlaceholder')}
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">{t('space.description')}</Label>
                                    <Input
                                        placeholder={t('space.descriptionPlaceholder')}
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">{t('space.color')}</Label>
                                    <div className="flex gap-2 mt-1 flex-wrap">
                                        {PRESET_COLORS.map(c => (
                                            <button key={c} type="button"
                                                className={`w-6 h-6 rounded-full border-2 transition-transform ${form.color === c ? 'border-gray-800 dark:border-white scale-125' : 'border-transparent'}`}
                                                style={{ backgroundColor: c }}
                                                onClick={() => setForm({ ...form, color: c })}
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                                        {t('cancel')}
                                    </Button>
                                    <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
                                        {saving ? t('space.saving') : t('save')}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* 角色授权对话框 */}
            <Dialog open={!!roleDialogSpace} onOpenChange={(v) => { if (!v) setRoleDialogSpace(null); }}>
                <DialogContent className="max-w-[460px]">
                    <DialogHeader>
                        <DialogTitle>
                            {t('space.manageRoles')} - {roleDialogSpace?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-gray-500">{t('space.roleAuthDesc')}</p>
                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                        {allRoles.length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">{t('space.noRoles')}</p>
                        ) : (
                            allRoles.map(role => (
                                <button
                                    key={role.id}
                                    className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                                        selectedRoleIds.includes(role.id)
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                    }`}
                                    onClick={() => toggleRole(role.id)}
                                >
                                    <div>
                                        <div className="text-sm font-medium">{role.role_name}</div>
                                        {role.remark && <div className="text-xs text-gray-400 mt-0.5">{role.remark}</div>}
                                    </div>
                                    {selectedRoleIds.includes(role.id) && (
                                        <Check className="w-5 h-5 text-blue-500 flex-shrink-0" />
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                        <Button variant="outline" onClick={() => setRoleDialogSpace(null)}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleSaveRoles} disabled={savingRoles}>
                            {savingRoles ? t('space.saving') : t('save')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
