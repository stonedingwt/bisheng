import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import yaml from "js-yaml";
import { Button } from "@/components/bs-ui/button";
import { Input } from "@/components/bs-ui/input";
import { Switch } from "@/components/bs-ui/switch";
import { useToast } from "@/components/bs-ui/toast/use-toast";
import { getSysConfigApi, setSysConfigApi } from "@/controllers/API/user";
import { captureAndAlertRequestErrorHoc } from "@/controllers/request";
import { locationContext } from "@/contexts/locationContext";
import { ChevronDown, ChevronRight, Save } from "lucide-react";

// ============ 可折叠区域组件 ============
function Section({
  title,
  desc,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  desc?: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg bg-card mb-4 overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-muted/50 transition-colors select-none"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          {icon && <span className="text-lg">{icon}</span>}
          <div>
            <p className="font-semibold text-sm">{title}</p>
            {desc && (
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            )}
          </div>
        </div>
        {open ? (
          <ChevronDown className="size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </div>
      {open && (
        <div className="px-5 pb-5 pt-2 border-t space-y-4">{children}</div>
      )}
    </div>
  );
}

// ============ 表单项组件 ============
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-muted-foreground mt-1">{hint}</p>
      )}
    </div>
  );
}

function SwitchField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && (
          <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value ?? ""}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="max-w-[200px]"
        />
        {unit && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">{unit}</span>
        )}
      </div>
    </Field>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="max-w-[500px]"
      />
    </Field>
  );
}

// ============ 默认配置结构 ============
interface SysConfig {
  knowledges?: {
    etl4lm?: {
      url?: string;
      timeout?: number;
      ocr_sdk_url?: string;
    };
  };
  llm_request?: {
    request_timeout?: number;
    max_retries?: number;
  };
  default_operator?: {
    user?: number;
    enable_guest_access?: boolean;
  };
  password_conf?: {
    password_valid_period?: number;
    login_error_time_window?: number;
    max_error_times?: number;
  };
  system_login_method?: {
    allow_multi_login?: boolean;
    gateway_login?: boolean;
    admin_username?: string;
    aad_sso?: any;
    wecom_sso?: any;
  };
  use_captcha?: boolean;
  dialog_tips?: string;
  env?: {
    office_url?: string;
    show_github_and_help?: boolean;
    enable_registration?: boolean;
    uploaded_files_maximum_size?: number;
  };
  workflow?: {
    max_steps?: number;
    timeout?: number;
  };
  linsight?: {
    tool_buffer?: number;
    max_steps?: number;
    retry_num?: number;
    retry_sleep?: number;
    max_file_num?: number;
    max_knowledge_num?: number;
    file_content_length?: number;
    default_temperature?: number;
    retry_temperature?: number;
  };
  [key: string]: any;
}

// ============ 主组件 ============
export default function Config() {
  const { t } = useTranslation();
  const { toast, message } = useToast();
  const { reloadConfig } = useContext(locationContext);

  const [config, setConfig] = useState<SysConfig>({});
  const [rawYaml, setRawYaml] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    captureAndAlertRequestErrorHoc(
      getSysConfigApi().then((jsonstr: string) => {
        setRawYaml(jsonstr);
        try {
          const parsed = yaml.load(jsonstr) as SysConfig;
          setConfig(parsed || {});
        } catch {
          setConfig({});
        }
        setLoading(false);
      })
    );
  }, []);

  // 更新嵌套字段的通用函数
  const update = (path: string[], value: any) => {
    setConfig((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) {
        if (!obj[path[i]]) obj[path[i]] = {};
        obj = obj[path[i]];
      }
      obj[path[path.length - 1]] = value;
      return next;
    });
  };

  // 安全获取嵌套值
  const get = (path: string[], fallback: any = "") => {
    let obj: any = config;
    for (const key of path) {
      if (obj == null) return fallback;
      obj = obj[key];
    }
    return obj ?? fallback;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const yamlStr = yaml.dump(config, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false,
      });
      await captureAndAlertRequestErrorHoc(
        setSysConfigApi({ data: yamlStr }).then(() => {
          message({
            variant: "success",
            title: t("prompt"),
            description: t("saved"),
          });
          reloadConfig();
        })
      );
    } catch {
      toast({
        variant: "error",
        title: t("prompt"),
        description: t("system.configSaveFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-60">
        <p className="text-muted-foreground">{t("system.configLoading")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto py-6 px-2">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold">{t("system.parameterConfig")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("system.configDesc")}
          </p>
        </div>
        <Button
          className="h-10 px-6 text-[#fff] gap-2"
          disabled={saving}
          onClick={handleSave}
        >
          <Save className="size-4" />
          {saving ? t("system.saving") : t("save")}
        </Button>
      </div>

      {/* ===== 知识库配置 ===== */}
      <Section
        title={t("system.cfgKnowledge")}
        desc={t("system.cfgKnowledgeDesc")}
        icon="📚"
      >
        <TextField
          label={t("system.cfgEtl4lmUrl")}
          hint={t("system.cfgEtl4lmUrlHint")}
          value={get(["knowledges", "etl4lm", "url"], "")}
          onChange={(v) => update(["knowledges", "etl4lm", "url"], v)}
          placeholder="http://192.168.106.12:8180/v1/etl4llm/predict"
        />
        <NumberField
          label={t("system.cfgEtl4lmTimeout")}
          hint={t("system.cfgEtl4lmTimeoutHint")}
          value={get(["knowledges", "etl4lm", "timeout"], 600)}
          onChange={(v) => update(["knowledges", "etl4lm", "timeout"], v)}
          min={1}
          unit={t("system.cfgUnitSeconds")}
        />
        <TextField
          label={t("system.cfgOcrSdkUrl")}
          hint={t("system.cfgOcrSdkUrlHint")}
          value={get(["knowledges", "etl4lm", "ocr_sdk_url"], "")}
          onChange={(v) => update(["knowledges", "etl4lm", "ocr_sdk_url"], v)}
          placeholder="http://..."
        />
      </Section>

      {/* ===== LLM 请求配置 ===== */}
      <Section
        title={t("system.cfgLlmRequest")}
        desc={t("system.cfgLlmRequestDesc")}
        icon="🤖"
      >
        <NumberField
          label={t("system.cfgRequestTimeout")}
          hint={t("system.cfgRequestTimeoutHint")}
          value={get(["llm_request", "request_timeout"], 600)}
          onChange={(v) => update(["llm_request", "request_timeout"], v)}
          min={1}
          unit={t("system.cfgUnitSeconds")}
        />
        <NumberField
          label={t("system.cfgMaxRetries")}
          hint={t("system.cfgMaxRetriesHint")}
          value={get(["llm_request", "max_retries"], 1)}
          onChange={(v) => update(["llm_request", "max_retries"], v)}
          min={0}
          unit={t("system.cfgUnitTimes")}
        />
      </Section>

      {/* ===== 默认操作员 ===== */}
      <Section
        title={t("system.cfgDefaultOperator")}
        desc={t("system.cfgDefaultOperatorDesc")}
        icon="👤"
      >
        <NumberField
          label={t("system.cfgOperatorUserId")}
          hint={t("system.cfgOperatorUserIdHint")}
          value={get(["default_operator", "user"], 1)}
          onChange={(v) => update(["default_operator", "user"], v)}
          min={1}
        />
        <SwitchField
          label={t("system.cfgGuestAccess")}
          hint={t("system.cfgGuestAccessHint")}
          checked={get(["default_operator", "enable_guest_access"], true)}
          onChange={(v) =>
            update(["default_operator", "enable_guest_access"], v)
          }
        />
      </Section>

      {/* ===== 密码安全配置 ===== */}
      <Section
        title={t("system.cfgPasswordSecurity")}
        desc={t("system.cfgPasswordSecurityDesc")}
        icon="🔒"
      >
        <NumberField
          label={t("system.cfgPasswordValidPeriod")}
          hint={t("system.cfgPasswordValidPeriodHint")}
          value={get(["password_conf", "password_valid_period"], 200)}
          onChange={(v) =>
            update(["password_conf", "password_valid_period"], v)
          }
          min={0}
          unit={t("system.cfgUnitDays")}
        />
        <NumberField
          label={t("system.cfgLoginErrorWindow")}
          hint={t("system.cfgLoginErrorWindowHint")}
          value={get(["password_conf", "login_error_time_window"], 5)}
          onChange={(v) =>
            update(["password_conf", "login_error_time_window"], v)
          }
          min={0}
          unit={t("system.cfgUnitMinutes")}
        />
        <NumberField
          label={t("system.cfgMaxErrorTimes")}
          hint={t("system.cfgMaxErrorTimesHint")}
          value={get(["password_conf", "max_error_times"], 0)}
          onChange={(v) => update(["password_conf", "max_error_times"], v)}
          min={0}
          unit={t("system.cfgUnitTimes")}
        />
      </Section>

      {/* ===== 登录方式配置 ===== */}
      <Section
        title={t("system.cfgLoginMethod")}
        desc={t("system.cfgLoginMethodDesc")}
        icon="🔑"
      >
        <SwitchField
          label={t("system.cfgMultiLogin")}
          hint={t("system.cfgMultiLoginHint")}
          checked={get(
            ["system_login_method", "allow_multi_login"],
            true
          )}
          onChange={(v) =>
            update(["system_login_method", "allow_multi_login"], v)
          }
        />
        <SwitchField
          label={t("system.cfgGatewayLogin")}
          hint={t("system.cfgGatewayLoginHint")}
          checked={get(
            ["system_login_method", "gateway_login"],
            false
          )}
          onChange={(v) =>
            update(["system_login_method", "gateway_login"], v)
          }
        />
        <TextField
          label={t("system.cfgAdminUsername")}
          hint={t("system.cfgAdminUsernameHint")}
          value={get(
            ["system_login_method", "admin_username"],
            "admin"
          )}
          onChange={(v) =>
            update(["system_login_method", "admin_username"], v)
          }
        />
      </Section>

      {/* ===== 通用配置 ===== */}
      <Section
        title={t("system.cfgGeneral")}
        desc={t("system.cfgGeneralDesc")}
        icon="⚙️"
      >
        <SwitchField
          label={t("system.cfgUseCaptcha")}
          hint={t("system.cfgUseCaptchaHint")}
          checked={!!get(["use_captcha"], true)}
          onChange={(v) => update(["use_captcha"], v)}
        />
        <TextField
          label={t("system.cfgDialogTips")}
          hint={t("system.cfgDialogTipsHint")}
          value={get(["dialog_tips"], "")}
          onChange={(v) => update(["dialog_tips"], v)}
          placeholder="内容由AI生成，仅供参考！"
        />
      </Section>

      {/* ===== 环境配置 ===== */}
      <Section
        title={t("system.cfgEnv")}
        desc={t("system.cfgEnvDesc")}
        icon="🌐"
      >
        <TextField
          label={t("system.cfgOfficeUrl")}
          hint={t("system.cfgOfficeUrlHint")}
          value={get(["env", "office_url"], "")}
          onChange={(v) => update(["env", "office_url"], v)}
          placeholder="http://IP:8701"
        />
        <SwitchField
          label={t("system.cfgShowGithub")}
          hint={t("system.cfgShowGithubHint")}
          checked={get(["env", "show_github_and_help"], true)}
          onChange={(v) => update(["env", "show_github_and_help"], v)}
        />
        <SwitchField
          label={t("system.cfgEnableRegistration")}
          hint={t("system.cfgEnableRegistrationHint")}
          checked={get(["env", "enable_registration"], true)}
          onChange={(v) => update(["env", "enable_registration"], v)}
        />
        <NumberField
          label={t("system.cfgUploadMaxSize")}
          hint={t("system.cfgUploadMaxSizeHint")}
          value={get(["env", "uploaded_files_maximum_size"], 50)}
          onChange={(v) =>
            update(["env", "uploaded_files_maximum_size"], v)
          }
          min={1}
          unit="MB"
        />
      </Section>

      {/* ===== 工作流配置 ===== */}
      <Section
        title={t("system.cfgWorkflow")}
        desc={t("system.cfgWorkflowDesc")}
        icon="🔧"
      >
        <NumberField
          label={t("system.cfgWorkflowMaxSteps")}
          hint={t("system.cfgWorkflowMaxStepsHint")}
          value={get(["workflow", "max_steps"], 50)}
          onChange={(v) => update(["workflow", "max_steps"], v)}
          min={1}
          unit={t("system.cfgUnitSteps")}
        />
        <NumberField
          label={t("system.cfgWorkflowTimeout")}
          hint={t("system.cfgWorkflowTimeoutHint")}
          value={get(["workflow", "timeout"], 5)}
          onChange={(v) => update(["workflow", "timeout"], v)}
          min={1}
          unit={t("system.cfgUnitMinutes")}
        />
      </Section>

      {/* ===== 灵思配置 ===== */}
      <Section
        title={t("system.cfgLinsight")}
        desc={t("system.cfgLinsightDesc")}
        icon="🧠"
        defaultOpen={false}
      >
        <NumberField
          label={t("system.cfgToolBuffer")}
          hint={t("system.cfgToolBufferHint")}
          value={get(["linsight", "tool_buffer"], 100000)}
          onChange={(v) => update(["linsight", "tool_buffer"], v)}
          min={1}
          unit="tokens"
        />
        <NumberField
          label={t("system.cfgLinsightMaxSteps")}
          hint={t("system.cfgLinsightMaxStepsHint")}
          value={get(["linsight", "max_steps"], 200)}
          onChange={(v) => update(["linsight", "max_steps"], v)}
          min={1}
          unit={t("system.cfgUnitSteps")}
        />
        <NumberField
          label={t("system.cfgRetryNum")}
          hint={t("system.cfgRetryNumHint")}
          value={get(["linsight", "retry_num"], 3)}
          onChange={(v) => update(["linsight", "retry_num"], v)}
          min={0}
          unit={t("system.cfgUnitTimes")}
        />
        <NumberField
          label={t("system.cfgRetrySleep")}
          hint={t("system.cfgRetrySleepHint")}
          value={get(["linsight", "retry_sleep"], 5)}
          onChange={(v) => update(["linsight", "retry_sleep"], v)}
          min={0}
          unit={t("system.cfgUnitSeconds")}
        />
        <NumberField
          label={t("system.cfgMaxFileNum")}
          hint={t("system.cfgMaxFileNumHint")}
          value={get(["linsight", "max_file_num"], 5)}
          onChange={(v) => update(["linsight", "max_file_num"], v)}
          min={1}
        />
        <NumberField
          label={t("system.cfgMaxKnowledgeNum")}
          hint={t("system.cfgMaxKnowledgeNumHint")}
          value={get(["linsight", "max_knowledge_num"], 20)}
          onChange={(v) => update(["linsight", "max_knowledge_num"], v)}
          min={1}
        />
        <NumberField
          label={t("system.cfgFileContentLength")}
          hint={t("system.cfgFileContentLengthHint")}
          value={get(["linsight", "file_content_length"], 5000)}
          onChange={(v) => update(["linsight", "file_content_length"], v)}
          min={1}
          unit={t("system.cfgUnitChars")}
        />
        <NumberField
          label={t("system.cfgDefaultTemp")}
          hint={t("system.cfgDefaultTempHint")}
          value={get(["linsight", "default_temperature"], 0)}
          onChange={(v) => update(["linsight", "default_temperature"], v)}
          min={0}
          max={2}
        />
        <NumberField
          label={t("system.cfgRetryTemp")}
          hint={t("system.cfgRetryTempHint")}
          value={get(["linsight", "retry_temperature"], 1)}
          onChange={(v) => update(["linsight", "retry_temperature"], v)}
          min={0}
          max={2}
        />
      </Section>

      {/* 底部保存按钮 */}
      <div className="flex justify-center mt-8 mb-4">
        <Button
          className="h-10 w-[200px] text-[#fff] gap-2"
          disabled={saving}
          onClick={handleSave}
        >
          <Save className="size-4" />
          {saving ? t("system.saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
