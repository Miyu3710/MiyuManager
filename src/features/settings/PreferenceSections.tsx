import {
  Archive,
  DatabaseBackup,
  Download,
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
  createDatabaseBackup,
  getDatabaseHealth,
  openBackupDirectory,
  openDataDirectory,
  openLogDirectory,
  restoreDatabase,
  updatePreferences,
} from "../../lib/app-api";
import type { AppPreferences, CloseBehavior, ProxyMode } from "../../lib/app-types";
import { formatBytes } from "../../lib/format";
import { listOAuthAccounts, pickExecutable } from "../../lib/library-api";
import type { AppInfo, MonitorInfo } from "../../lib/library-types";
import { cn } from "../../lib/cn";
import { WRAPPER_DEFINITIONS, wrapperConfig } from "../../lib/launch-wrappers";
import {
  checkForAppUpdate,
  installAppUpdate,
  relaunchAfterUpdate,
  type AppUpdateInfo,
  type UpdateProgress,
} from "../../lib/updater";
import { SettingsSelect } from "./SettingsSelect";

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function StartupAndWindowSection({
  preferences,
  onSaved,
}: {
  preferences: AppPreferences;
  onSaved: () => void;
}) {
  const [launchAtStartup, setLaunchAtStartup] = useState(preferences.launchAtStartup);
  const [silentStartup, setSilentStartup] = useState(preferences.silentStartup);
  const [closeBehavior, setCloseBehavior] = useState<CloseBehavior>(preferences.closeBehavior);
  const [busy, setBusy] = useState<"launch" | "silent" | "close" | null>(null);

  const apply = async (
    patch: Partial<Pick<AppPreferences, "launchAtStartup" | "silentStartup" | "closeBehavior">>,
    scope: "launch" | "silent" | "close",
    message: string,
  ) => {
    setBusy(scope);
    try {
      const saved = await updatePreferences({
        ...preferences,
        launchAtStartup,
        silentStartup,
        closeBehavior,
        ...patch,
      });
      setLaunchAtStartup(saved.launchAtStartup);
      setSilentStartup(saved.silentStartup);
      setCloseBehavior(saved.closeBehavior);
      onSaved();
      toast.success(message);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="settings-preference-form" aria-busy={busy !== null}>
      <div className="settings-row">
        <div>
          <b>开机启动</b>
          <span>登录 Windows 后自动运行 MiyuManager。</span>
        </div>
        <button
          type="button"
          className={cn("settings-switch", launchAtStartup && "is-on")}
          aria-pressed={launchAtStartup}
          aria-label="开机启动"
          disabled={busy !== null}
          onClick={() =>
            void apply(
              { launchAtStartup: !launchAtStartup },
              "launch",
              launchAtStartup ? "已关闭开机启动" : "已开启开机启动",
            )
          }
        >
          <span />
        </button>
      </div>
      <div className={cn("settings-row", !launchAtStartup && "is-muted")}>
        <div>
          <b>静默启动</b>
          <span>
            {launchAtStartup
              ? "开机启动时不打开主窗口，只保留托盘入口。"
              : "开启开机启动后可设置。"}
          </span>
        </div>
        <button
          type="button"
          className={cn("settings-switch", silentStartup && "is-on")}
          aria-pressed={silentStartup}
          aria-label="静默启动"
          disabled={!launchAtStartup || busy !== null}
          onClick={() =>
            void apply(
              { silentStartup: !silentStartup },
              "silent",
              silentStartup ? "开机启动会打开主窗口" : "开机启动将保持静默",
            )
          }
        >
          <span />
        </button>
      </div>
      <div className="settings-row">
        <div>
          <b>关闭按钮</b>
          <span>
            {closeBehavior === "tray"
              ? "关闭主窗口时隐藏到托盘；从托盘菜单可彻底退出。"
              : "关闭主窗口时直接结束 MiyuManager。"}
          </span>
        </div>
        <div className="settings-segmented" role="group" aria-label="关闭按钮行为">
          <button
            type="button"
            aria-pressed={closeBehavior === "tray"}
            disabled={busy !== null}
            onClick={() => void apply({ closeBehavior: "tray" }, "close", "关闭按钮将隐藏到托盘")}
          >
            隐藏到托盘
          </button>
          <button
            type="button"
            aria-pressed={closeBehavior === "quit"}
            disabled={busy !== null}
            onClick={() => void apply({ closeBehavior: "quit" }, "close", "关闭按钮将退出应用")}
          >
            退出应用
          </button>
        </div>
      </div>
      <p className="settings-hint">
        {isTauri()
          ? "开机启动只写入当前 Windows 用户；静默启动只在开机启动时生效。"
          : "浏览器预览只保存选项；开机启动与关闭行为在桌面版生效。"}
      </p>
    </div>
  );
}

export function BangumiSyncSection({
  preferences,
  onSaved,
}: {
  preferences: AppPreferences;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(preferences.bangumiProgressSync);
  const [busy, setBusy] = useState(false);
  const oauth = useQuery({
    queryKey: ["oauth-status"],
    queryFn: listOAuthAccounts,
    staleTime: 30_000,
  });
  const bangumi = oauth.data?.find((status) => status.id === "bangumi");
  const needsReauth = bangumi?.connected === true && !bangumi.scopes.includes("write:collection");

  const toggle = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const saved = await updatePreferences({
        ...preferences,
        bangumiProgressSync: !enabled,
      });
      setEnabled(saved.bangumiProgressSync);
      onSaved();
      toast.success(
        saved.bangumiProgressSync ? "已开启 Bangumi 状态同步" : "已关闭 Bangumi 状态同步",
      );
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-preference-form bangumi-sync-form">
      <div className="settings-row">
        <div>
          <b>同步游玩状态与评分</b>
          <span>保存游玩状态或评分时，自动加入或更新 Bangumi 收藏；本地收藏不受影响。</span>
        </div>
        <button
          type="button"
          className={cn("settings-switch", enabled && "is-on")}
          aria-pressed={enabled}
          aria-label="同步游玩状态与评分到 Bangumi"
          disabled={busy}
          onClick={() => void toggle()}
        >
          <span />
        </button>
      </div>
      <p className="settings-hint">
        游戏条目没有章节进度接口；这里同步 Bangumi 收藏状态与评分。评价同步在作品详情里单独勾选。
      </p>
      {!isTauri() ? (
        <p className="settings-hint">浏览器预览只保存开关；写入 Bangumi 在桌面版生效。</p>
      ) : null}
      {bangumi?.connected === false ? (
        <p className="settings-hint">连接 Bangumi 账号后生效。</p>
      ) : null}
      {needsReauth ? (
        <p className="settings-hint bangumi-sync-form__warning">
          当前 Bangumi 登录缺少收藏写入权限；请在下方账号卡片断开后重新连接。
        </p>
      ) : null}
    </div>
  );
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
  const [autoUpdateBusy, setAutoUpdateBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [dataBusy, setDataBusy] = useState<"backup" | "restore" | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const database = useQuery({
    queryKey: ["database-health"],
    queryFn: getDatabaseHealth,
    staleTime: 10_000,
  });

  const toggleAutoUpdate = async () => {
    setAutoUpdateBusy(true);
    try {
      await updatePreferences({
        ...preferences,
        autoUpdateCheck: !preferences.autoUpdateCheck,
      });
      onSaved();
      toast.success(preferences.autoUpdateCheck ? "已关闭自动检查更新" : "已开启自动检查更新");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setAutoUpdateBusy(false);
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      const update = await checkForAppUpdate();
      setUpdateInfo(update);
      setChecked(true);
      toast.success(update ? `发现 MiyuManager ${update.version}` : "当前已是最新版本");
    } catch (error) {
      setChecked(false);
      toast.error(`无法检查更新：${String(error)}`);
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    setProgress({ phase: "downloading", downloaded: 0, total: null });
    try {
      await installAppUpdate(setProgress);
      toast.success("更新已安装，MiyuManager 将重新启动");
      await relaunchAfterUpdate();
    } catch (error) {
      setInstalling(false);
      toast.error(`更新安装失败：${String(error)}`);
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
      <div className="settings-row">
        <div>
          <b>自动检查更新</b>
          <span>启动后每 24 小时检查 GitHub Release；下载、安装和重启仍由你确认。</span>
        </div>
        <button
          type="button"
          className={cn("settings-switch", preferences.autoUpdateCheck && "is-on")}
          aria-pressed={preferences.autoUpdateCheck}
          aria-label="自动检查更新"
          disabled={!isTauri() || autoUpdateBusy}
          onClick={() => void toggleAutoUpdate()}
        >
          <span />
        </button>
      </div>
      <div className="settings-row">
        <div>
          <b>检查更新</b>
          <span>
            {!isTauri()
              ? "浏览器预览不会检查或安装应用更新。"
              : installing
                ? progress?.phase === "installing"
                  ? "正在安装更新并准备重启…"
                  : progress?.total
                    ? `下载更新 ${Math.min(100, Math.round((progress.downloaded / progress.total) * 100))}%`
                    : `已下载 ${formatBytes(progress?.downloaded ?? 0)}`
                : updateInfo
                  ? `发现 MiyuManager ${updateInfo.version}${updateInfo.date ? ` · ${new Date(updateInfo.date).toLocaleDateString("zh-CN")}` : ""}`
                  : checked
                    ? "当前已是最新版本。"
                    : "从 GitHub Release 检查签名更新；下载和重启由你确认。"}
          </span>
          {updateInfo ? <Tag tone="status">可更新</Tag> : null}
        </div>
        <div className="settings-row__actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={!isTauri() || checking || installing}
            onClick={() => void check()}
          >
            {checking ? (
              <Loader2 size={13} className="settings-spin" />
            ) : (
              <RefreshCw size={13} strokeWidth={1.7} />
            )}
            {checking ? "检查中…" : "检查更新"}
          </Button>
          {updateInfo ? (
            <Button
              variant="primary"
              size="sm"
              disabled={installing}
              onClick={() => void install()}
            >
              {installing ? (
                <Loader2 size={13} className="settings-spin" />
              ) : (
                <Download size={13} strokeWidth={1.7} />
              )}
              {installing ? "安装中…" : "下载并安装"}
            </Button>
          ) : null}
        </div>
      </div>
      {installing && progress?.phase === "downloading" ? (
        <div className="settings-update-progress" aria-live="polite">
          <span
            style={{
              width:
                progress.total && progress.total > 0
                  ? `${Math.min(100, (progress.downloaded / progress.total) * 100)}%`
                  : "12%",
            }}
          />
        </div>
      ) : null}
      {updateInfo?.notes ? <pre className="settings-update-notes">{updateInfo.notes}</pre> : null}
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
