import { useEffect, useState, useContext } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/bs-ui/button";
import { Input } from "@/components/bs-ui/input";
import { PassInput } from "@/components/bs-ui/input";
import { Switch } from "@/components/bs-ui/switch";
import { useToast } from "@/components/bs-ui/toast/use-toast";
import { captureAndAlertRequestErrorHoc } from "@/controllers/request";
import { getWecomSsoConfigApi, saveWecomSsoConfigApi } from "@/controllers/API/user";
import { locationContext } from "@/contexts/locationContext";

interface WecomConfig {
    enabled: boolean;
    corp_id: string;
    agent_id: string;
    secret: string;
    redirect_uri: string;
}

export default function WecomSsoConfig() {
    const { t } = useTranslation();
    const { toast, message } = useToast();
    const { reloadConfig } = useContext(locationContext);

    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<WecomConfig>({
        enabled: false,
        corp_id: '',
        agent_id: '',
        secret: '',
        redirect_uri: '',
    });

    useEffect(() => {
        captureAndAlertRequestErrorHoc(
            getWecomSsoConfigApi().then((data: any) => {
                setConfig({
                    enabled: data.enabled || false,
                    corp_id: data.corp_id || '',
                    agent_id: data.agent_id || '',
                    secret: data.secret || '',
                    redirect_uri: data.redirect_uri || '',
                });
            })
        );
    }, []);

    const handleSave = async () => {
        if (config.enabled) {
            if (!config.corp_id.trim()) {
                return message({ variant: 'warning', title: t('prompt'), description: [t('system.wecomCorpIdRequired')] });
            }
            if (!config.agent_id.trim()) {
                return message({ variant: 'warning', title: t('prompt'), description: [t('system.wecomAgentIdRequired')] });
            }
            if (!config.secret.trim()) {
                return message({ variant: 'warning', title: t('prompt'), description: [t('system.wecomSecretRequired')] });
            }
            if (!config.redirect_uri.trim()) {
                return message({ variant: 'warning', title: t('prompt'), description: [t('system.wecomRedirectUriRequired')] });
            }
        }

        setLoading(true);
        captureAndAlertRequestErrorHoc(
            saveWecomSsoConfigApi(config).then(() => {
                message({ variant: 'success', title: t('prompt'), description: [t('saved')] });
                reloadConfig();
            })
        ).finally(() => setLoading(false));
    };

    const updateField = (field: keyof WecomConfig, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="max-w-[600px] mx-auto mt-8">
            <p className="font-bold text-lg mb-6">{t('system.wecomSsoConfig')}</p>

            {/* 启用开关 */}
            <div className="flex items-center justify-between py-4 border-b">
                <div>
                    <p className="font-medium text-sm">{t('system.wecomEnable')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('system.wecomEnableDesc')}</p>
                </div>
                <Switch
                    checked={config.enabled}
                    onCheckedChange={(checked) => updateField('enabled', checked)}
                />
            </div>

            {/* 配置表单 */}
            <div className={`space-y-5 mt-6 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                {/* Corp ID */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">
                        {t('system.wecomCorpId')} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        placeholder={t('system.wecomCorpIdPlaceholder')}
                        value={config.corp_id}
                        onChange={(e) => updateField('corp_id', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.wecomCorpIdHint')}</p>
                </div>

                {/* Agent ID */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">
                        {t('system.wecomAgentId')} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        placeholder={t('system.wecomAgentIdPlaceholder')}
                        value={config.agent_id}
                        onChange={(e) => updateField('agent_id', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.wecomAgentIdHint')}</p>
                </div>

                {/* Secret */}
                <div>
                    <PassInput
                        label={t('system.wecomSecret')}
                        placeholder={t('system.wecomSecretPlaceholder')}
                        value={config.secret}
                        onChange={(e) => updateField('secret', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.wecomSecretHint')}</p>
                </div>

                {/* Redirect URI */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">
                        {t('system.wecomRedirectUri')} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        placeholder="https://your-domain/api/v1/oauth2/wecom/callback"
                        value={config.redirect_uri}
                        onChange={(e) => updateField('redirect_uri', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.wecomRedirectUriHint')}</p>
                </div>
            </div>

            {/* 保存按钮 */}
            <div className="flex justify-center mt-8">
                <Button
                    className="h-10 w-[200px] text-[#fff]"
                    disabled={loading}
                    onClick={handleSave}
                >
                    {loading ? t('system.saving') : t('save')}
                </Button>
            </div>

            {/* 帮助说明 */}
            <div className="mt-8 p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium mb-2">{t('system.wecomHelpTitle')}</p>
                <ol className="list-decimal list-inside space-y-1">
                    <li>{t('system.wecomHelpStep1')}</li>
                    <li>{t('system.wecomHelpStep2')}</li>
                    <li>{t('system.wecomHelpStep3')}</li>
                    <li>{t('system.wecomHelpStep4')}</li>
                    <li>{t('system.wecomHelpStep5')}</li>
                </ol>
            </div>
        </div>
    );
}
