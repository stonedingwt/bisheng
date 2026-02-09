import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/bs-ui/button";
import { Input } from "@/components/bs-ui/input";
import { PassInput } from "@/components/bs-ui/input";
import { Switch } from "@/components/bs-ui/switch";
import { useToast } from "@/components/bs-ui/toast/use-toast";
import { captureAndAlertRequestErrorHoc } from "@/controllers/request";
import { getAadSsoConfigApi, saveAadSsoConfigApi } from "@/controllers/API/user";
import { useContext } from "react";
import { locationContext } from "@/contexts/locationContext";

interface AadConfig {
    enabled: boolean;
    client_id: string;
    client_secret: string;
    tenant_id: string;
    redirect_uri: string;
}

export default function AadSsoConfig() {
    const { t } = useTranslation();
    const { toast, message } = useToast();
    const { reloadConfig } = useContext(locationContext);

    const [loading, setLoading] = useState(false);
    const [config, setConfig] = useState<AadConfig>({
        enabled: false,
        client_id: '',
        client_secret: '',
        tenant_id: '',
        redirect_uri: '',
    });

    useEffect(() => {
        captureAndAlertRequestErrorHoc(
            getAadSsoConfigApi().then((data: any) => {
                setConfig({
                    enabled: data.enabled || false,
                    client_id: data.client_id || '',
                    client_secret: data.client_secret || '',
                    tenant_id: data.tenant_id || '',
                    redirect_uri: data.redirect_uri || '',
                });
            })
        );
    }, []);

    const handleSave = async () => {
        // 基本校验
        if (config.enabled) {
            if (!config.client_id.trim()) {
                return message({ variant: 'warning', title: t('prompt'), description: [t('system.aadClientIdRequired')] });
            }
            if (!config.tenant_id.trim()) {
                return message({ variant: 'warning', title: t('prompt'), description: [t('system.aadTenantIdRequired')] });
            }
            if (!config.redirect_uri.trim()) {
                return message({ variant: 'warning', title: t('prompt'), description: [t('system.aadRedirectUriRequired')] });
            }
        }

        setLoading(true);
        captureAndAlertRequestErrorHoc(
            saveAadSsoConfigApi(config).then(() => {
                message({ variant: 'success', title: t('prompt'), description: [t('saved')] });
                reloadConfig();
            })
        ).finally(() => setLoading(false));
    };

    const updateField = (field: keyof AadConfig, value: any) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="max-w-[600px] mx-auto mt-8">
            <p className="font-bold text-lg mb-6">{t('system.aadSsoConfig')}</p>

            {/* 启用开关 */}
            <div className="flex items-center justify-between py-4 border-b">
                <div>
                    <p className="font-medium text-sm">{t('system.aadEnable')}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t('system.aadEnableDesc')}</p>
                </div>
                <Switch
                    checked={config.enabled}
                    onCheckedChange={(checked) => updateField('enabled', checked)}
                />
            </div>

            {/* 配置表单 */}
            <div className={`space-y-5 mt-6 transition-opacity ${config.enabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                {/* Tenant ID */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">
                        {t('system.aadTenantId')} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        placeholder={t('system.aadTenantIdPlaceholder')}
                        value={config.tenant_id}
                        onChange={(e) => updateField('tenant_id', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.aadTenantIdHint')}</p>
                </div>

                {/* Client ID */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">
                        {t('system.aadClientId')} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        placeholder={t('system.aadClientIdPlaceholder')}
                        value={config.client_id}
                        onChange={(e) => updateField('client_id', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.aadClientIdHint')}</p>
                </div>

                {/* Client Secret */}
                <div>
                    <PassInput
                        label={t('system.aadClientSecret')}
                        placeholder={t('system.aadClientSecretPlaceholder')}
                        value={config.client_secret}
                        onChange={(e) => updateField('client_secret', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.aadClientSecretHint')}</p>
                </div>

                {/* Redirect URI */}
                <div>
                    <label className="block text-sm font-medium mb-1.5">
                        {t('system.aadRedirectUri')} <span className="text-red-500">*</span>
                    </label>
                    <Input
                        placeholder="https://your-domain/api/v1/oauth2/aad/callback"
                        value={config.redirect_uri}
                        onChange={(e) => updateField('redirect_uri', e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t('system.aadRedirectUriHint')}</p>
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
                <p className="font-medium mb-2">{t('system.aadHelpTitle')}</p>
                <ol className="list-decimal list-inside space-y-1">
                    <li>{t('system.aadHelpStep1')}</li>
                    <li>{t('system.aadHelpStep2')}</li>
                    <li>{t('system.aadHelpStep3')}</li>
                    <li>{t('system.aadHelpStep4')}</li>
                </ol>
            </div>
        </div>
    );
}
