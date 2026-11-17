export interface ChartTip {
  left: number | string;
  top: number | string;
  kicker: string;
  value: string;
  meta?: string;
  align?: "center" | "start" | "end";
  direction?: "top" | "bottom";
}

export function ChartTooltip({ tip }: { tip: ChartTip | null }) {
  if (!tip) return null;
  return (
    <span
      className={`stats-chart-tip is-${tip.align ?? "center"} is-${tip.direction ?? "top"}`}
      style={{ left: tip.left, top: tip.top }}
      role="tooltip"
    >
      <span className="stats-chart-tip__kicker">{tip.kicker}</span>
      <strong>{tip.value}</strong>
      {tip.meta ? <small>{tip.meta}</small> : null}
    </span>
  );
}
