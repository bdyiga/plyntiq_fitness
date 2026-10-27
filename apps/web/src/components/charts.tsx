import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatTrainingDate, shortDate } from "../lib/format";

/**
 * Chart tokens. One series colour (validated against the white card: ≥ 3:1,
 * inside the lightness band); text always uses the slate text tokens, never
 * the series colour. Identity within a chart comes from marker shape plus a legend.
 */
export const CHART = {
  series: "#2a78d6",
  grid: "#e2e8f0",
  axis: "#64748b",
  surface: "#ffffff",
  cursor: "#f1f5f9",
};

const axisProps = { stroke: CHART.axis, fontSize: 12, tickLine: false, axisLine: { stroke: CHART.grid } } as const;

export function ChartCard({
  title,
  subtitle,
  empty,
  table,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** Shown instead of the chart when there is nothing to plot. */
  empty?: string | null;
  table: { headers: string[]; rows: (string | number)[][] };
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>}
      {empty ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">{empty}</p>
      ) : (
        <>
          <div className="mt-3 h-56 w-full">{children}</div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-900">Show as a table</summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-left">
                <thead className="text-slate-600">
                  <tr>
                    {table.headers.map((h) => (
                      <th key={h} className="py-1 pr-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-slate-800">
                  {table.rows.map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {row.map((cell, j) => (
                        <td key={j} className="py-1 pr-3 tabular-nums">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <p className="font-medium text-slate-900">{title}</p>
      {lines.map((l) => (
        <p key={l} className="text-slate-700 tabular-nums">
          {l}
        </p>
      ))}
    </div>
  );
}

export interface WeeklyPoint {
  weekStart: string;
  value: number;
}

/** One column per ISO week, labelled by its Monday. */
export function WeeklyColumns({
  data,
  format,
  label,
}: {
  data: WeeklyPoint[];
  format: (value: number) => string;
  /** Tooltip label for the value, e.g. "Volume". */
  label: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="weekStart" tickFormatter={shortDate} minTickGap={16} {...axisProps} />
        <YAxis width={48} tickFormatter={(v: number) => compact(v)} allowDecimals={false} {...axisProps} />
        <Tooltip
          cursor={{ fill: CHART.cursor }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as WeeklyPoint | undefined;
            if (!active || !p) return null;
            return <TooltipBox title={`Week of ${formatTrainingDate(p.weekStart)}`} lines={[`${label}: ${format(p.value)}`]} />;
          }}
        />
        <Bar dataKey="value" fill={CHART.series} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface TrendPoint {
  date: string;
  value: number;
  /** Extra tooltip lines, e.g. the set behind an estimate. */
  detail?: string[];
  /** Groups points into marker shapes (e.g. assessment method). */
  group?: string;
}

const SHAPES = ["circle", "square", "triangle", "diamond", "star", "cross", "wye"] as const;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/**
 * A line over real calendar time (uneven gaps stay uneven). With `groups`,
 * each group gets its own marker shape and a legend entry, in the order given,
 * so a group keeps its shape when others are absent.
 */
export function TrendLine({
  data,
  format,
  label,
  groups,
  reversed = false,
  dateRange,
}: {
  data: TrendPoint[];
  format: (value: number) => string;
  label: string;
  groups?: { id: string; label: string }[];
  /** Lower is better (sprint time): draw the y-axis upside down so "up" means improved. */
  reversed?: boolean;
  /** Fixed x-axis span, so charts stacked together share one time axis. */
  dateRange?: { from: string; to: string };
}) {
  const points = data.map((d) => ({ ...d, t: toMs(d.date) }));
  const present = groups?.filter((g) => points.some((p) => p.group === g.id)) ?? [];
  const shapeOf = (id: string) => SHAPES[(groups?.findIndex((g) => g.id === id) ?? 0) % SHAPES.length]!;
  const marker = { r: 4, fill: CHART.series, stroke: CHART.surface, strokeWidth: 2 };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={dateRange ? [toMs(dateRange.from), toMs(dateRange.to)] : ["dataMin", "dataMax"]}
          allowDataOverflow={Boolean(dateRange)}
          padding={{ left: 12, right: 12 }}
          tickFormatter={(t: number) => shortDate(new Date(t).toISOString().slice(0, 10))}
          minTickGap={24}
          {...axisProps}
        />
        <YAxis
          width={48}
          domain={["auto", "auto"]}
          reversed={reversed}
          tickFormatter={(v: number) => format(v)}
          {...axisProps}
        />
        <Tooltip
          cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (TrendPoint & { t: number }) | undefined;
            if (!active || !p) return null;
            const groupLabel = groups?.find((g) => g.id === p.group)?.label;
            return (
              <TooltipBox
                title={formatTrainingDate(p.date)}
                lines={[`${label}: ${format(p.value)}`, ...(groupLabel ? [groupLabel] : []), ...(p.detail ?? [])]}
              />
            );
          }}
        />
        <Line
          dataKey="value"
          stroke={CHART.series}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={present.length ? false : marker}
          activeDot={{ ...marker, r: 6 }}
          isAnimationActive={false}
          legendType="none"
        />
        {present.map((g) => (
          <Scatter
            key={g.id}
            name={g.label}
            data={points.filter((p) => p.group === g.id)}
            dataKey="value"
            shape={shapeOf(g.id)}
            fill={CHART.series}
            stroke={CHART.surface}
            strokeWidth={2}
            legendType={shapeOf(g.id)}
            isAnimationActive={false}
          />
        ))}
        {present.length > 0 && (
          <Legend verticalAlign="top" align="right" height={24} iconSize={10} wrapperStyle={{ fontSize: 12 }}
            formatter={(value: string) => <span className="text-slate-700">{value}</span>}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** 950 · 1.3K · 12K: compact axis ticks. */
export function compact(value: number): string {
  if (Math.abs(value) < 1000) return String(Math.round(value));
  const k = value / 1000;
  return `${k >= 10 ? Math.round(k) : Math.round(k * 10) / 10}K`;
}
