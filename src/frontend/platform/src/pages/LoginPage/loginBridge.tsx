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

// 企业微信图标组件
function WecomIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10.2 3C6.2 3 3 5.9 3 9.5c0 2 1 3.8 2.6 5l-.5 1.8c-.1.2.2.4.4.3L8 15.4c.7.2 1.4.3 2.2.3.3 0 .6 0 .9-.1-.2-.5-.3-1.1-.3-1.7 0-3.3 3-6 6.7-6 .2 0 .3 0 .5 0C17.3 5.5 14 3 10.2 3z" />
            <path d="M21 13.9c0-2.8-2.7-5-6-5s-6 2.2-6 5 2.7 5 6 5c.6 0 1.2-.1 1.8-.2l2 1c.2.1.4-.1.3-.3l-.4-1.5C20.1 16.9 21 15.5 21 13.9z" opacity="0.85" />
        </svg>
    );
}

export default function LoginBridge({ onHasLdap, aadEnabled = false, wecomEnabled = false, onWecomQrClick }: {
    onHasLdap: (v: boolean) => void;
    aadEnabled?: boolean;
    wecomEnabled?: boolean;
    onWecomQrClick?: () => void;
}) {

    const { t } = useTranslation()

    const [ssoUrl, setSsoUrl] = useState<string>('')
    const [wxUrl, setWxUrl] = useState<string>('')
    const [hasAad, setHasAad] = useState<boolean>(aadEnabled)
    const [hasWecom, setHasWecom] = useState<boolean>(wecomEnabled)

    useEffect(() => {
        getSSOurlApi().then((urls: any) => {
            setSsoUrl(urls.sso)
            setWxUrl(urls.wx)
            urls.ldap && onHasLdap(true)
            if (urls.aad) setHasAad(true)
            if (urls.wecom) setHasWecom(true)
        }).catch(() => {
            // 如果 API 不可用，仅依赖 prop
        })
    }, [])

    if (!ssoUrl && !wxUrl && !hasAad && !hasWecom) return null

    const handleAadLogin = () => {
        location.href = `${__APP_ENV__.BASE_URL}/api/v1/oauth2/aad/login`
    }

    const handleWecomClick = () => {
        // 优先使用嵌入式扫码，回退到跳转方式
        if (onWecomQrClick) {
            onWecomQrClick();
        } else {
            location.href = `${__APP_ENV__.BASE_URL}/api/v1/oauth2/wecom/login`;
        }
    }

    return <div>
        <Separator className="my-4" text={t('login.otherMethods')}></Separator>
        <div className="flex justify-center items-center gap-4 flex-wrap">
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
            {hasWecom && (
                <Button
                    variant="outline"
                    className="rounded-full h-[40px] px-4 gap-2 hover:bg-[#07C160] hover:text-white hover:border-[#07C160]"
                    onClick={handleWecomClick}
                >
                    <WecomIcon />
                    <span className="text-sm">{t('login.wecomLogin')}</span>
                </Button>
            )}
            {wxUrl && <Button size="icon" variant="ghost" onClick={() => location.href = wxUrl}><Wxpro /></Button>}
        </div>
    </div>
};
