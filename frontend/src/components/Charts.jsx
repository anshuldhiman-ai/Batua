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
  BarChart,
  Bar,
  Treemap,
  Legend,
} from "recharts";

import { formatINR, formatMonth, formatDate, categoryColor, addMonths, currentYearMonth } from "@/lib/utils-finance";
import { cn } from "@/lib/utils";

const AXIS = "hsl(var(--muted-foreground))";
const GRID = "hsl(var(--border))";
const INCOME_COLOR = "hsl(var(--chart-income))";
const EXPENSE_COLOR = "hsl(var(--chart-expense))";

function TooltipBox({ active, payload, label, labelFormatter }) {
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

function Empty({ label = "No data yet" }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function TimelineChart({ data, height = 300 }) {
  if (!data || !data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={INCOME_COLOR} stopOpacity={0.35} />
            <stop offset="100%" stopColor={INCOME_COLOR} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={EXPENSE_COLOR} stopOpacity={0.3} />
            <stop offset="100%" stopColor={EXPENSE_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          stroke={AXIS}
          fontSize={11}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <Tooltip content={<TooltipBox labelFormatter={formatMonth} />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="income" name="Income" stroke={INCOME_COLOR} strokeWidth={2} fill="url(#gInc)" />
        <Area type="monotone" dataKey="expense" name="Expense" stroke={EXPENSE_COLOR} strokeWidth={2} fill="url(#gExp)" />
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

export function CategoryDonut({ data, height = 300 }) {
  const [activeIndex, setActiveIndex] = React.useState(-1);
  if (!data || !data.length) return <Empty />;
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
          >
            {data.map((d) => (
              <Cell key={d.category} fill={categoryColor(d.category)} className="cursor-pointer focus:outline-none" />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted-foreground">Total spend</span>
        <span className="kpi-number text-2xl">{formatINR(total, { compact: true })}</span>
      </div>
    </div>
  );
}

export function MerchantsBar({ data }) {
  if (!data || !data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(280, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ left: 12, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
        <XAxis
          type="number"
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <YAxis
          type="category"
          dataKey="merchant"
          stroke={AXIS}
          fontSize={12}
          width={120}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="amount" name="Spent" radius={[0, 6, 6, 0]} fill="hsl(var(--primary))" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PaymentBar({ data }) {
  if (!data || !data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: -8, right: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey="method" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke={AXIS}
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => formatINR(v, { compact: true })}
        />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "hsl(var(--accent))" }} />
        <Bar dataKey="amount" name="Spent" radius={[6, 6, 0, 0]} fill="hsl(var(--primary))" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Weeks (each 7 cells, Mon→Sun) for a YYYY-MM month; null pads leading/trailing days. */
function buildMonthMatrix(ym) {
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstWeekday = (new Date(y, m - 1, 1).getDay() + 6) % 7; // shift so Monday = 0
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, date });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS_MINI = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS_PER_VIEW = 3;

const minYm = (a, b) => (a < b ? a : b);
const maxYm = (a, b) => (a > b ? a : b);

/** One compact month calendar; each day coloured by spend intensity, hover shows amount + count. */
function MonthGrid({ ym, dayMap, peak, today }) {
  const weeks = buildMonthMatrix(ym);
  let total = 0;
  let txns = 0;
  for (const [date, info] of dayMap) {
    if (date.slice(0, 7) === ym) {
      total += info.amount;
      txns += info.count;
    }
  }
  return (
    <div className="rounded-lg border border-border/60 p-2.5" data-testid={`calendar-month-${ym}`}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-semibold">{formatMonth(ym)}</span>
        <span className="text-[10px] text-muted-foreground">
          {formatINR(total, { compact: true })} · {txns} txn
        </span>
      </div>

      <div className="grid grid-cols-7 gap-[3px]">
        {WEEKDAYS_MINI.map((w, i) => (
          <div key={i} className="text-center text-[9px] font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      <div className="mt-[3px] grid grid-cols-7 gap-[3px]">
        {weeks.flat().map((cell, i) => {
          if (!cell) return <div key={i} className="aspect-square" />;
          const info = dayMap.get(cell.date);
          const amount = info?.amount || 0;
          const count = info?.count || 0;
          const intensity = amount > 0 ? amount / peak : 0;
          const heavy = intensity > 0.5;
          const isToday = cell.date === today;
          const title =
            amount > 0
              ? `${formatDate(cell.date)} — ${formatINR(amount)} spent · ${count} transaction${count === 1 ? "" : "s"}`
              : `${formatDate(cell.date)} — no spending`;
          return (
            <div
              key={i}
              title={title}
              data-testid={`calendar-day-${cell.date}`}
              className={cn(
                "group relative aspect-square rounded-[3px] transition-transform hover:z-10 hover:scale-110 hover:ring-2 hover:ring-primary/50",
                isToday && "ring-2 ring-amber-500"
              )}
              style={{
                backgroundColor:
                  amount > 0
                    ? `hsl(162 84% 35% / ${0.15 + intensity * 0.85})`
                    : "hsl(var(--muted))",
              }}
            >
              <span
                className={cn(
                  "absolute left-[2px] top-[1px] text-[8px] leading-none",
                  heavy ? "text-white/90" : "text-foreground/60"
                )}
              >
                {cell.day}
              </span>

              {/* Hover tooltip: amount spent + transaction count */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-lg group-hover:block">
                <div className="font-semibold">{formatDate(cell.date)}</div>
                {amount > 0 ? (
                  <>
                    <div className="font-medium text-primary">{formatINR(amount)} spent</div>
                    <div className="text-muted-foreground">
                      {count} transaction{count === 1 ? "" : "s"}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">No spending</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Spending calendar — shows 3 months per frame (navigable), each day coloured by
 * spend intensity; hovering a day shows the amount spent and the number of
 * transactions that day. Expects `days` = [{ date, amount, count }], `max` = peak day.
 */
export function SpendingCalendar({ days, max }) {
  // date(YYYY-MM-DD) -> { amount, count }. Defensive against legacy/odd API shapes.
  const dayMap = React.useMemo(() => {
    const m = new Map();
    (Array.isArray(days) ? days : []).forEach((d) => {
      if (d && typeof d.date === "string" && d.date.length >= 10) {
        m.set(d.date.slice(0, 10), { amount: d.amount || 0, count: d.count || 0 });
      }
    });
    return m;
  }, [days]);

  const monthsWithData = React.useMemo(() => {
    const s = new Set();
    for (const key of dayMap.keys()) s.add(key.slice(0, 7));
    return [...s].sort();
  }, [dayMap]);

  const latestYm = monthsWithData.length
    ? monthsWithData[monthsWithData.length - 1]
    : currentYearMonth();

  const [endYm, setEndYm] = React.useState(latestYm);
  React.useEffect(() => {
    setEndYm(latestYm);
  }, [latestYm]);

  if (!dayMap.size) return <Empty label="No spending data yet" />;

  const earliestYm = monthsWithData[0];
  const peak = max || 1;
  const today = todayISO();

  // Earliest window-end that still keeps the 3-month window within the data range.
  const minEnd = minYm(addMonths(earliestYm, MONTHS_PER_VIEW - 1), latestYm);
  const viewMonths = Array.from({ length: MONTHS_PER_VIEW }, (_, i) =>
    addMonths(endYm, -(MONTHS_PER_VIEW - 1 - i))
  ); // ascending: [end-2, end-1, end]

  let rangeTotal = 0;
  for (const [date, info] of dayMap) {
    if (viewMonths.includes(date.slice(0, 7))) rangeTotal += info.amount;
  }

  const canGoPrev = endYm > minEnd;
  const canGoNext = endYm < latestYm;
  const shift = (dir) =>
    setEndYm((cur) => maxYm(minEnd, minYm(latestYm, addMonths(cur, dir * MONTHS_PER_VIEW))));

  return (
    <div className="space-y-4" data-testid="spending-calendar">
      {/* Range header + navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold" data-testid="calendar-range">
            {formatMonth(viewMonths[0])} – {formatMonth(viewMonths[viewMonths.length - 1])}
          </p>
          <p className="text-xs text-muted-foreground">{formatINR(rangeTotal)} spent in view</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => shift(-1)}
            disabled={!canGoPrev}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
            data-testid="calendar-prev"
          >
            ← Earlier
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={!canGoNext}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
            data-testid="calendar-next"
          >
            Later →
          </button>
        </div>
      </div>

      {/* 3 months side by side */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {viewMonths.map((m) => (
          <MonthGrid key={m} ym={m} dayMap={dayMap} peak={peak} today={today} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[0.15, 0.35, 0.55, 0.85].map((o) => (
          <span
            key={o}
            className="inline-block h-3 w-5 rounded-sm"
            style={{ backgroundColor: `hsl(162 84% 35% / ${o})` }}
          />
        ))}
        <span>More spent</span>
        <span className="ml-2">· Hover a day for amount &amp; transactions</span>
      </div>
    </div>
  );
}

/** @deprecated use SpendingCalendar */
export function Heatmap(props) {
  return <SpendingCalendar days={props.days} max={props.max} />;
}

function TreemapCell(props) {
  const { x, y, width, height, name, root, depth, value } = props;
  const cat = root?.name || name;
  const color = categoryColor(cat);
  // Leaf cells (merchants) are tinted by their parent category; vary opacity a
  // touch by index so neighbouring merchants in a category stay distinguishable.
  const idx = props.index || 0;
  const opacity = depth >= 2 ? 0.72 + ((idx % 3) * 0.09) : 0.95;
  const showName = width > 54 && height > 26;
  const showValue = width > 70 && height > 44;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={5}
        ry={5}
        style={{
          fill: color,
          fillOpacity: opacity,
          stroke: "hsl(var(--card))",
          strokeWidth: 2.5,
        }}
      />
      {showName && (
        <text
          x={x + 8}
          y={y + 18}
          fill="#fff"
          fontSize={11}
          fontWeight={700}
          stroke="rgba(0,0,0,0.28)"
          strokeWidth={2.5}
          paintOrder="stroke"
          style={{ pointerEvents: "none" }}
        >
          {name}
        </text>
      )}
      {showValue && value > 0 && (
        <text
          x={x + 8}
          y={y + 33}
          fill="#fff"
          fontSize={10}
          fillOpacity={0.92}
          stroke="rgba(0,0,0,0.28)"
          strokeWidth={2.5}
          paintOrder="stroke"
          style={{ pointerEvents: "none" }}
        >
          {formatINR(value, { compact: true })}
        </text>
      )}
    </g>
  );
}

export function CategoryTreemap({ data }) {
  if (!data || !data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={380}>
      <Treemap
        data={data}
        dataKey="size"
        nameKey="name"
        aspectRatio={4 / 3}
        content={<TreemapCell />}
        isAnimationActive={false}
      >
        <Tooltip content={<TooltipBox />} />
      </Treemap>
    </ResponsiveContainer>
  );
}
