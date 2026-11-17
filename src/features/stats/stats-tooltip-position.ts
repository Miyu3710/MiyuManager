import type { ChartTip } from "./StatsTooltip";

interface ChartTipContent {
  kicker: string;
  value: string;
  meta?: string;
}

export function tipFromElement(
  root: HTMLElement | null,
  element: HTMLElement,
  content: ChartTipContent,
  direction: "top" | "bottom" = "top",
): ChartTip | null {
  if (!root) return null;
  const rootBounds = root.getBoundingClientRect();
  const bounds = element.getBoundingClientRect();
  const left = bounds.left - rootBounds.left + bounds.width / 2;
  const resolvedDirection =
    direction === "top" && bounds.top < 92
      ? "bottom"
      : direction === "bottom" && window.innerHeight - bounds.bottom < 110
        ? "top"
        : direction;
  return {
    ...content,
    left,
    top:
      resolvedDirection === "bottom" ? bounds.bottom - rootBounds.top : bounds.top - rootBounds.top,
    direction: resolvedDirection,
    align: left < 104 ? "start" : left > rootBounds.width - 104 ? "end" : "center",
  };
}
