import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  FolderOpen,
  FolderPlus,
  Library,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import { WindowBar } from "../../design-system/components/WindowBar";
import { usePreferences } from "../../app/usePreferences";
import { completeOnboarding } from "../../lib/app-api";
import { listMetadataProviders, setMetadataProviderEnabled } from "../../lib/library-api";
import type { MetadataProvider } from "../../lib/library-types";
import { cn } from "../../lib/cn";
import { ScanReview } from "../library/ScanReview";
import { useLibraryScan } from "../library/useLibraryScan";
import { useScanSelection } from "../library/useScanSelection";
import "./onboarding.css";

type Step = "welcome" | "directory" | "sources" | "done";

const steps: { id: Step; index: string; label: string; detail: string }[] = [
  { id: "welcome", index: "01", label: "欢迎", detail: "数据留在本机" },
  { id: "directory", index: "02", label: "目录与扫描", detail: "确认主程序" },
  { id: "sources", index: "03", label: "来源", detail: "可以跳过" },
  { id: "done", index: "04", label: "完成", detail: "进入游戏库" },
];

function ProviderRow({
  provider,
  checked,
  onToggle,
}: {
  provider: MetadataProvider;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("onboarding-provider", checked && "is-selected")}
      aria-pressed={checked}
      onClick={onToggle}
    >
      <span className="onboarding-provider__check">{checked ? <Check size={12} /> : null}</span>
      <span className="onboarding-provider__copy">
        <b>{provider.name}</b>
        <small>{provider.description}</small>
      </span>
      <Tag tone={provider.connected ? "status" : "muted"}>
        {provider.connected ? "已连接" : provider.requiresAuth ? "需账号" : "公开"}
      </Tag>
    </button>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scan = useLibraryScan();
  const [step, setStep] = useState<Step>("welcome");
  const [sourceToggles, setSourceToggles] = useState<Record<string, boolean>>({});
  const [finishing, setFinishing] = useState(false);
  const providers = useQuery({
    queryKey: ["metadata-providers"],
    queryFn: listMetadataProviders,
    staleTime: 10_000,
  });
  const preferences = usePreferences();

  const candidates = useMemo(
    () => (scan.state.status === "review" ? scan.state.candidates : []),
    [scan.state],
  );
  const selection = useScanSelection(candidates, "all");
  const sourceEnabled = useMemo(
    () =>
      Object.fromEntries(
        (providers.data ?? []).map((provider) => [
          provider.id,
          sourceToggles[provider.id] ?? provider.enabled,
        ]),
      ),
    [providers.data, sourceToggles],
  );

  const stepIndex = steps.findIndex((entry) => entry.id === step);

  const importGames = async () => {
    const inputs = selection.buildCandidates();
    if (inputs.length === 0) {
      return;
    }
    try {
      const result = await scan.importSelected(inputs);
      toast.success(
        "已导入 " +
          result.imported +
          " 部作品" +
          (result.updated > 0 ? "，更新 " + result.updated + " 部" : ""),
      );
      setStep("sources");
    } catch (error) {
      toast.error(String(error));
    }
  };

  const finish = async (applySources: boolean) => {
    setFinishing(true);
    const failures: string[] = [];
    if (applySources && providers.data) {
      for (const provider of providers.data) {
        const next = sourceEnabled[provider.id] ?? provider.enabled;
        if (next === provider.enabled) {
          continue;
        }
        try {
          await setMetadataProviderEnabled(provider.id, next);
        } catch (error) {
          failures.push(provider.name + "：" + String(error));
        }
      }
    }
    try {
      await completeOnboarding();
      queryClient.setQueryData(
        ["app-info"],
        (current: { onboardingCompleted?: boolean } | undefined) =>
          current ? { ...current, onboardingCompleted: true } : current,
      );
      await queryClient.invalidateQueries({ queryKey: ["app-info"] });
      await queryClient.invalidateQueries({ queryKey: ["metadata-providers"] });
      setStep("done");
      if (failures.length > 0) {
        toast("来源设置有部分未保存：" + failures[0]);
      }
    } catch (error) {
      toast.error(String(error));
    } finally {
      setFinishing(false);
    }
  };

  const beginScan = () => {
    selection.reset();
    void scan.pickAndStart();
  };

  const directoryTitle =
    scan.state.status === "review"
      ? "确认要入库的游戏"
      : scan.state.status === "scanning"
        ? "正在扫描目录"
        : scan.state.status === "error"
          ? "扫描没有完成"
          : "找到游戏目录";
  const directoryDescription =
    scan.state.status === "review"
      ? "确认显示名和主程序后导入。"
      : scan.state.status === "scanning"
        ? "正在读取目录、文件名和大小，不会修改游戏文件。"
        : scan.state.status === "error"
          ? "可以重试当前目录，或重新选择一个游戏文件夹。"
          : "选择包含游戏主程序的文件夹。";

  return (
    <div className="app-window onboarding-window">
      <WindowBar context="首次启动" closeBehavior={preferences.data?.closeBehavior ?? "tray"} />
      <main className="onboarding-main">
        <aside className="onboarding-rail" aria-label="首次启动步骤">
          <div className="onboarding-brand">
            <img src="/miyu-manager.png" alt="" aria-hidden="true" />
            <div>
              <b>MiyuManager</b>
              <small>首次启动设置</small>
            </div>
          </div>
          <ol className="onboarding-steps">
            {steps.map((entry, index) => (
              <li
                key={entry.id}
                className={cn(index === stepIndex && "is-active", index < stepIndex && "is-done")}
              >
                <span>{index < stepIndex ? <Check size={11} /> : entry.index}</span>
                <div>
                  <b>{entry.label}</b>
                  <small>{entry.detail}</small>
                </div>
              </li>
            ))}
          </ol>
          <p className="onboarding-rail__note">
            只读取本地目录、文件名和大小。不会移动、修改或上传游戏文件。
          </p>
        </aside>

        <section className="onboarding-panel">
          {step === "welcome" ? (
            <div className="onboarding-welcome">
              <div className="onboarding-welcome__intro">
                <h1>开始整理你的游戏库</h1>
                <p className="onboarding-lead">
                  MiyuManager 管理本地 Galgame / AVG 的安装、启动、游玩时长和可追溯元数据。
                </p>
                <div className="onboarding-actions">
                  <Button variant="primary" size="lg" onClick={() => setStep("directory")}>
                    开始设置
                  </Button>
                </div>
              </div>
              <aside className="onboarding-welcome__card">
                <p>会在本机完成</p>
                <ul className="onboarding-points">
                  <li>扫描本地目录，确认主程序后入库。</li>
                  <li>作品资料与游玩记录保存在本机 SQLite。</li>
                  <li>元数据来源可以稍后在设置中连接。</li>
                </ul>
                <span>默认数据目录 %APPDATA%\MiyuManager</span>
              </aside>
            </div>
          ) : null}

          {step === "directory" ? (
            <div
              className={cn("onboarding-directory", scan.state.status === "review" && "is-review")}
            >
              <header className="onboarding-panel__head">
                <div>
                  <h1>{directoryTitle}</h1>
                  <p>{directoryDescription}</p>
                </div>
                {scan.state.status === "review" || scan.state.status === "error" ? (
                  <Button variant="ghost" size="sm" onClick={beginScan}>
                    <FolderOpen size={13} strokeWidth={1.7} /> 换一个目录
                  </Button>
                ) : null}
              </header>

              {scan.state.status === "idle" ? (
                <div className="onboarding-dropzone">
                  <span className="onboarding-dropzone__icon">
                    <FolderPlus size={28} strokeWidth={1.4} />
                  </span>
                  <h2>选择游戏文件夹</h2>
                  <p>例如 D:\Games 或 D:\Games\月影工房</p>
                  <Button variant="primary" size="lg" onClick={beginScan}>
                    <FolderOpen size={16} strokeWidth={1.8} /> 选择目录并扫描
                  </Button>
                </div>
              ) : null}

              {scan.state.status === "scanning" ? (
                <div className="onboarding-scanning">
                  <span className="onboarding-scanning__icon">
                    <Loader2 size={26} strokeWidth={1.5} className="settings-spin" />
                  </span>
                  <h2>正在扫描目录</h2>
                  <Hint label={scan.state.rootPath} side="bottom" align="start">
                    <p>{scan.state.rootPath}</p>
                  </Hint>
                  <div className="onboarding-progress" aria-label="扫描进度">
                    <span />
                  </div>
                  <div className="onboarding-scanning__stats">
                    <span>{scan.state.progress?.scannedDirs ?? 0} 个目录</span>
                    <span>发现 {scan.state.progress?.foundCandidates ?? 0} 个候选</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void scan.cancel()}>
                    {scan.state.cancelling ? "正在取消…" : "取消扫描"}
                  </Button>
                </div>
              ) : null}

              {scan.state.status === "error" ? (
                <div className="onboarding-error">
                  <XCircle size={22} strokeWidth={1.5} />
                  <h2>扫描没有完成</h2>
                  <p>{scan.state.message}</p>
                  <div>
                    <Button variant="secondary" size="sm" onClick={() => void scan.retry()}>
                      <RefreshCw size={13} strokeWidth={1.7} /> 重试
                    </Button>
                    <Button variant="ghost" size="sm" onClick={beginScan}>
                      换一个目录
                    </Button>
                  </div>
                </div>
              ) : null}

              {scan.state.status === "review" ? (
                <div className="onboarding-review">
                  <ScanReview
                    state={scan.state}
                    selection={selection}
                    importing={scan.importing}
                    emptyAction={
                      <Button variant="secondary" size="sm" onClick={beginScan}>
                        换一个目录
                      </Button>
                    }
                  />
                  <div className="onboarding-review__actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={scan.importing}
                      onClick={() => scan.close()}
                    >
                      重新选择目录
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={!selection.canImport || scan.importing}
                      onClick={() => void importGames()}
                    >
                      {scan.importing
                        ? "正在导入…"
                        : "导入选中 " + selection.selectedGroups.length + " 部"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "sources" ? (
            <div className="onboarding-sources">
              <header className="onboarding-panel__head">
                <div>
                  <h1>选择要启用的来源</h1>
                  <p>来源用于补全标题、简介和封面，可以跳过。</p>
                </div>
                <Tag tone="muted">可跳过</Tag>
              </header>
              {providers.isPending ? (
                <div className="onboarding-source-list is-loading">
                  <Loader2 size={20} className="settings-spin" />
                  正在读取来源…
                </div>
              ) : providers.isError ? (
                <div className="onboarding-note is-warning">
                  无法读取来源列表：{String(providers.error)}。仍可完成设置，之后在设置页配置。
                </div>
              ) : (
                <div className="onboarding-source-list">
                  {(providers.data ?? []).map((provider) => (
                    <ProviderRow
                      key={provider.id}
                      provider={provider}
                      checked={sourceEnabled[provider.id] ?? provider.enabled}
                      onToggle={() =>
                        setSourceToggles((current) => ({
                          ...current,
                          [provider.id]: !(current[provider.id] ?? provider.enabled),
                        }))
                      }
                    />
                  ))}
                </div>
              )}
              <p className="onboarding-note">账号连接可在“设置 → 元数据来源”完成。</p>
              <div className="onboarding-actions onboarding-actions--end">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={finishing}
                  onClick={() => void finish(false)}
                >
                  稍后设置来源
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={finishing}
                  onClick={() => void finish(true)}
                >
                  {finishing ? "正在保存…" : "保存并完成"}
                </Button>
              </div>
            </div>
          ) : null}

          {step === "done" ? (
            <div className="onboarding-done">
              <span className="onboarding-done__mark">
                <CheckCircle2 size={36} strokeWidth={1.3} />
              </span>
              <h1>游戏库已经准备好了</h1>
              <p>之后可以随时在设置中调整来源和启动器。</p>
              <div className="onboarding-done__actions">
                <Button variant="primary" size="lg" onClick={() => navigate("/library")}>
                  <Library size={16} strokeWidth={1.7} /> 打开游戏库
                </Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
                  返回首页
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
