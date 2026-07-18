import { api } from "@/lib/utils-finance";

/** @typedef {"daily"|"weekly"|"monthly"|"yearly"} AnalyticsView */
/** @typedef {"last_3_months"|"current_month"|"last_30_days"|"last_90_days"|"current_year"|"previous_year"|"single_month"|"month_range"|"custom"} DateRangePreset */

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

export function monthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getISOWeekKey(dateStr) {
  const d = parseISODate(dateStr);
  if (!d) return dateStr;
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() + 3 - ((copy.getDay() + 6) % 7));
  const week1 = new Date(copy.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((copy.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${copy.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Resolve preset + custom inputs into inclusive ISO date bounds.
 */
export function resolveDateRange(
  preset,
  {
    customStartDate = "",
    customEndDate = "",
    singleMonth = "",
    rangeStartMonth = "",
    rangeEndMonth = "",
  } = {}
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);

  const monthStart = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1);
  };
  const monthEnd = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m, 0);
  };

  switch (preset) {
    case "current_month": {
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return { startDate: toISODate(start), endDate: toISODate(end), label: "This month" };
    }
    case "last_30_days": {
      const start = addDays(end, -29);
      return { startDate: toISODate(start), endDate: toISODate(end), label: "Last 30 days" };
    }
    case "last_90_days": {
      const start = addDays(end, -89);
      return { startDate: toISODate(start), endDate: toISODate(end), label: "Last 90 days" };
    }
    case "last_3_months": {
      const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
      return { startDate: toISODate(start), endDate: toISODate(end), label: "Last 3 months" };
    }
    case "current_year": {
      const start = new Date(end.getFullYear(), 0, 1);
      return { startDate: toISODate(start), endDate: toISODate(end), label: "This year" };
    }
    case "previous_year": {
      const y = end.getFullYear() - 1;
      return {
        startDate: `${y}-01-01`,
        endDate: `${y}-12-31`,
        label: `Year ${y}`,
      };
    }
    case "single_month": {
      if (!singleMonth) {
        const ym = monthKey(end);
        return {
          startDate: toISODate(monthStart(ym)),
          endDate: toISODate(monthEnd(ym)),
          label: singleMonth || ym,
        };
      }
      return {
        startDate: toISODate(monthStart(singleMonth)),
        endDate: toISODate(monthEnd(singleMonth)),
        label: singleMonth,
      };
    }
    case "month_range": {
      const startYm = rangeStartMonth || monthKey(addDays(end, -60));
      const endYm = rangeEndMonth || monthKey(end);
      const [sY, sM] = startYm.split("-").map(Number);
      const [eY, eM] = endYm.split("-").map(Number);
      const start = new Date(sY, sM - 1, 1);
      const finish = new Date(eY, eM, 0);
      return {
        startDate: toISODate(start),
        endDate: toISODate(finish > end ? end : finish),
        label: `${startYm} → ${endYm}`,
      };
    }
    case "custom": {
      if (customStartDate && customEndDate) {
        return {
          startDate: customStartDate,
          endDate: customEndDate,
          label: `${customStartDate} → ${customEndDate}`,
        };
      }
      return resolveDateRange("last_3_months");
    }
    default:
      return resolveDateRange("last_3_months");
  }
}

export function filterTransactionsByRange(transactions, startDate, endDate) {
  return transactions.filter((t) => {
    if (!t.date) return false;
    if (startDate && t.date < startDate) return false;
    if (endDate && t.date > endDate) return false;
    return true;
  });
}

function emptyBucket(key, date) {
  return {
    key,
    date: date || key,
    income: 0,
    expense: 0,
    net: 0,
    savings: 0,
    transactions: 0,
  };
}

function addTxnToBucket(bucket, amount) {
  bucket.transactions += 1;
  if (amount >= 0) {
    bucket.income += amount;
  } else {
    bucket.expense += Math.abs(amount);
  }
  bucket.net = bucket.income - bucket.expense;
  bucket.savings = bucket.net;
}

/** Build ordered time-series buckets for the selected view and date range. */
export function aggregateSeries(transactions, view, startDate, endDate) {
  const filtered = filterTransactionsByRange(transactions, startDate, endDate);
  const map = new Map();

  const ensure = (key, date) => {
    if (!map.has(key)) map.set(key, emptyBucket(key, date));
    return map.get(key);
  };

  if (view === "daily") {
    const start = parseISODate(startDate);
    const end = parseISODate(endDate);
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const iso = toISODate(d);
      ensure(iso, iso);
    }
    for (const t of filtered) {
      addTxnToBucket(ensure(t.date, t.date), Number(t.amount) || 0);
    }
  } else if (view === "weekly") {
    for (const t of filtered) {
      const wk = getISOWeekKey(t.date);
      addTxnToBucket(ensure(wk, t.date), Number(t.amount) || 0);
    }
  } else if (view === "monthly") {
    const start = parseISODate(startDate);
    const end = parseISODate(endDate);
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (d <= last) {
      const ym = monthKey(d);
      ensure(ym, `${ym}-01`);
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    for (const t of filtered) {
      const ym = t.date.slice(0, 7);
      addTxnToBucket(ensure(ym, `${ym}-01`), Number(t.amount) || 0);
    }
  } else if (view === "yearly") {
    const startY = parseISODate(startDate).getFullYear();
    const endY = parseISODate(endDate).getFullYear();
    for (let y = startY; y <= endY; y++) {
      ensure(String(y), `${y}-01-01`);
    }
    for (const t of filtered) {
      const y = t.date.slice(0, 4);
      addTxnToBucket(ensure(y, `${y}-01-01`), Number(t.amount) || 0);
    }
  }

  return Array.from(map.values()).sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

export function computeCategoryBreakdown(transactions) {
  const expenses = transactions.filter((t) => Number(t.amount) < 0);
  const byCat = new Map();
  for (const t of expenses) {
    const cat = t.category || "Other";
    if (!byCat.has(cat)) byCat.set(cat, { category: cat, amount: 0, transactions: 0 });
    const row = byCat.get(cat);
    row.amount += Math.abs(Number(t.amount) || 0);
    row.transactions += 1;
  }
  return Array.from(byCat.values()).sort((a, b) => b.amount - a.amount);
}

export function computeDayExpenseMap(transactions) {
  const map = new Map();
  for (const t of transactions) {
    const amt = Number(t.amount) || 0;
    if (amt >= 0) continue;
    map.set(t.date, (map.get(t.date) || 0) + Math.abs(amt));
  }
  return map;
}

export function computeSummary(transactions, series, budgetRows = [], startDate, endDate) {
  const totalIncome = transactions
    .filter((t) => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalExpense = transactions
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 1000) / 10 : 0;

  const start = parseISODate(startDate);
  const end = parseISODate(endDate);
  const periodDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const periodMonths = Math.max(1, series.filter((s) => s.expense > 0 || s.income > 0).length || 1);

  const dayMap = computeDayExpenseMap(transactions);
  let highestDay = null;
  let lowestDay = null;
  for (const [date, amount] of dayMap) {
    if (!highestDay || amount > highestDay.amount) highestDay = { date, amount };
    if (!lowestDay || amount < lowestDay.amount) lowestDay = { date, amount };
  }

  const totalBudget = budgetRows.reduce((s, r) => s + (r.limit || 0), 0);
  const totalSpent = budgetRows.reduce((s, r) => s + (r.spent || 0), 0);
  const budgetRemaining = budgetRows.reduce((s, r) => s + (r.remaining || 0), 0);
  const budgetUtilization =
    totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 1000) / 10 : 0;

  return {
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
    avgDailySpend: totalExpense / periodDays,
    avgMonthlySpend: totalExpense / periodMonths,
    totalTransactions: transactions.length,
    budgetUtilization,
    budgetRemaining,
    highestExpenseDay: highestDay,
    lowestExpenseDay: lowestDay,
    periodDays,
    periodMonths,
  };
}

export function computeTrendAnalysis(transactions, monthlySeries = []) {
  const categories = computeCategoryBreakdown(transactions);
  const expenses = transactions.filter((t) => Number(t.amount) < 0);
  const expenseAmounts = expenses.map((t) => Math.abs(Number(t.amount) || 0));

  const avgTransactionAmount =
    expenses.length > 0
      ? expenseAmounts.reduce((a, b) => a + b, 0) / expenses.length
      : 0;

  const dates = [...new Set(expenses.map((t) => t.date))].sort();
  const periodDays = Math.max(1, dates.length);
  const totalExpense = expenseAmounts.reduce((a, b) => a + b, 0);

  const largest = expenses.reduce(
    (best, t) => {
      const amt = Math.abs(Number(t.amount) || 0);
      return !best || amt > best.amount
        ? { amount: amt, category: t.category, description: t.description }
        : best;
    },
    null
  );
  const smallest = expenses.reduce(
    (best, t) => {
      const amt = Math.abs(Number(t.amount) || 0);
      return !best || amt < best.amount
        ? { amount: amt, category: t.category, description: t.description }
        : best;
    },
    null
  );

  let fastestGrowing = null;
  if (monthlySeries.length >= 2) {
    const catByMonth = new Map();
    for (const t of expenses) {
      const ym = t.date.slice(0, 7);
      const cat = t.category || "Other";
      if (!catByMonth.has(cat)) catByMonth.set(cat, new Map());
      const m = catByMonth.get(cat);
      m.set(ym, (m.get(ym) || 0) + Math.abs(Number(t.amount) || 0));
    }
    let bestGrowth = -Infinity;
    for (const [cat, months] of catByMonth) {
      const keys = [...months.keys()].sort();
      if (keys.length < 2) continue;
      const first = months.get(keys[0]) || 0;
      const last = months.get(keys[keys.length - 1]) || 0;
      const growth = first > 0 ? ((last - first) / first) * 100 : last > 0 ? 100 : 0;
      if (growth > bestGrowth) {
        bestGrowth = growth;
        fastestGrowing = { category: cat, growth: Math.round(growth * 10) / 10 };
      }
    }
  }

  const weeks = new Set(expenses.map((t) => getISOWeekKey(t.date))).size || 1;

  return {
    highestSpendingCategory: categories[0] || null,
    lowestSpendingCategory: categories.length ? categories[categories.length - 1] : null,
    fastestGrowingCategory: fastestGrowing,
    avgTransactionAmount,
    avgDailyExpense: totalExpense / periodDays,
    avgWeeklyExpense: totalExpense / weeks,
    avgMonthlyExpense: totalExpense / Math.max(1, monthlySeries.length),
    largestTransaction: largest,
    smallestTransaction: smallest,
  };
}

export function computeFinancialHealth(summary, budgetRows) {
  const overBudget = budgetRows.filter((r) => r.status === "over").length;
  const warnBudget = budgetRows.filter((r) => r.status === "warn").length;
  let score = 50;
  if (summary.savingsRate >= 20) score += 25;
  else if (summary.savingsRate >= 10) score += 15;
  else if (summary.savingsRate >= 0) score += 5;
  else score -= 20;
  if (overBudget === 0 && warnBudget === 0) score += 15;
  else score -= overBudget * 10 + warnBudget * 5;
  if (summary.budgetUtilization > 0 && summary.budgetUtilization <= 80) score += 10;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let label = "Needs attention";
  if (score >= 80) label = "Excellent";
  else if (score >= 60) label = "Good";
  else if (score >= 40) label = "Fair";

  return { score, label, overBudget, warnBudget };
}

export function computeWeekdayPattern(transactions) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const totals = Object.fromEntries(days.map((d) => [d, 0]));
  for (const t of transactions) {
    if (Number(t.amount) >= 0) continue;
    const d = parseISODate(t.date);
    if (!d) continue;
    totals[days[d.getDay()]] += Math.abs(Number(t.amount) || 0);
  }
  return days.map((day) => ({ day, amount: totals[day] }));
}

/** Fetch server-side aggregated analytics summary (more efficient for large datasets). */
export async function fetchAnalyticsSummary({ startDate, endDate, granularity = "monthly", signal } = {}) {
  const params = new URLSearchParams({
    start: startDate,
    end: endDate,
    granularity
  });
  const res = await fetch(`${apiUrl("/analytics/summary")}?${params}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch analytics summary");
  return res.json();
}

/** Paginate through all transactions in a date range. */
export async function fetchAllTransactions({ startDate, endDate, signal } = {}) {
  const pageSize = 500;
  let page = 1;
  const all = [];
  while (true) {
    const { data } = await api.get("/transactions/", {
      params: {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        page,
        page_size: pageSize,
      },
      signal,
    });
    all.push(...(data.items || []));
    if (page >= (data.pages || 1)) break;
    page += 1;
  }
  return all;
}

export function sortTransactions(items, sortBy, sortOrder) {
  const dir = sortOrder === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    let av;
    let bv;
    if (sortBy === "amount") {
      av = Number(a.amount) || 0;
      bv = Number(b.amount) || 0;
    } else if (sortBy === "txn_type" || sortBy === "transaction_type") {
      av = Number(a.amount) >= 0 ? 1 : 0;
      bv = Number(b.amount) >= 0 ? 1 : 0;
    } else {
      av = a[sortBy] ?? "";
      bv = b[sortBy] ?? "";
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}
