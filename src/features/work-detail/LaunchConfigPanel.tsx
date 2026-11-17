import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Hint } from "../../design-system/components/Hint";
import { pickDirectory, pickExecutable, saveLaunchConfig } from "../../lib/library-api";
import type { LaunchConfigInput, LaunchProfile, LibraryItemDetail } from "../../lib/library-types";
import type { AppPreferences } from "../../lib/app-types";
import {
  WRAPPER_DEFINITIONS,
  isWrapperConfigured,
  orderedWrapperIds,
  wrapperConfig,
} from "../../lib/launch-wrappers";

interface LaunchDraft {
  workingDir: string;
  exeName: string;
  argsText: string;
  envText: string;
  wrapperIds: string[];
  monitor: number | null;
  fullscreen: boolean;
}

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function normalizeWindowsPath(value: string): string {
  return value.trim().replace(/\//g, "\\");
}

function directoryOf(value: string): string {
  const path = normalizeWindowsPath(value);
  const index = path.lastIndexOf("\\");
  if (index <= 0) {
    return path;
  }
  return path.slice(0, index === 2 && path[1] === ":" ? 3 : index);
}

function nameOf(value: string): string {
  const path = normalizeWindowsPath(value);
  return path.slice(path.lastIndexOf("\\") + 1);
}

function executableName(exePath: string, workingDir: string): string {
  const exe = normalizeWindowsPath(exePath);
  const directory = normalizeWindowsPath(workingDir).replace(/\\+$/, "");
  if (directory && exe.toLowerCase().startsWith(directory.toLowerCase() + "\\")) {
    return exe.slice(directory.length + 1);
  }
  return nameOf(exe);
}

function joinExecutable(workingDir: string, exeName: string): string {
  const directory = normalizeWindowsPath(workingDir).replace(/\\+$/, "");
  const name = normalizeWindowsPath(exeName).replace(/^\\+/, "");
  return directory ? directory + "\\" + name : name;
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

function draftFrom(detail: LibraryItemDetail, preferences: AppPreferences): LaunchDraft {
  const profile = detail.launchProfile;
  return {
    workingDir: detail.workingDir,
    exeName: executableName(detail.exePath, detail.workingDir),
    argsText: profile?.args.join("\n") ?? "",
    envText: profile?.env.map((variable) => variable.key + "=" + variable.value).join("\n") ?? "",
    wrapperIds: orderedWrapperIds(profile?.wrapperIds ?? []),
    monitor: profile?.monitor ?? preferences.defaultMonitor,
    fullscreen: profile?.fullscreen ?? preferences.launchFullscreen,
  };
}

function toConfig(draft: LaunchDraft, preferences: AppPreferences): LaunchConfigInput {
  return {
    exePath: joinExecutable(draft.workingDir, draft.exeName),
    workingDir: normalizeWindowsPath(draft.workingDir),
    profile: {
      args: parseLines(draft.argsText),
      env: parseEnv(draft.envText),
      wrapperIds: draft.wrapperIds.filter((id) => isWrapperConfigured(preferences, id)),
      monitor: draft.monitor,
      fullscreen: draft.fullscreen,
    },
  };
}

interface LaunchConfigPanelProps {
  detail: LibraryItemDetail;
  preferences: AppPreferences;
  onSaved: () => void;
}

export function LaunchConfigPanel({ detail, preferences, onSaved }: LaunchConfigPanelProps) {
  const [draft, setDraft] = useState(() => draftFrom(detail, preferences));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  const detailRef = useRef(detail);
  const preferencesRef = useRef(preferences);
  const onSavedRef = useRef(onSaved);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const requestRef = useRef(0);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    detailRef.current = detail;
    preferencesRef.current = preferences;
    onSavedRef.current = onSaved;
  }, [detail, onSaved, preferences]);

  const persist = useCallback((value: LaunchDraft) => {
    const requestId = ++requestRef.current;
    setSaveState("saving");
    setSaveError(null);
    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (requestId !== requestRef.current) {
        return;
      }
      try {
        await saveLaunchConfig(detailRef.current.workId, toConfig(value, preferencesRef.current));
        if (requestId === requestRef.current) {
          dirtyRef.current = false;
          setSaveState("saved");
          onSavedRef.current();
        }
      } catch (error) {
        if (requestId === requestRef.current) {
          setSaveState("error");
          setSaveError(String(error));
        }
      }
    });
  }, []);

  const flushSave = (value = draftRef.current) => {
    if (!dirtyRef.current) {
      return;
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persist(value);
  };

  const applyDraft = (patch: Partial<LaunchDraft>) => {
    const next = { ...draftRef.current, ...patch };
    draftRef.current = next;
    dirtyRef.current = true;
    setDraft(next);
    setSaveState("pending");
    setSaveError(null);
  };

  useEffect(() => {
    if (!dirtyRef.current) {
      return;
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      persist(draftRef.current);
    }, 350);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [draft, persist]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (dirtyRef.current) {
        persist(draftRef.current);
      }
    };
  }, [persist]);

  const browseExecutable = async () => {
    const current = draftRef.current;
    const selected = await pickExecutable(
      current.exeName ? joinExecutable(current.workingDir, current.exeName) : undefined,
    );
    if (!selected) {
      return;
    }
    applyDraft({
      workingDir: directoryOf(selected),
      exeName: nameOf(selected),
    });
  };

  const browseDirectory = async () => {
    const selected = await pickDirectory(draftRef.current.workingDir || undefined);
    if (selected) {
      applyDraft({ workingDir: selected });
    }
  };

  const toggleWrapper = (id: string) => {
    const next = new Set(draftRef.current.wrapperIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    applyDraft({ wrapperIds: orderedWrapperIds(next) });
  };

  const saveErrorText = saveError ? saveError.replace(/^Error:\s*/, "") : null;
  const wrappers = WRAPPER_DEFINITIONS.map((definition) => {
    const config = wrapperConfig(preferences, definition.id);
    const configured = Boolean(config?.path.trim());
    return {
      definition,
      configured,
      enabled: configured && draft.wrapperIds.includes(definition.id),
      path: config?.path.trim() ?? "",
    };
  });
  const localeEmulatorEnabled = wrappers.some(
    (entry) => entry.definition.id === "locale-emulator" && entry.enabled,
  );
  const magpieEnabled = wrappers.some((entry) => entry.definition.id === "magpie" && entry.enabled);
  const bothEnabled = localeEmulatorEnabled && magpieEnabled;

  return (
    <div className="detail-launch-form" aria-busy={saveState === "saving"}>
      <section className="detail-launch-section detail-launch-paths">
        <div className="launch-path-builder">
          <div className="launch-path-field">
            <label htmlFor="launch-working-dir">游戏目录</label>
            <div className="launch-path-field__surface">
              <input
                id="launch-working-dir"
                value={draft.workingDir}
                onChange={(event) => applyDraft({ workingDir: event.currentTarget.value })}
                onBlur={() => flushSave()}
                spellCheck={false}
                aria-label="游戏目录"
              />
              <Hint label="选择游戏目录" side="bottom">
                <button
                  type="button"
                  className="launch-path-field__button launch-path-field__separator"
                  onClick={() => void browseDirectory()}
                  aria-label="选择游戏目录"
                >
                  \
                </button>
              </Hint>
            </div>
          </div>
          <div className="launch-path-field launch-path-field--exe">
            <label htmlFor="launch-exe-name">可执行文件</label>
            <div className="launch-path-field__surface">
              <input
                id="launch-exe-name"
                value={draft.exeName}
                onChange={(event) => applyDraft({ exeName: event.currentTarget.value })}
                onBlur={() => flushSave()}
                spellCheck={false}
                aria-label="可执行文件"
              />
              <Hint label="选择可执行文件" side="bottom">
                <button
                  type="button"
                  className="launch-path-field__button"
                  onClick={() => void browseExecutable()}
                  aria-label="选择可执行文件"
                >
                  <FolderOpen size={18} strokeWidth={1.7} />
                </button>
              </Hint>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-launch-section detail-launch-params">
        <header>
          <div>
            <h2>启动参数</h2>
          </div>
        </header>
        <div className="detail-launch-params__grid">
          <label className="detail-field">
            <span>游戏参数</span>
            <textarea
              rows={2}
              placeholder="每行一个，例如 -window"
              value={draft.argsText}
              onChange={(event) => applyDraft({ argsText: event.currentTarget.value })}
              onBlur={() => flushSave()}
              aria-label="游戏参数"
            />
          </label>
          <label className="detail-field">
            <span>环境变量</span>
            <textarea
              rows={2}
              placeholder="KEY=VALUE，每行一个"
              value={draft.envText}
              onChange={(event) => applyDraft({ envText: event.currentTarget.value })}
              onBlur={() => flushSave()}
              aria-label="环境变量"
            />
          </label>
        </div>
      </section>

      <section className="detail-launch-section detail-launch-wrapper">
        <header>
          <div>
            <h2>兼容包装器</h2>
          </div>
        </header>
        <div className="detail-wrapper-list">
          {wrappers.map(({ definition, configured, enabled, path }) => (
            <div className="detail-wrapper-row" key={definition.id}>
              <div className="detail-wrapper-copy">
                <div className="detail-wrapper-title">
                  <b>{definition.name}</b>
                  <span>{definition.role}</span>
                </div>
                <Hint label={path} side="bottom" align="start">
                  <span
                    id={`detail-wrapper-${definition.id}`}
                    className={configured ? "detail-wrapper-path" : "detail-wrapper-path is-empty"}
                  >
                    {configured ? path : `在设置中配置 ${definition.name} 程序路径`}
                  </span>
                </Hint>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={`启用 ${definition.name}`}
                aria-describedby={`detail-wrapper-${definition.id}`}
                className={enabled ? "detail-switch is-on" : "detail-switch"}
                disabled={!configured}
                onClick={() => toggleWrapper(definition.id)}
              >
                <span aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        {bothEnabled ? (
          <p className="detail-wrapper-note">
            同时启用时，先由 Locale Emulator 启动游戏，再自动写入 Magpie 缩放规则。
          </p>
        ) : null}
      </section>

      <span className="sr-only" role="status" aria-live="polite">
        {saveState === "pending"
          ? "待保存"
          : saveState === "saving"
            ? "正在保存"
            : saveState === "saved"
              ? "已保存"
              : saveState === "error"
                ? "保存失败"
                : ""}
      </span>

      {saveErrorText ? (
        <Hint label={saveErrorText} side="top" align="start">
          <p className="detail-launch-save-error" aria-live="polite">
            {saveErrorText}
          </p>
        </Hint>
      ) : null}
    </div>
  );
}
