import { Check, FolderOpen, FolderSearch, Keyboard, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Hint } from "../../design-system/components/Hint";
import { updatePreferences } from "../../lib/app-api";
import type { AppPreferences } from "../../lib/app-types";
import type { AppInfo } from "../../lib/library-types";
import { pickDirectory } from "../../lib/library-api";
import { openScreenshotDirectory } from "../../lib/screenshots-api";
import "./screenshot-settings.css";

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);
const DEFAULT_HOTKEY = "Ctrl+Shift+F12";

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

type SaveState = "idle" | "saving" | "saved";

export function ScreenshotSettings({
  preferences,
  appInfo,
  onSaved,
}: {
  preferences: AppPreferences;
  appInfo: AppInfo | undefined;
  onSaved?: () => void;
}) {
  const [hotkey, setHotkey] = useState(preferences.screenshotHotkey || DEFAULT_HOTKEY);
  const [directory, setDirectory] = useState(preferences.screenshotDir);
  const [recording, setRecording] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const preferencesRef = useRef(preferences);
  const hotkeyRef = useRef(hotkey);
  const directoryRef = useRef(directory);
  const onSavedRef = useRef(onSaved);
  const statusTimer = useRef<number | null>(null);

  useEffect(() => {
    preferencesRef.current = preferences;
  }, [preferences]);

  useEffect(() => {
    hotkeyRef.current = hotkey;
  }, [hotkey]);

  useEffect(() => {
    directoryRef.current = directory;
  }, [directory]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    return () => {
      if (statusTimer.current !== null) {
        window.clearTimeout(statusTimer.current);
      }
    };
  }, []);

  const persist = async (nextHotkey: string, nextDirectory: string) => {
    const current = preferencesRef.current;
    if (
      nextHotkey.trim() === current.screenshotHotkey.trim() &&
      nextDirectory.trim() === current.screenshotDir.trim()
    ) {
      return;
    }
    setSaveState("saving");
    try {
      const saved = await updatePreferences({
        ...current,
        screenshotHotkey: nextHotkey.trim(),
        screenshotDir: nextDirectory.trim(),
      });
      preferencesRef.current = saved;
      setHotkey(saved.screenshotHotkey);
      setDirectory(saved.screenshotDir);
      onSavedRef.current?.();
      setSaveState("saved");
      if (statusTimer.current !== null) {
        window.clearTimeout(statusTimer.current);
      }
      statusTimer.current = window.setTimeout(() => setSaveState("idle"), 1600);
    } catch (error) {
      setHotkey(preferencesRef.current.screenshotHotkey || DEFAULT_HOTKEY);
      setDirectory(preferencesRef.current.screenshotDir);
      setSaveState("idle");
      toast.error(String(error));
    }
  };

  useEffect(() => {
    if (directory.trim() === preferencesRef.current.screenshotDir.trim()) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persist(hotkeyRef.current, directoryRef.current);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [directory]);

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
      setRecording(false);
      setHotkey(next);
      hotkeyRef.current = next;
      void persist(next, directoryRef.current);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  const chooseDirectory = async () => {
    try {
      const selected = await pickDirectory(directory || appInfo?.screenshotDir);
      if (!selected) {
        return;
      }
      setDirectory(selected);
      directoryRef.current = selected;
      await persist(hotkeyRef.current, selected);
    } catch (error) {
      toast.error(String(error));
    }
  };

  return (
    <div className="screenshot-settings">
      <div className="screenshot-settings__row">
        <div className="screenshot-settings__copy">
          <b>截图快捷键</b>
          <span>只在游戏运行时注册；点击后按下新的组合键。</span>
        </div>
        <div className="screenshot-settings__hotkey">
          <button
            type="button"
            className={recording ? "screenshot-shortcut is-recording" : "screenshot-shortcut"}
            onClick={() => setRecording((value) => !value)}
            aria-label="录制截图快捷键"
          >
            <Keyboard size={14} strokeWidth={1.8} />
            {recording ? "按下组合键…" : hotkey}
          </button>
          <button
            type="button"
            className="screenshot-settings__reset"
            onClick={() => {
              setHotkey(DEFAULT_HOTKEY);
              hotkeyRef.current = DEFAULT_HOTKEY;
              void persist(DEFAULT_HOTKEY, directoryRef.current);
            }}
          >
            <RotateCcw size={13} strokeWidth={1.7} /> 默认
          </button>
        </div>
      </div>

      <div className="screenshot-settings__row">
        <div className="screenshot-settings__copy">
          <b>保存目录</b>
          <span>每部作品按标题归档；修改会立即生效，只影响后续截图。</span>
        </div>
        <div className="screenshot-folder-field">
          <input
            value={directory}
            onChange={(event) => {
              setDirectory(event.target.value);
              directoryRef.current = event.target.value;
            }}
            onBlur={() => void persist(hotkeyRef.current, directoryRef.current)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void persist(hotkeyRef.current, directoryRef.current);
              }
            }}
            placeholder={appInfo?.screenshotDir ?? "默认图片目录"}
            aria-label="截图保存目录"
          />
          <Hint label="选择目录" side="top">
            <button type="button" onClick={() => void chooseDirectory()} aria-label="选择截图目录">
              <FolderSearch size={15} strokeWidth={1.7} />
            </button>
          </Hint>
          <Hint label="打开目录" side="top">
            <button
              type="button"
              onClick={() =>
                void openScreenshotDirectory().catch((error) => toast.error(String(error)))
              }
              aria-label="打开截图目录"
            >
              <FolderOpen size={15} strokeWidth={1.7} />
            </button>
          </Hint>
        </div>
      </div>

      <div className="screenshot-settings__footer">
        <span>更改会自动保存。</span>
        <span className={saveState === "saved" ? "is-saved" : undefined}>
          {saveState === "saving" ? (
            <>
              <Loader2 className="screenshot-settings__spin" size={12} strokeWidth={1.8} /> 正在保存
            </>
          ) : saveState === "saved" ? (
            <>
              <Check size={12} strokeWidth={2} /> 已保存
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}
