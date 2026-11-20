import { Camera, FolderOpen, Keyboard, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { openScreenshotDirectory } from "../../lib/screenshots-api";
import { pickDirectory } from "../../lib/library-api";
import { updatePreferences } from "../../lib/app-api";
import type { AppInfo } from "../../lib/library-types";
import type { AppPreferences } from "../../lib/app-types";
import { Button } from "../../design-system/components/Button";
import "./screenshot-settings.css";

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

function keyToken(event: KeyboardEvent): string | null {
  if (event.code === "Space" || event.key === " ") {
    return "Space";
  }
  if (event.code.startsWith("Key")) {
    return event.code.slice(3).toUpperCase();
  }
  if (event.code.startsWith("Digit")) {
    return event.code.slice(5);
  }
  if (/^F\d{1,2}$/i.test(event.key)) {
    return event.key.toUpperCase();
  }
  if (event.key.startsWith("Arrow")) {
    return event.key.slice(5);
  }
  if (event.key === "Escape" || event.key === "Enter" || event.key === "Tab") {
    return event.key.toUpperCase();
  }
  return null;
}

function hotkeyFromEvent(event: KeyboardEvent): string | null {
  const key = keyToken(event);
  if (!key) {
    return null;
  }
  if (!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey && !/^F\d{1,2}$/.test(key)) {
    return null;
  }
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Super");
  parts.push(key);
  return parts.join("+");
}

export function ScreenshotSettings({
  preferences,
  appInfo,
  onSaved,
}: {
  preferences: AppPreferences;
  appInfo: AppInfo | undefined;
  onSaved?: () => void;
}) {
  const [hotkey, setHotkey] = useState(
    preferences.screenshotHotkey || "Ctrl+Shift+F12",
  );
  const [directory, setDirectory] = useState(preferences.screenshotDir);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!recording) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      if (MODIFIER_KEYS.has(event.key) || event.repeat) {
        return;
      }
      const next = hotkeyFromEvent(event);
      if (!next) {
        toast.warning("请使用修饰键组合，或按 F1–F24");
        return;
      }
      setHotkey(next);
      setRecording(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  const chooseDirectory = async () => {
    try {
      const selected = await pickDirectory(directory || appInfo?.screenshotDir);
      if (selected) {
        setDirectory(selected);
      }
    } catch (error) {
      toast.error(String(error));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const saved = await updatePreferences({
        ...preferences,
        screenshotHotkey: hotkey.trim(),
        screenshotDir: directory.trim(),
      });
      setHotkey(saved.screenshotHotkey);
      setDirectory(saved.screenshotDir);
      onSaved?.();
      toast.success("截图设置已保存");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-preference-form screenshot-settings" aria-busy={busy}>
      <div className="settings-row">
        <div>
          <b>截图快捷键</b>
          <span>只在游戏运行时注册；点击快捷键后按下组合键，或使用默认组合。</span>
        </div>
        <div className="screenshot-settings__shortcut">
          <button
            type="button"
            className={recording ? "screenshot-shortcut is-recording" : "screenshot-shortcut"}
            onClick={() => setRecording((value) => !value)}
            aria-label="录制截图快捷键"
          >
            <Keyboard size={14} strokeWidth={1.8} />
            {recording ? "按下组合键…" : hotkey}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHotkey("Ctrl+Shift+F12")}
            disabled={busy}
          >
            <RotateCcw size={13} strokeWidth={1.7} /> 默认
          </Button>
        </div>
      </div>

      <div className="settings-row screenshot-settings__directory-row">
        <div>
          <b>保存目录</b>
          <span>每部游戏会在目录下建立自己的标题文件夹；修改只影响后续截图。</span>
        </div>
        <div className="screenshot-settings__directory">
          <input
            value={directory}
            onChange={(event) => setDirectory(event.target.value)}
            placeholder={appInfo?.screenshotDir ?? "默认图片目录"}
            aria-label="截图保存目录"
          />
          <Button variant="secondary" size="sm" onClick={() => void chooseDirectory()}>
            <FolderOpen size={14} strokeWidth={1.7} /> 选择
          </Button>
        </div>
      </div>

      <div className="settings-row screenshot-settings__effective">
        <div className="screenshot-settings__effective-copy">
          <span className="screenshot-settings__eyebrow">
            <Camera size={13} strokeWidth={1.7} /> 当前保存位置
          </span>
          <span className="settings-path" title={directory.trim() || appInfo?.screenshotDir}>
            {directory.trim() || appInfo?.screenshotDir || "正在读取…"}
          </span>
        </div>
        <div className="screenshot-settings__buttons">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void openScreenshotDirectory().catch((error) => toast.error(String(error)))}
          >
            <FolderOpen size={14} strokeWidth={1.7} /> 打开
          </Button>
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy}>
            {busy ? "保存中…" : "保存截图设置"}
          </Button>
        </div>
      </div>
    </div>
  );
}
