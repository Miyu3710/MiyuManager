import type { Location } from "react-router-dom";

export interface WorkOrigin {
  label: string;
  to: string;
}

export interface WorkDetailLocationState {
  workOrigin?: WorkOrigin;
}

export const workOrigins = {
  home: { label: "首页", to: "/" },
  library: { label: "游戏库", to: "/library" },
  collections: { label: "收藏集", to: "/collections" },
  stats: { label: "统计", to: "/stats" },
  settings: { label: "设置", to: "/settings" },
} satisfies Record<string, WorkOrigin>;

export function workLinkState(workOrigin: WorkOrigin) {
  return { workOrigin } satisfies WorkDetailLocationState;
}

export function workOriginFromState(state: unknown): WorkOrigin | null {
  if (!state || typeof state !== "object") {
    return null;
  }
  const candidate = (state as WorkDetailLocationState).workOrigin;
  if (!candidate || typeof candidate.label !== "string" || typeof candidate.to !== "string") {
    return null;
  }
  if (!candidate.label.trim() || !candidate.to.startsWith("/")) {
    return null;
  }
  return { label: candidate.label, to: candidate.to };
}

export function workOriginForPath(location: Pick<Location, "pathname">): WorkOrigin {
  if (location.pathname === "/") {
    return workOrigins.home;
  }
  if (location.pathname.startsWith("/collections")) {
    return workOrigins.collections;
  }
  if (location.pathname.startsWith("/stats")) {
    return workOrigins.stats;
  }
  if (location.pathname.startsWith("/settings")) {
    return workOrigins.settings;
  }
  return workOrigins.library;
}
