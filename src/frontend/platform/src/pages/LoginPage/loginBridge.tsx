import Separator from "@/components/bs-comp/chatComponent/Separator";
import { Button } from "@/components/bs-ui/button";
import { getSSOurlApi } from "@/controllers/API/pro";
import { useEffect, useState } from "react";
//@ts-ignore
import Wxpro from "./icons/wxpro.svg?react";
import { useTranslation } from "react-i18next";

// AAD (Azure AD) 图标组件
function AadIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M12 2L2 7v6.5c0 5.25 4.25 10.15 10 11.5 5.75-1.35 10-6.25 10-11.5V7L12 2zm0 2.18l7 3.82v5.5c0 4.07-3.06 7.88-7 9.17-3.94-1.29-7-5.1-7-9.17V8l7-3.82z" />
            <path d="M12 6.5L7 9v4c0 2.76 2.01 5.44 5 6.35 2.99-.91 5-3.59 5-6.35V9l-5-2.5z" opacity="0.6" />
        </svg>
    );
}

export default function LoginBridge({ onHasLdap, aadEnabled = false }) {

    const { t } = useTranslation()

    const [ssoUrl, setSsoUrl] = useState<string>('')
    const [wxUrl, setWxUrl] = useState<string>('')
    const [hasAad, setHasAad] = useState<boolean>(aadEnabled)

    useEffect(() => {
        getSSOurlApi().then((urls: any) => {
            setSsoUrl(urls.sso) // TODO: 携带重定向链接：localStorage.getItem('LOGIN_PATHNAME')
            setWxUrl(urls.wx)
            urls.ldap && onHasLdap(true)
            if (urls.aad) setHasAad(true)
        }).catch(() => {
            // 如果 API 不可用，仅依赖 aadEnabled prop
        })
    }, [])

    if (!ssoUrl && !wxUrl && !hasAad) return null

    const handleAadLogin = () => {
        location.href = `${__APP_ENV__.BASE_URL}/api/v1/oauth2/aad/login`
    }

    return <div>
        <Separator className="my-4" text={t('login.otherMethods')}></Separator>
        <div className="flex justify-center items-center gap-4">
            {ssoUrl && <Button size="icon" className="rounded-full" onClick={() => location.href = ssoUrl}>SSO</Button>}
            {hasAad && (
                <Button
                    variant="outline"
                    className="rounded-full h-[40px] px-4 gap-2 hover:bg-primary hover:text-primary-foreground"
                    onClick={handleAadLogin}
                >
                    <AadIcon />
                    <span className="text-sm">{t('login.aadLogin')}</span>
                </Button>
            )}
            {wxUrl && <Button size="icon" variant="ghost" onClick={() => location.href = wxUrl}><Wxpro /></Button>}
        </div>
    </div>
};
