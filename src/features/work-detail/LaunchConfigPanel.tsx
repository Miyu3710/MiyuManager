import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { CheckCircle2, FolderOpen, Play, Save, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../../design-system/components/Button";
import {
  pickDirectory,
  pickExecutable,
  saveLaunchConfig,
  validateLaunchConfig,
} from "../../lib/library-api";
import type {
  LaunchConfigInput,
  LaunchProfile,
  LibraryItemDetail,
  MonitorInfo,
  ValidationReport,
} from "../../lib/library-types";

const schema = z.object({
  exePath: z.string().trim().min(1, "需要选择可执行文件"),
  workingDir: z.string().trim().min(1, "需要选择工作目录"),
  argsText: z.string().max(16_000),
  envText: z.string().max(16_000),
  wrapperPath: z.string().max(4096),
  wrapperArgsText: z.string().max(16_000),
  monitor: z.string(),
  fullscreen: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function defaultProfile(detail: LibraryItemDetail): LaunchProfile {
  return (
    detail.launchProfile ?? {
      args: [],
      env: [],
      wrapperPath: null,
      wrapperArgs: [],
      monitor: null,
      fullscreen: false,
    }
  );
}

function valuesFrom(detail: LibraryItemDetail): FormValues {
  const profile = defaultProfile(detail);
  return {
    exePath: detail.exePath,
    workingDir: detail.workingDir,
    argsText: profile.args.join("\n"),
    envText: profile.env.map((variable) => variable.key + "=" + variable.value).join("\n"),
    wrapperPath: profile.wrapperPath ?? "",
    wrapperArgsText: profile.wrapperArgs.join("\n"),
    monitor: profile.monitor === null ? "" : String(profile.monitor),
    fullscreen: profile.fullscreen,
  };
}

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEnv(value: string): LaunchProfile["env"] {
  return parseLines(value).map((line) => {
    const index = line.indexOf("=");
    if (index < 1) {
      throw new Error("环境变量需要写成 KEY=VALUE：" + line);
    }
    return { key: line.slice(0, index).trim(), value: line.slice(index + 1) };
  });
}

function toConfig(values: FormValues): LaunchConfigInput {
  return {
    exePath: values.exePath.trim(),
    workingDir: values.workingDir.trim(),
    profile: {
      args: parseLines(values.argsText),
      env: parseEnv(values.envText),
      wrapperPath: values.wrapperPath.trim() || null,
      wrapperArgs: parseLines(values.wrapperArgsText),
      monitor: values.monitor === "" ? null : Number(values.monitor),
      fullscreen: values.fullscreen,
    },
  };
}

function CheckRow({ label, check }: { label: string; check: ValidationReport["exe"] | null }) {
  if (!check) {
    return null;
  }
  return (
    <div className="detail-check-row">
      {check.ok ? (
        <CheckCircle2 size={14} strokeWidth={1.6} className="is-ok" />
      ) : (
        <XCircle size={14} strokeWidth={1.6} className="is-error" />
      )}
      <span>{label}</span>
      <p title={check.path}>{check.message}</p>
    </div>
  );
}

interface LaunchConfigPanelProps {
  detail: LibraryItemDetail;
  monitors: MonitorInfo[];
  onSaved: () => void;
  onLaunch: () => void;
}

export function LaunchConfigPanel({ detail, monitors, onSaved, onLaunch }: LaunchConfigPanelProps) {
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: valuesFrom(detail),
  });
  const [report, setReport] = useState<ValidationReport | null>(null);

  const buildConfig = () => {
    try {
      return toConfig(getValues());
    } catch (error) {
      toast.error(String(error));
      return null;
    }
  };

  const validate = async () => {
    const config = buildConfig();
    if (!config) {
      return;
    }
    try {
      const result = await validateLaunchConfig(detail.workId, config);
      setReport(result);
      if (result.valid) {
        toast.success("启动路径校验通过");
      } else {
        toast.error("启动路径存在问题，请查看校验结果");
      }
    } catch (error) {
      setReport(null);
      toast.error(String(error));
    }
  };

  const save = handleSubmit(async (values) => {
    let config: LaunchConfigInput;
    try {
      config = toConfig(values);
    } catch (error) {
      toast.error(String(error));
      return;
    }
    try {
      await saveLaunchConfig(detail.workId, config);
      toast.success("启动配置已保存");
      onSaved();
    } catch (error) {
      toast.error(String(error));
    }
  });

  const saveAndLaunch = handleSubmit(async (values) => {
    let config: LaunchConfigInput;
    try {
      config = toConfig(values);
    } catch (error) {
      toast.error(String(error));
      return;
    }
    try {
      await saveLaunchConfig(detail.workId, config);
      onSaved();
      onLaunch();
    } catch (error) {
      toast.error(String(error));
    }
  });

  const browseExe = async () => {
    const selected = await pickExecutable(getValues("exePath") || undefined);
    if (selected) {
      setValue("exePath", selected, { shouldDirty: true });
    }
  };

  const browseWorkingDir = async () => {
    const selected = await pickDirectory(getValues("workingDir") || undefined);
    if (selected) {
      setValue("workingDir", selected, { shouldDirty: true });
    }
  };

  const browseWrapper = async () => {
    const selected = await pickExecutable(getValues("wrapperPath") || undefined);
    if (selected) {
      setValue("wrapperPath", selected, { shouldDirty: true });
    }
  };

  return (
    <form className="detail-launch-form" onSubmit={save}>
      <section className="detail-launch-section">
        <header>
          <div>
            <h2>程序路径</h2>
            <p>启动时使用参数数组和工作目录，不经过 shell。</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void validate()}>
            <ShieldCheck size={14} strokeWidth={1.6} /> 校验路径
          </Button>
        </header>
        <label className="detail-field">
          <span>可执行文件</span>
          <div className="detail-field-row">
            <input {...register("exePath")} spellCheck={false} />
            <Button type="button" variant="secondary" size="sm" onClick={() => void browseExe()}>
              <FolderOpen size={13} strokeWidth={1.6} /> 选择
            </Button>
          </div>
        </label>
        <label className="detail-field">
          <span>工作目录</span>
          <div className="detail-field-row">
            <input {...register("workingDir")} spellCheck={false} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void browseWorkingDir()}
            >
              <FolderOpen size={13} strokeWidth={1.6} /> 选择
            </Button>
          </div>
        </label>
        {report ? (
          <div className="detail-validation" aria-live="polite">
            <div className="detail-validation__head">
              <b>{report.valid ? "路径可用" : "需要修复"}</b>
              <span>{report.valid ? "可以保存并启动" : "保存前请先处理下面的路径"}</span>
            </div>
            <CheckRow label="可执行文件" check={report.exe} />
            <CheckRow label="工作目录" check={report.workingDir} />
            {report.wrapper ? <CheckRow label="包装器" check={report.wrapper} /> : null}
          </div>
        ) : null}
      </section>

      <section className="detail-launch-section">
        <header>
          <div>
            <h2>启动参数</h2>
            <p>每行一个参数；含空格的参数也不需要额外加引号。</p>
          </div>
        </header>
        <label className="detail-field">
          <span>游戏参数</span>
          <textarea rows={3} placeholder="-window" {...register("argsText")} />
        </label>
        <label className="detail-field">
          <span>环境变量（KEY=VALUE，每行一个）</span>
          <textarea rows={3} placeholder="MIYU_TEST=1" {...register("envText")} />
        </label>
      </section>

      <section className="detail-launch-section">
        <header>
          <div>
            <h2>兼容包装器</h2>
            <p>可接 Locale Emulator、NTLEA 或其他本地包装器；不会自动下载或捆绑。</p>
          </div>
        </header>
        <label className="detail-field">
          <span>包装器程序（可选）</span>
          <div className="detail-field-row">
            <input placeholder="例如 LEProc.exe" {...register("wrapperPath")} spellCheck={false} />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void browseWrapper()}
            >
              <FolderOpen size={13} strokeWidth={1.6} /> 选择
            </Button>
          </div>
        </label>
        <label className="detail-field">
          <span>包装器参数（每行一个）</span>
          <textarea
            rows={3}
            placeholder="-runas&#10;profile-name"
            {...register("wrapperArgsText")}
          />
        </label>
        <p className="detail-hint">
          包装器参数会放在游戏 exe 之前；例如 LEProc 的 profile 参数可以写在这里。
        </p>
      </section>

      <section className="detail-launch-section">
        <header>
          <div>
            <h2>显示偏好</h2>
            <p>偏好会保存到配置；C3 不强制搬动游戏窗口。</p>
          </div>
        </header>
        <div className="detail-form-grid detail-form-grid--two">
          <label className="detail-field">
            <span>显示器</span>
            <select {...register("monitor")}>
              <option value="">跟随游戏 / 主显示器</option>
              {monitors.map((monitor) => (
                <option key={monitor.index} value={monitor.index}>
                  {monitor.name} · {monitor.width}×{monitor.height}
                </option>
              ))}
            </select>
          </label>
          <label className="detail-field detail-field--check">
            <input type="checkbox" {...register("fullscreen")} />
            <span>优先全屏启动（由游戏或包装器解释）</span>
          </label>
        </div>
      </section>

      <footer className="detail-launch-actions">
        <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
          <Save size={13} strokeWidth={1.6} /> {isSubmitting ? "正在保存…" : "保存配置"}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={isSubmitting}
          onClick={() => void saveAndLaunch()}
        >
          <Play size={13} fill="currentColor" strokeWidth={0} /> 保存并启动
        </Button>
      </footer>
    </form>
  );
}
