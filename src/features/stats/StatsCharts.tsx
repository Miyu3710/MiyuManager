import type { LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatPlaytimeSeconds } from "../../lib/format";
import { formatCompactDuration } from "./stats-utils";
import { ChartTooltip, type ChartTip } from "./StatsTooltip";
import { tipFromElement } from "./stats-tooltip-position";

export interface TrendPoint {
  key: string;
  label: string;
  detail: string;
  seconds: number;
}

export interface WeekdayTotal {
  key: string;
  label: string;
  seconds: number;
}

export interface TimeBucket {
  id: string;
  label: string;
  hours: string;
  seconds: number;
  count: number;
  tone: string;
  icon: LucideIcon;
}

export interface LengthBucket {
  id: string;
  label: string;
  range: string;
  count: number;
  seconds: number;
}

function smoothPath(points: { x: number; y: number }[]): string {
  const first = points[0];
  if (!first) {
    return "";
  }
  if (points.length === 1) {
    return `M ${first.x} ${first.y}`;
  }
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const following = points[index + 2] ?? next;
    if (!previous || !current || !next || !following) {
      break;
    }
    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (following.x - current.x) / 6;
    const control2Y = next.y - (following.y - current.y) / 6;
    path += ` C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y}`;
  }
  return path;
}

function axisIndexes(length: number): number[] {
  if (length <= 1) {
    return [0];
  }
  const step = Math.max(1, Math.round(length / 5));
  const indexes: number[] = [];
  for (let index = 0; index < length; index += step) {
    indexes.push(index);
  }
  if (indexes[indexes.length - 1] !== length - 1) {
    indexes.push(length - 1);
  }
  return indexes;
}

export function TrendChart({ points, total }: { points: TrendPoint[]; total: number }) {
  const reduceMotion = useReducedMotion();
  const chartRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 248;
  const padLeft = 46;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 30;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const max = Math.max(...points.map((point) => point.seconds), 1);
  const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: padLeft + step * index,
    y: padTop + (1 - point.seconds / max) * innerHeight,
  }));
  const linePath = smoothPath(coordinates);
  const firstCoordinate = coordinates[0];
  const lastCoordinate = coordinates[coordinates.length - 1];
  const areaPath =
    firstCoordinate && lastCoordinate
      ? `${linePath} L ${lastCoordinate.x} ${height - padBottom} L ${firstCoordinate.x} ${
          height - padBottom
        } Z`
      : "";
  const ticks = axisIndexes(points.length);
  const hoverPoint = hover === null ? null : coordinates[hover];

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (points.length === 0) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const localX = ((event.clientX - bounds.left) / bounds.width) * width;
    const ratio = Math.max(0, Math.min(1, (localX - padLeft) / innerWidth));
    setHover(Math.round(ratio * (points.length - 1)));
  };

  return (
    <div className="stats-trend-chart" ref={chartRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`游玩趋势，共 ${points.length} 个时间点，总计 ${formatPlaytimeSeconds(total)}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="stats-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.24" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g className="stats-trend-chart__grid" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <g key={ratio}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={padTop + innerHeight * ratio}
                y2={padTop + innerHeight * ratio}
              />
              <text
                x={padLeft - 9}
                y={padTop + innerHeight * ratio + 4}
                textAnchor="end"
                className="stats-trend-chart__axis"
              >
                {formatCompactDuration(max * (1 - ratio))}
              </text>
            </g>
          ))}
        </g>

        <motion.path
          key={`area-${points[0]?.key ?? "empty"}-${points.length}`}
          d={areaPath}
          fill="url(#stats-trend-fill)"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
        />
        <motion.path
          key={`line-${points[0]?.key ?? "empty"}-${points.length}`}
          d={linePath}
          fill="none"
          className="stats-trend-chart__line"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        />

        {ticks.map((index) => {
          const point = points[index];
          const coordinate = coordinates[index];
          if (!point || !coordinate) {
            return null;
          }
          return (
            <text
              key={point.key}
              x={coordinate.x}
              y={height - 8}
              textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
              className="stats-trend-chart__axis"
            >
              {point.label}
            </text>
          );
        })}

        {hoverPoint ? (
          <g className="stats-trend-chart__hover" aria-hidden="true">
            <line x1={hoverPoint.x} x2={hoverPoint.x} y1={padTop} y2={height - padBottom} />
            <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4.5" />
          </g>
        ) : null}
      </svg>

      <ChartTooltip
        tip={
          hoverPoint
            ? {
                left: `${(hoverPoint.x / width) * 100}%`,
                top: `${(hoverPoint.y / height) * 100}%`,
                kicker: hoverPoint.detail,
                value: formatPlaytimeSeconds(hoverPoint.seconds),
                align: hoverPoint.x < 90 ? "start" : hoverPoint.x > width - 90 ? "end" : "center",
              }
            : null
        }
      />

      {total === 0 ? <p className="stats-chart-empty">这个范围还没有已结算会话</p> : null}
    </div>
  );
}

export function WeekdayChart({ totals }: { totals: WeekdayTotal[] }) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const max = Math.max(...totals.map((day) => day.seconds), 1);
  const total = totals.reduce((sum, day) => sum + day.seconds, 0);

  return (
    <div
      className="stats-weekday"
      role="group"
      aria-label={`星期节奏，${totals
        .map((day) => `${day.label} ${formatPlaytimeSeconds(day.seconds)}`)
        .join("，")}`}
      ref={rootRef}
      onPointerLeave={() => setTip(null)}
    >
      {totals.map((day, index) => {
        const ratio = day.seconds / max;
        const content = {
          kicker: day.label,
          value: formatPlaytimeSeconds(day.seconds),
          meta:
            total > 0 && day.seconds > 0
              ? `占已结算时长 ${Math.round((day.seconds / total) * 100)}%`
              : "这个范围暂无记录",
        };
        return (
          <div
            className="stats-weekday__item"
            key={day.key}
            aria-label={`${day.label}，${formatPlaytimeSeconds(day.seconds)}`}
            onPointerEnter={(event) =>
              setTip(tipFromElement(rootRef.current, event.currentTarget, content))
            }
          >
            <span className="stats-weekday__value">
              {day.seconds > 0 ? formatCompactDuration(day.seconds) : "—"}
            </span>
            <span className="stats-weekday__track">
              <motion.span
                className={ratio === 1 && day.seconds > 0 ? "is-max" : ""}
                style={{ height: `${Math.max(day.seconds > 0 ? 8 : 3, ratio * 100)}%` }}
                initial={reduceMotion ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{
                  duration: 0.45,
                  delay: 0.06 + index * 0.035,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </span>
            <small>{day.label.replace("周", "")}</small>
          </div>
        );
      })}
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function TimeOfDayChart({ buckets }: { buckets: TimeBucket[] }) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const max = Math.max(...buckets.map((bucket) => bucket.seconds), 1);
  const total = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);

  if (total === 0) {
    return <p className="stats-chart-empty">当前范围还没有已结算会话</p>;
  }

  return (
    <div className="stats-timeofday" ref={rootRef} onPointerLeave={() => setTip(null)}>
      {buckets.map((bucket, index) => {
        const Icon = bucket.icon;
        const content = {
          kicker: `${bucket.label} ${bucket.hours}`,
          value: formatCompactDuration(bucket.seconds),
          meta: `${bucket.count} 次会话 · ${Math.round((bucket.seconds / Math.max(total, 1)) * 100)}% 时长`,
        };
        return (
          <div
            className="stats-timeofday__row"
            key={bucket.id}
            aria-label={`${bucket.label} ${bucket.hours}，${formatCompactDuration(bucket.seconds)}，${bucket.count} 次会话`}
            onPointerEnter={(event) =>
              setTip(tipFromElement(rootRef.current, event.currentTarget, content))
            }
          >
            <span className={`stats-timeofday__icon ${bucket.tone}`} aria-hidden="true">
              <Icon size={14} strokeWidth={1.7} />
            </span>
            <span className="stats-timeofday__label">
              <b>{bucket.label}</b>
              <small>{bucket.hours}</small>
            </span>
            <span className="stats-timeofday__track">
              <motion.i
                className={bucket.tone}
                style={{
                  width: `${Math.max(bucket.seconds > 0 ? 4 : 0, (bucket.seconds / max) * 100)}%`,
                }}
                initial={reduceMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{
                  duration: 0.5,
                  delay: 0.05 + index * 0.05,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            </span>
            <strong>{formatCompactDuration(bucket.seconds)}</strong>
          </div>
        );
      })}
      <ChartTooltip tip={tip} />
    </div>
  );
}

export function SessionLengthChart({
  buckets,
  averageSeconds,
}: {
  buckets: LengthBucket[];
  averageSeconds: number;
}) {
  const reduceMotion = useReducedMotion();
  const plotRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const max = Math.max(...buckets.map((bucket) => bucket.count), 1);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  if (total === 0) {
    return <p className="stats-chart-empty">当前范围还没有会话样本</p>;
  }

  return (
    <div className="stats-length">
      <div className="stats-length__plot" ref={plotRef} onPointerLeave={() => setTip(null)}>
        {buckets.map((bucket, index) => {
          const content = {
            kicker: bucket.label,
            value: `${bucket.count} 次会话`,
            meta: `${bucket.range} · 共 ${formatCompactDuration(bucket.seconds)}`,
          };
          return (
            <div
              className="stats-length__item"
              key={bucket.id}
              aria-label={`${bucket.label}，${bucket.count} 次会话，共 ${formatCompactDuration(bucket.seconds)}`}
              onPointerEnter={(event) =>
                setTip(tipFromElement(plotRef.current, event.currentTarget, content))
              }
            >
              <span className="stats-length__count">{bucket.count}</span>
              <span className="stats-length__track">
                <motion.span
                  style={{
                    height: `${Math.max(bucket.count > 0 ? 8 : 3, (bucket.count / max) * 100)}%`,
                  }}
                  initial={reduceMotion ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{
                    duration: 0.45,
                    delay: 0.06 + index * 0.045,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              </span>
              <b>{bucket.label}</b>
              <small>{bucket.range}</small>
            </div>
          );
        })}
        <ChartTooltip tip={tip} />
      </div>
      <p className="stats-length__average">
        平均 <b>{averageSeconds > 0 ? formatPlaytimeSeconds(averageSeconds) : "—"}</b>
      </p>
    </div>
  );
}
