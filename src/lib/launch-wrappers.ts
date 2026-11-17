import type { AppPreferences, WrapperConfig } from "./app-types";

export interface WrapperDefinition {
  id: string;
  name: string;
  role: string;
  description: string;
  pathPlaceholder: string;
  argsPlaceholder: string;
  argsHint: string;
  defaultArgs: string[];
}

export const WRAPPER_DEFINITIONS: WrapperDefinition[] = [
  {
    id: "locale-emulator",
    name: "Locale Emulator",
    role: "区域语言",
    description: "通过 LEProc 以指定区域设置启动游戏。",
    pathPlaceholder: "例如 D:\\Tools\\LE\\LEProc.exe",
    argsPlaceholder: "-runas {GUID}",
    argsHint: "留空时使用 LE 的首个全局配置。",
    defaultArgs: [],
  },
  {
    id: "magpie",
    name: "Magpie",
    role: "自动缩放",
    description: "游戏窗口出现后自动写入缩放规则并以托盘模式运行。",
    pathPlaceholder: "例如 D:\\Tools\\Magpie\\Magpie.exe",
    argsPlaceholder: "-t",
    argsHint: "保持 -t 可以不打开主窗口；缩放效果沿用 Magpie 默认配置。",
    defaultArgs: ["-t"],
  },
];

export function wrapperConfig(
  preferences: Pick<AppPreferences, "wrappers"> | null | undefined,
  id: string,
): WrapperConfig | null {
  return preferences?.wrappers.find((wrapper) => wrapper.id === id) ?? null;
}

export function isWrapperConfigured(
  preferences: Pick<AppPreferences, "wrappers"> | null | undefined,
  id: string,
): boolean {
  return Boolean(wrapperConfig(preferences, id)?.path.trim());
}

export function orderedWrapperIds(ids: Iterable<string>): string[] {
  const wanted = new Set(ids);
  return WRAPPER_DEFINITIONS.filter((definition) => wanted.has(definition.id)).map(
    (definition) => definition.id,
  );
}
