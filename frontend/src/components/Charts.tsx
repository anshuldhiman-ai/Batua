import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Sector,
  Legend,
} from "recharts";

import { formatINR, formatMonth, categoryColor } from "@/lib/utils-finance";
import CountUp from "@/components/CountUp";

/* Shared chart theme tokens — import these instead of redefining per chart. */
export const CHART_AXIS = "hsl(var(--muted-foreground))";
export const CHART_GRID = "hsl(var(--border))";
const INCOME_COLOR = "hsl(var(--chart-income))";
const EXPENSE_COLOR = "hsl(var(--chart-expense))";

/** Themed tooltip used by every Recharts chart in the app. */
export function ChartTooltip({ active, payload, label, labelFormatter }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      {label !== undefined && (
        <div className="mb-1 font-semibold">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: p.color || p.payload?.fill }}
          />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-medium tabular-nums">{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

/** Shared empty-chart placeholder. */
export function ChartEmpty({ label = "No data yet" }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function TimelineChart({ data, height = 300 }) {
  if (!data || !data.length) return <ChartEmpty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.5} />
            <stop offset="60%" stopColor={INCOME_COLOR} stopOpacity={0.12} />
            <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.45} />
            <stop offset="60%" stopColor={EXPENSE_COLOR} stopOpacity={0.1} />
            <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
          </linearGradient>
          {/* Soft glow so the stroke reads as a lit line, not a flat one. */}
          <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          stroke={CHART_AXIS}
          fontSize={11}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          stroke={CHART_AXIS}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <Tooltip content={<ChartTooltip labelFormatter={formatMonth} />} cursor={{ stroke: CHART_GRID, strokeWidth: 1 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area
          type="monotone"
          dataKey="income"
          name="Income"
          stroke={INCOME_COLOR}
          strokeWidth={2.5}
          fill="url(#gInc)"
          style={{ filter: "url(#lineGlow)" }}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
          isAnimationActive
          animationDuration={1100}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="expense"
          name="Expense"
          stroke={EXPENSE_COLOR}
          strokeWidth={2.5}
          fill="url(#gExp)"
          style={{ filter: "url(#lineGlow)" }}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
          isAnimationActive
          animationDuration={1100}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Active-slice renderer: slightly enlarges the hovered sector and draws a leader
 * line outward to a label sitting in the open space *outside* the ring — so the
 * hover text never overlaps the donut or the centre total.
 */
function renderActiveDonutShape(props) {
  const RADIAN = Math.PI / 180;
  const {
    cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value,
  } = props;
  const cos = Math.cos(-RADIAN * midAngle);
  const sin = Math.sin(-RADIAN * midAngle);
  const dir = cos >= 0 ? 1 : -1;
  // Leader line: arc edge -> elbow -> horizontal run, then text beyond it.
  const sx = cx + (outerRadius + 4) * cos;
  const sy = cy + (outerRadius + 4) * sin;
  const mx = cx + (outerRadius + 18) * cos;
  const my = cy + (outerRadius + 18) * sin;
  const ex = mx + dir * 20;
  const ey = my;
  const textAnchor = dir > 0 ? "start" : "end";
  const tx = ex + dir * 8;

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 5}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} strokeWidth={1.5} fill="none" />
      <circle cx={ex} cy={ey} r={2.5} fill={fill} stroke="none" />
      <text x={tx} y={ey - 6} textAnchor={textAnchor} dominantBaseline="central" fill="hsl(var(--foreground))" fontSize={12} fontWeight={600}>
        {payload.category}
      </text>
      <text x={tx} y={ey + 9} textAnchor={textAnchor} dominantBaseline="central" fill="hsl(var(--muted-foreground))" fontSize={11}>
        {formatINR(value)} · {(percent * 100).toFixed(0)}%
      </text>
    </g>
  );
}

/**
 * The one category donut used everywhere (Dashboard, Analytics, …):
 * same radii, hover leader-line labels and centre total on every page.
 */
export function CategoryDonut({ data, height = 300, centerLabel = "Total spend" }) {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  if (!data || !data.length) return <ChartEmpty />;
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    <div className="relative [&_.recharts-surface]:overflow-visible">
      <ResponsiveContainer width="100%" height={height}>
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Pie
            data={data}
            dataKey="amount"
            nameKey="category"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
            stroke="none"
            activeIndex={activeIndex >= 0 ? activeIndex : undefined}
            activeShape={renderActiveDonutShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(-1)}
            isAnimationActive
            animationDuration={900}
            animationBegin={120}
          >
            {data.map((d) => (
              <Cell key={d.category} fill={categoryColor(d.category)} className="cursor-pointer focus:outline-none" />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">{centerLabel}</span>
        <CountUp
          className="kpi-number text-2xl"
          value={total}
          format={(n) => formatINR(n, { compact: true })}
        />
      </div>
    </div>
  );
}
