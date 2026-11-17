import {
  Archive,
  DatabaseBackup,
  FolderOpen,
  Loader2,
  RefreshCw,
  RotateCcw,
  ScrollText,
} from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { ConfirmDialog } from "../../design-system/components/ConfirmDialog";
import { Hint } from "../../design-system/components/Hint";
import { Tag } from "../../design-system/components/Tag";
import {
  checkForUpdates,
  createDatabaseBackup,
  getDatabaseHealth,
  openBackupDirectory,
  openDataDirectory,
  openLogDirectory,
  restoreDatabase,
  updatePreferences,
} from "../../lib/app-api";
import type { AppPreferences, ProxyMode, UpdateCheck } from "../../lib/app-types";
import { formatBytes } from "../../lib/format";
import { pickExecutable } from "../../lib/library-api";
import type { AppInfo, MonitorInfo } from "../../lib/library-types";
import { cn } from "../../lib/cn";
import { WRAPPER_DEFINITIONS, wrapperConfig } from "../../lib/launch-wrappers";
import { SettingsSelect } from "./SettingsSelect";

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function LauncherDefaultsSection({
  preferences,
  monitors,
  onSaved,
}: {
  preferences: AppPreferences;
  monitors: MonitorInfo[];
  onSaved: () => void;
}) {
  const [wrappers, setWrappers] = useState<Record<string, { path: string; args: string }>>(
    () =>
      Object.fromEntries(
        WRAPPER_DEFINITIONS.map((definition) => {
          const config = wrapperConfig(preferences, definition.id);
          return [
            definition.id,
            {
              path: config?.path ?? "",
              args: (config?.args ?? definition.defaultArgs).join("\n"),
            },
          ];
        }),
      ) as Record<string, { path: string; args: string }>,
  );
  const [monitor, setMonitor] = useState(
    preferences.defaultMonitor === null ? "" : String(preferences.defaultMonitor),
  );
  const [fullscreen, setFullscreen] = useState(preferences.launchFullscreen);
  const [busy, setBusy] = useState(false);
  const monitorOptions = [
    { value: "auto", label: "跟随作品设置" },
    ...monitors.map((entry) => ({
      value: String(entry.index),
      label: entry.name,
      detail: String(entry.width) + " × " + String(entry.height),
    })),
  ];

  const save = async () => {
    setBusy(true);
    try {
      await updatePreferences({
        ...preferences,
        wrappers: WRAPPER_DEFINITIONS.map((definition) => ({
          id: definition.id,
          path: wrappers[definition.id]?.path.trim() ?? "",
          args: parseLines(wrappers[definition.id]?.args ?? ""),
        })),
        defaultMonitor: monitor === "" ? null : Number(monitor),
        launchFullscreen: fullscreen,
      });
      onSaved();
      toast.success("启动器设置已保存");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const updateWrapper = (id: string, patch: Partial<{ path: string; args: string }>) => {
    setWrappers((current) => ({
      ...current,
      [id]: { ...(current[id] ?? { path: "", args: "" }), ...patch },
    }));
  };

  const browseWrapper = async (id: string) => {
    const selected = await pickExecutable(wrappers[id]?.path || undefined);
    if (selected) {
      updateWrapper(id, { path: selected });
    }
  };

  return (
    <div className="settings-preference-form">
      <div className="settings-row">
        <div>
          <b>默认显示器</b>
          <span>新作品没有单独设置时使用；作品详情仍可覆盖。</span>
        </div>
        <SettingsSelect
          ariaLabel="默认显示器"
          menuLabel="默认显示器"
          value={monitor === "" ? "auto" : monitor}
          options={monitorOptions}
          onChange={(value) => setMonitor(value === "auto" ? "" : value)}
        />
      </div>
      <div className="settings-row">
        <div>
          <b>默认全屏</b>
          <span>启动配置里没有记录时采用这个值；不会强制改变已经保存的作品配置。</span>
        </div>
        <button
          type="button"
          className={cn("settings-switch", fullscreen && "is-on")}
          aria-pressed={fullscreen}
          aria-label="默认全屏"
          onClick={() => setFullscreen(!fullscreen)}
        >
          <span />
        </button>
      </div>
      <div className="settings-wrapper-group">
        <div className="settings-wrapper-group__head">
          <b>兼容包装器</b>
          <span>每部作品单独启用；程序路径与参数在这里统一维护。</span>
        </div>
        {WRAPPER_DEFINITIONS.map((definition) => {
          const draft = wrappers[definition.id] ?? { path: "", args: "" };
          const configured = Boolean(draft.path.trim());
          return (
            <section
              className="settings-wrapper-card"
              key={definition.id}
              aria-labelledby={`wrapper-${definition.id}-title`}
            >
              <header className="settings-wrapper-card__head">
                <div>
                  <b id={`wrapper-${definition.id}-title`}>{definition.name}</b>
                  <span>{definition.description}</span>
                </div>
                <Tag tone={configured ? "status" : "muted"}>{configured ? "已配置" : "未配置"}</Tag>
              </header>
              <div className="settings-stack-row">
                <div>
                  <b>程序路径</b>
                  <span>用于启动此包装器的可执行文件。</span>
                </div>
                <div className="settings-path-input">
                  <input
                    className="settings-input"
                    aria-label={`${definition.name}路径`}
                    value={draft.path}
                    onChange={(event) =>
                      updateWrapper(definition.id, { path: event.currentTarget.value })
                    }
                    placeholder={definition.pathPlaceholder}
                    spellCheck={false}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void browseWrapper(definition.id)}
                  >
                    <FolderOpen size={13} strokeWidth={1.7} /> 选择
                  </Button>
                </div>
              </div>
              <div className="settings-stack-row">
                <div>
                  <b>启动参数</b>
                  <span>{definition.argsHint}</span>
                </div>
                <textarea
                  className="settings-textarea"
                  aria-label={`${definition.name}参数`}
                  value={draft.args}
                  onChange={(event) =>
                    updateWrapper(definition.id, { args: event.currentTarget.value })
                  }
                  rows={2}
                  spellCheck={false}
                  placeholder={definition.argsPlaceholder}
                />
              </div>
            </section>
          );
        })}
      </div>
      <div className="settings-preference-form__actions">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "保存中…" : "保存启动器设置"}
        </Button>
      </div>
    </div>
  );
}

export function NetworkSettingsSection({
  preferences,
  onSaved,
}: {
  preferences: AppPreferences;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<ProxyMode>(preferences.proxyMode);
  const [url, setUrl] = useState(preferences.proxyUrl);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updatePreferences({ ...preferences, proxyMode: mode, proxyUrl: url });
      onSaved();
      toast.success("网络设置已保存");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="network-settings">
      <div className="settings-proxy-tabs" role="group" aria-label="代理方式">
        <button type="button" aria-pressed={mode === "system"} onClick={() => setMode("system")}>
          跟随系统
        </button>
        <button type="button" aria-pressed={mode === "direct"} onClick={() => setMode("direct")}>
          直连
        </button>
        <button type="button" aria-pressed={mode === "custom"} onClick={() => setMode("custom")}>
          自定义代理
        </button>
      </div>
      {mode === "custom" ? (
        <div className="settings-stack-row settings-proxy-address">
          <div>
            <b>代理地址</b>
            <span>例如 http://127.0.0.1:7890；只支持 http 或 https。</span>
          </div>
          <input
            className="settings-input"
            aria-label="代理地址"
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            placeholder="http://127.0.0.1:7890"
            spellCheck={false}
          />
        </div>
      ) : null}
      <div className="network-settings__foot">
        <p className="settings-hint">OAuth 账号授权在下次启动应用后使用新代理。</p>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "保存中…" : "保存网络设置"}
        </Button>
      </div>
    </div>
  );
}

export function DataAndUpdateSection({
  appInfo,
  preferences,
  onSaved,
}: {
  appInfo: AppInfo | undefined;
  preferences: AppPreferences;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [manifestUrl, setManifestUrl] = useState(preferences.updateManifestUrl);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [dataBusy, setDataBusy] = useState<"backup" | "restore" | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const database = useQuery({
    queryKey: ["database-health"],
    queryFn: getDatabaseHealth,
    staleTime: 10_000,
  });

  const saveManifest = async () => {
    setBusy(true);
    try {
      await updatePreferences({ ...preferences, updateManifestUrl: manifestUrl });
      onSaved();
      toast.success("更新检查地址已保存");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      setResult(await checkForUpdates());
    } catch (error) {
      toast.error(String(error));
    } finally {
      setChecking(false);
    }
  };

  const openDir = async () => {
    try {
      await openDataDirectory();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const refreshDatabase = async () => {
    await queryClient.invalidateQueries({ queryKey: ["database-health"] });
  };

  const backupDatabase = async () => {
    setDataBusy("backup");
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const stamp = new Date().toISOString().slice(0, 19).replaceAll("-", "").replaceAll(":", "");
      const destination = await save({
        defaultPath: `MiyuManager-backup-${stamp}.sqlite3`,
        filters: [{ name: "SQLite 数据库", extensions: ["sqlite3", "db"] }],
      });
      if (!destination) {
        return;
      }
      const backup = await createDatabaseBackup(destination);
      await refreshDatabase();
      toast.success(`数据库备份已保存：${backup.name}`);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setDataBusy(null);
    }
  };

  const chooseRestore = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "SQLite 数据库", extensions: ["sqlite3", "db"] }],
      });
      if (typeof selected === "string") {
        setRestoreTarget(selected);
      }
    } catch (error) {
      toast.error(String(error));
    }
  };

  const confirmRestore = async () => {
    if (!restoreTarget) {
      return;
    }
    setDataBusy("restore");
    try {
      await restoreDatabase(restoreTarget);
      setRestoreTarget(null);
      toast.success("数据库已替换，应用正在重新启动");
    } catch (error) {
      setDataBusy(null);
      toast.error(String(error));
    }
  };

  const openBackups = async () => {
    try {
      await openBackupDirectory();
    } catch (error) {
      toast.error(String(error));
    }
  };

  const openLogs = async () => {
    try {
      await openLogDirectory();
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <div className="settings-preference-form">
      <div className="settings-row">
        <div>
          <b>数据目录</b>
          <Hint label={appInfo?.dataDir ?? ""} side="right" sideOffset={10}>
            <span className="settings-path">{appInfo?.dataDir ?? "正在读取…"}</span>
          </Hint>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void openDir()} disabled={!appInfo}>
          <FolderOpen size={13} strokeWidth={1.7} /> 打开
        </Button>
      </div>
      <div className="settings-row">
        <div>
          <b>数据库</b>
          <Hint label={appInfo?.dbPath ?? ""} side="right" sideOffset={10}>
            <span className="settings-path">{appInfo?.dbPath ?? "正在读取…"}</span>
          </Hint>
        </div>
        <div className="settings-row__actions">
          {database.data && database.data.sizeBytes > 0 ? (
            <span>{formatBytes(database.data.sizeBytes)}</span>
          ) : null}
          <Tag tone={database.data?.integrity === "ok" ? "status" : "muted"}>
            {database.data?.integrity === "ok" ? "完整性通过" : "SQLite WAL"}
          </Tag>
        </div>
      </div>
      <div className="settings-row">
        <div>
          <b>备份与恢复</b>
          <span>
            {database.data?.latestBackup
              ? `最近备份 ${new Date(database.data.latestBackup.createdAt).toLocaleString("zh-CN")} · ${formatBytes(database.data.latestBackup.sizeBytes)}`
              : "使用 SQLite 在线快照；恢复前会自动保留当前数据库。"}
          </span>
        </div>
        <div className="settings-row__actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={!isTauri() || dataBusy !== null}
            onClick={() => void backupDatabase()}
          >
            <DatabaseBackup size={13} strokeWidth={1.7} />
            {dataBusy === "backup" ? "备份中…" : "立即备份"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!isTauri() || dataBusy !== null}
            onClick={() => void chooseRestore()}
          >
            <RotateCcw size={13} strokeWidth={1.7} /> 恢复
          </Button>
        </div>
      </div>
      <div className="settings-row">
        <div>
          <b>迁移与本地快照</b>
          <span>
            {database.isError
              ? String(database.error)
              : database.data
                ? `${database.data.appliedMigrations} 项迁移已应用${database.data.pendingMigrations.length ? ` · ${database.data.pendingMigrations.length} 项待执行` : " · 数据库结构为最新"}`
                : "正在检查数据库结构…"}
          </span>
        </div>
        <Button variant="ghost" size="sm" disabled={!isTauri()} onClick={() => void openBackups()}>
          <Archive size={13} strokeWidth={1.7} /> 备份目录
        </Button>
      </div>
      <div className="settings-row">
        <div>
          <b>诊断日志</b>
          <span>崩溃记录、启动迁移和前端异常写入本地 JSONL；不会上传。</span>
        </div>
        <Button variant="ghost" size="sm" disabled={!isTauri()} onClick={() => void openLogs()}>
          <ScrollText size={13} strokeWidth={1.7} /> 打开日志
        </Button>
      </div>
      <div className="settings-row">
        <div>
          <b>版本</b>
          <span>{appInfo?.version ?? "—"}，本地优先，不发送遥测</span>
        </div>
        <Tag tone="data">当前版本</Tag>
      </div>
      <div className="settings-stack-row">
        <div>
          <b>更新清单地址（可选）</b>
          <span>支持 JSON 的 version、notes 和 url 字段；留空时只显示当前版本。</span>
        </div>
        <div className="settings-path-input">
          <input
            className="settings-input"
            aria-label="更新清单地址"
            value={manifestUrl}
            onChange={(event) => setManifestUrl(event.currentTarget.value)}
            placeholder="https://example.com/miyumanager-update.json"
            spellCheck={false}
          />
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void saveManifest()}>
            保存
          </Button>
        </div>
      </div>
      <div className="settings-row">
        <div>
          <b>检查更新</b>
          <span>{result?.message ?? "只检查版本，不自动下载或安装。"}</span>
          {result?.updateAvailable && result.latestVersion ? (
            <Tag tone="status">最新 {result.latestVersion}</Tag>
          ) : null}
        </div>
        <Button variant="secondary" size="sm" disabled={checking} onClick={() => void check()}>
          {checking ? (
            <Loader2 size={13} className="settings-spin" />
          ) : (
            <RefreshCw size={13} strokeWidth={1.7} />
          )}
          {checking ? "检查中…" : "检查更新"}
        </Button>
      </div>
      {result?.notes ? <pre className="settings-update-notes">{result.notes}</pre> : null}
      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open && dataBusy !== "restore") {
            setRestoreTarget(null);
          }
        }}
        title="从这个备份恢复数据库？"
        description={
          <>
            当前数据库会先备份，然后替换为所选快照。应用会自动重启；游戏文件、封面缓存和日志不会被改动。
            <br />
            <span className="settings-path">{restoreTarget}</span>
          </>
        }
        confirmLabel="备份并恢复"
        busy={dataBusy === "restore"}
        onConfirm={() => void confirmRestore()}
      />
    </div>
  );
}
