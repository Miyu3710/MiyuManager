import { FolderOpen, Loader2, RefreshCw, Wifi } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "../../design-system/components/Button";
import { Tag } from "../../design-system/components/Tag";
import { checkForUpdates, openDataDirectory, updatePreferences } from "../../lib/app-api";
import type { AppPreferences, ProxyMode, UpdateCheck } from "../../lib/app-types";
import { pickExecutable } from "../../lib/library-api";
import type { AppInfo, MonitorInfo } from "../../lib/library-types";
import { cn } from "../../lib/cn";

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
  const [wrapperPath, setWrapperPath] = useState(preferences.wrapperPath);
  const [wrapperArgs, setWrapperArgs] = useState(preferences.wrapperArgs.join("\n"));
  const [monitor, setMonitor] = useState(
    preferences.defaultMonitor === null ? "" : String(preferences.defaultMonitor),
  );
  const [fullscreen, setFullscreen] = useState(preferences.launchFullscreen);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await updatePreferences({
        ...preferences,
        wrapperPath,
        wrapperArgs: parseLines(wrapperArgs),
        defaultMonitor: monitor === "" ? null : Number(monitor),
        launchFullscreen: fullscreen,
      });
      onSaved();
      toast.success("启动器默认值已保存；只影响新建的启动配置");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const browseWrapper = async () => {
    const selected = await pickExecutable(wrapperPath || undefined);
    if (selected) {
      setWrapperPath(selected);
    }
  };

  return (
    <div className="settings-preference-form">
      <div className="settings-row">
        <div>
          <b>默认显示器</b>
          <span>新作品没有单独设置时使用；作品详情仍可覆盖。</span>
        </div>
        <select
          className="settings-select"
          value={monitor}
          onChange={(event) => setMonitor(event.currentTarget.value)}
          aria-label="默认显示器"
        >
          <option value="">跟随作品设置</option>
          {monitors.map((entry) => (
            <option key={entry.index} value={entry.index}>
              {entry.name}，{entry.width} × {entry.height}
            </option>
          ))}
        </select>
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
          onClick={() => setFullscreen(!fullscreen)}
        >
          <span />
        </button>
      </div>
      <div className="settings-stack-row">
        <div>
          <b>Locale Emulator / NTLEA 默认路径</b>
          <span>只保存路径，不捆绑或自动下载包装器；作品页可以逐个覆盖。</span>
        </div>
        <div className="settings-path-input">
          <input
            className="settings-input"
            value={wrapperPath}
            onChange={(event) => setWrapperPath(event.currentTarget.value)}
            placeholder="例如 D:\Tools\LE\LEProc.exe"
            spellCheck={false}
          />
          <Button variant="secondary" size="sm" onClick={() => void browseWrapper()}>
            <FolderOpen size={13} strokeWidth={1.7} /> 选择
          </Button>
        </div>
      </div>
      <div className="settings-stack-row">
        <div>
          <b>默认包装器参数</b>
          <span>每行一个参数；留空使用包装器自己的默认行为。</span>
        </div>
        <textarea
          className="settings-textarea"
          value={wrapperArgs}
          onChange={(event) => setWrapperArgs(event.currentTarget.value)}
          rows={3}
          spellCheck={false}
          placeholder="每行一个参数"
        />
      </div>
      <div className="settings-preference-form__actions">
        <Button variant="primary" size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? "保存中…" : "保存启动器默认值"}
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
    <div className="settings-preference-form">
      <div className="settings-row">
        <div>
          <b>元数据网络</b>
          <span>系统代理会读取 Windows Internet 设置；直连不经过代理。</span>
        </div>
        <Tag tone="status">
          <Wifi size={12} strokeWidth={1.7} />{" "}
          {mode === "system" ? "跟随系统" : mode === "direct" ? "直连" : "自定义"}
        </Tag>
      </div>
      <div className="settings-segmented settings-segmented--wide">
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
        <div className="settings-stack-row">
          <div>
            <b>代理地址</b>
            <span>例如 http://127.0.0.1:7890；只支持 http 或 https。</span>
          </div>
          <input
            className="settings-input"
            value={url}
            onChange={(event) => setUrl(event.currentTarget.value)}
            placeholder="http://127.0.0.1:7890"
            spellCheck={false}
          />
        </div>
      ) : null}
      <p className="settings-hint">
        元数据请求保存后立即使用新代理；OAuth 账号授权在下次启动应用后使用新代理。
      </p>
      <div className="settings-preference-form__actions">
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
  const [manifestUrl, setManifestUrl] = useState(preferences.updateManifestUrl);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);

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

  return (
    <div className="settings-preference-form">
      <div className="settings-row">
        <div>
          <b>数据目录</b>
          <span className="settings-path" title={appInfo?.dataDir}>
            {appInfo?.dataDir ?? "正在读取…"}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void openDir()} disabled={!appInfo}>
          <FolderOpen size={13} strokeWidth={1.7} /> 打开
        </Button>
      </div>
      <div className="settings-row">
        <div>
          <b>数据库</b>
          <span className="settings-path" title={appInfo?.dbPath}>
            {appInfo?.dbPath ?? "正在读取…"}
          </span>
        </div>
        <Tag tone="status">SQLite WAL</Tag>
      </div>
      <div className="settings-row">
        <div>
          <b>备份与恢复</b>
          <span>数据库备份、恢复和迁移检查在 C9 提供；当前不使用前端直接复制数据库文件。</span>
        </div>
        <Tag tone="muted">C9</Tag>
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
    </div>
  );
}
