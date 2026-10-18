"""ML-powered analytics for spending patterns and forecasting."""
from __future__ import annotations

from typing import Dict, List
import logging

logger = logging.getLogger("batua.ml_analytics")

# pandas/numpy cost a few hundred ms to import and this module is imported at
# server boot (via the /ml routes) but only *used* when an analytics request
# actually lands. Import them lazily so startup doesn't pay for them; PEP 562
# ``__getattr__`` keeps the ``ml_analytics.pd`` access pattern working.
pd = None
np = None


def _ensure_libs():
    """Import pandas/numpy on first use and bind them as module globals."""
    global pd, np
    if pd is None:
        import pandas as _pd
        pd = _pd
    if np is None:
        import numpy as _np
        np = _np
    return pd, np


def __getattr__(name):
    if name in ("pd", "np"):
        _ensure_libs()
        return globals()[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


class SpendingPatternAnalyzer:
    """Analyze spending patterns using time series and clustering."""
    
    def __init__(self):
        _ensure_libs()
        self._initialized = False

    def analyze_patterns(self, transactions: List[Dict]) -> Dict:
        """Analyze spending patterns from transaction data."""
        if not transactions:
            return {"empty": True, "message": "Add transactions to generate spending patterns."}
        
        try:
            df = pd.DataFrame(transactions)
            if df.empty or "date" not in df or "amount" not in df:
                return {"empty": True, "message": "Transaction data is incomplete."}
            df['date'] = pd.to_datetime(df['date'], errors='coerce')
            df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
            df = df.dropna(subset=['date', 'amount'])
            df = df[df['amount'] < 0].copy()
            if df.empty:
                return {"empty": True, "message": "Add expense transactions to generate spending patterns."}
            df['amount'] = df['amount'].abs()
            if "category" not in df:
                df["category"] = "Other"
            df["category"] = df["category"].fillna("Other").replace("", "Other")
            df['month'] = df['date'].dt.to_period('M')
            df['weekday'] = df['date'].dt.day_name()
            df['hour'] = df['date'].dt.hour
            
            commitments = detect_recurring_commitments(transactions)
            months_seen = max(1, df['month'].nunique())
            monthly_expense_total = float(df['amount'].sum()) / months_seen
            fixed_monthly = float(commitments.get("fixed_monthly_total", 0.0))

            results = {
                "empty": False,
                "transaction_count": int(len(df)),
                "monthly_patterns": self._analyze_monthly_patterns(df),
                "weekday_patterns": self._analyze_weekday_patterns(df),
                "category_trends": self._analyze_category_trends(df),
                "spending_clusters": self._cluster_spending(df),
                "seasonal_patterns": self._detect_seasonal_patterns(df),
                "recurring_commitments": commitments,
                "fixed_vs_discretionary": {
                    "fixed_monthly": round(fixed_monthly, 2),
                    "discretionary_monthly": round(max(0.0, monthly_expense_total - fixed_monthly), 2),
                    "fixed_share": round(fixed_monthly / monthly_expense_total, 3) if monthly_expense_total > 0 else 0.0,
                },
            }
            
            return results
            
        except Exception as exc:
            logger.error(f"Error analyzing spending patterns: {exc}")
            return {}
    
    def _analyze_monthly_patterns(self, df: pd.DataFrame) -> Dict:
        """Analyze monthly spending patterns."""
        monthly = df.groupby('month')['amount'].agg(['sum', 'mean', 'count']).reset_index()
        monthly['month_str'] = monthly['month'].astype(str)
        
        # Calculate month-over-month growth
        monthly['mom_growth'] = monthly['sum'].pct_change().replace([np.inf, -np.inf], np.nan).fillna(0) * 100
        if len(monthly) < 3:
            # Too few points for a reliable regression — fall back to the
            # simple first-vs-last comparison.
            delta = monthly['sum'].iloc[-1] - monthly['sum'].iloc[0]
            threshold = max(monthly['sum'].mean() * 0.05, 1)
            trend = "increasing" if delta > threshold else "decreasing" if delta < -threshold else "stable"
        else:
            # Linear regression slope over ALL months, so intermediate data is
            # not ignored (6 months of oscillation with matching endpoints must
            # not read as "stable"). ``slope`` is ₹ of change per month.
            y = monthly['sum'].to_numpy(dtype=float)
            x = np.arange(len(y), dtype=float)
            slope = float(np.polyfit(x, y, 1)[0])
            threshold = max(float(monthly['sum'].mean()) * 0.05, 1.0)
            trend = "increasing" if slope > threshold else "decreasing" if slope < -threshold else "stable"
        
        return {
            "monthly_spending": monthly[['month_str', 'sum', 'mean', 'count', 'mom_growth']].to_dict('records'),
            "avg_monthly_spending": float(monthly['sum'].mean()),
            "trend": trend,
        }
    
    def _analyze_weekday_patterns(self, df: pd.DataFrame) -> Dict:
        """Analyze spending patterns by day of week."""
        weekday_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        weekday_spending = df.groupby('weekday')['amount'].sum().reindex(weekday_order, fill_value=0)
        total = float(weekday_spending.sum())
        
        # Find highest and lowest spending days
        highest_day = weekday_spending.idxmax()
        lowest_day = weekday_spending.idxmin()
        
        return {
            "weekday_spending": weekday_spending.to_dict(),
            "highest_spending_day": highest_day,
            "lowest_spending_day": lowest_day,
            "weekend_vs_weekday": {
                "weekend": float(weekday_spending[['Saturday', 'Sunday']].sum()),
                "weekday": float(weekday_spending[['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']].sum()),
                "total": total,
            }
        }
    
    def _analyze_category_trends(self, df: pd.DataFrame) -> Dict:
        """Analyze category spending trends over time."""
        category_monthly = df.groupby(['month', 'category'])['amount'].sum().unstack(fill_value=0)
        
        # Calculate growth rates for each category
        category_growth = {}
        for category in category_monthly.columns:
            if len(category_monthly[category]) > 1:
                first = category_monthly[category].iloc[0]
                last = category_monthly[category].iloc[-1]
                if first > 0:
                    growth = (last - first) / first * 100
                elif last > 0:
                    growth = 100.0
                else:
                    growth = 0.0
                category_growth[category] = float(growth)
        
        # Sort by growth rate
        sorted_growth = sorted(category_growth.items(), key=lambda x: x[1], reverse=True)
        
        return {
            "category_growth_rates": [{"category": cat, "growth_rate": rate} for cat, rate in sorted_growth],
            "top_growing_category": sorted_growth[0][0] if sorted_growth else None,
            "fastest_declining_category": sorted_growth[-1][0] if sorted_growth else None,
        }
    
    def _cluster_spending(self, df: pd.DataFrame) -> Dict:
        """Cluster transactions to find spending patterns."""
        try:
            from sklearn.preprocessing import StandardScaler
            from sklearn.cluster import KMeans
            
            # Prepare data for clustering
            category_spending = df.groupby('category')['amount'].sum().reset_index()
            
            if len(category_spending) < 3:
                return {"clusters": []}
            
            # Simple clustering based on spending amount
            scaler = StandardScaler()
            X = scaler.fit_transform(category_spending[['amount']])
            
            # Use 3 clusters: low, medium, high spending categories
            kmeans = KMeans(n_clusters=min(3, len(category_spending)), random_state=42, n_init=10)
            category_spending['cluster'] = kmeans.fit_predict(X)
            
            clusters = []
            for cluster_id in sorted(category_spending['cluster'].unique()):
                cluster_data = category_spending[category_spending['cluster'] == cluster_id]
                clusters.append({
                    "cluster_id": int(cluster_id),
                    "categories": cluster_data['category'].tolist(),
                    "total_spending": float(cluster_data['amount'].sum()),
                    "avg_spending": float(cluster_data['amount'].mean()),
                })

            # KMeans assigns cluster ids arbitrarily; the frontend labels tiers
            # positionally (first = "High spending volume"), so order by actual
            # average spend rather than cluster id.
            clusters.sort(key=lambda c: c["avg_spending"], reverse=True)

            return {"clusters": clusters}
            
        except Exception as exc:
            logger.warning(f"Clustering failed: {exc}")
            return {"clusters": []}
    
    def _detect_seasonal_patterns(self, df: pd.DataFrame) -> Dict:
        """Rank months by *total* spend to surface the real peak / quietest month.

        Previously this grouped by calendar month-of-year (1-12) and took the
        *mean* transaction amount, so "peak month" was whichever month had the
        biggest average transaction rather than the most total spend — a month
        with one large purchase wrongly outranked a month with many smaller
        ones (e.g. reporting November when March was actually the heaviest).
        We now rank by the summed spend of each real calendar month (YYYY-MM).
        """
        monthly_total = df.groupby('month')['amount'].sum()
        if monthly_total.empty:
            return {
                "peak_spending_month": None,
                "lowest_spending_month": None,
                "monthly_totals": {},
            }

        peak = monthly_total.idxmax()  # a pandas Period, e.g. Period('2025-03', 'M')
        low = monthly_total.idxmin()

        month_names = {
            1: 'January', 2: 'February', 3: 'March', 4: 'April',
            5: 'May', 6: 'June', 7: 'July', 8: 'August',
            9: 'September', 10: 'October', 11: 'November', 12: 'December',
        }
        # Month-of-year totals kept as genuine *seasonal* context (e.g. festive
        # months running high), distinct from the headline peak month above.
        season = df.groupby(df['date'].dt.month)['amount'].sum()

        return {
            "peak_spending_month": peak.strftime('%B %Y'),
            "peak_spending_amount": float(monthly_total.loc[peak]),
            "lowest_spending_month": low.strftime('%B %Y'),
            "lowest_spending_amount": float(monthly_total.loc[low]),
            "monthly_totals": {str(p): float(v) for p, v in monthly_total.items()},
            "seasonal_by_month": {month_names[m]: float(season[m]) for m in season.index},
        }


TREND_WINDOW = 6
BAND_Z = 1.28  # ~80% interval
SEASONAL_PERIOD = 12  # months


def _linear_trend_forecast(series, horizon: int):
    x = np.arange(len(series), dtype=float)
    slope, intercept = np.polyfit(x, series, 1)
    future_x = np.arange(len(series), len(series) + horizon, dtype=float)
    return intercept + slope * future_x


def _theil_sen_slope(y) -> float:
    """Median of all pairwise slopes — robust to a single outlier month.

    Least squares lets one large month (a bonus, an annual payment) tilt the
    whole line; the median pairwise slope barely reacts to it.
    """
    n = len(y)
    if n < 2:
        return 0.0
    slopes = [
        (float(y[j]) - float(y[i])) / (j - i)
        for i in range(n - 1)
        for j in range(i + 1, n)
    ]
    return float(np.median(slopes)) if slopes else 0.0


def _robust_trend_forecast(series, horizon: int):
    """Theil–Sen line: median slope, anchored to pass through the series mean."""
    y = np.asarray(series, dtype=float)
    slope = _theil_sen_slope(y)
    x = np.arange(len(y), dtype=float)
    intercept = float(np.mean(y - slope * x))
    future_x = np.arange(len(y), len(y) + horizon, dtype=float)
    return intercept + slope * future_x


def _damped_holt_forecast(series, horizon: int):
    """Holt's linear trend with damping; (alpha, beta, phi) fit by minimising SSE.

    This is the trained model for short monthly series: a level, a trend and a
    damping factor learned from the data itself. Damping is the standard
    antidote to over-extrapolating a noisy series — the slope decays with the
    forecast horizon instead of shooting off at the last observed slope.
    """
    y = np.asarray(series, dtype=float)
    n = len(y)
    if n < 3:
        return np.full(horizon, float(np.mean(y)))
    best = None
    for alpha in (0.2, 0.4, 0.6, 0.8):
        for beta in (0.05, 0.15, 0.3):
            for phi in (0.75, 0.85, 0.95):
                level, trend = float(y[0]), float(y[1] - y[0])
                sse = 0.0
                for t in range(1, n):
                    damped = level + phi * trend
                    err = float(y[t]) - damped
                    sse += err * err
                    new_level = alpha * float(y[t]) + (1 - alpha) * damped
                    new_trend = beta * (new_level - level) + (1 - beta) * phi * trend
                    level, trend = new_level, new_trend
                if best is None or sse < best[0]:
                    best = (sse, level, trend, phi)
    _, level, trend, phi = best
    out = []
    for h in range(1, horizon + 1):
        damping = sum(phi ** k for k in range(1, h + 1))
        out.append(level + damping * trend)
    return np.asarray(out, dtype=float)


def _seasonal_naive_forecast(series, horizon: int, period: int = SEASONAL_PERIOD):
    """Repeat last year's same month — the classic seasonal benchmark."""
    y = np.asarray(series, dtype=float)
    if len(y) < period:
        return None
    return np.asarray(
        [y[len(y) - period + ((h - 1) % period)] for h in range(1, horizon + 1)],
        dtype=float,
    )


def _median_level_forecast(series, horizon: int, window: int = 6):
    """Repeat the median of the recent window.

    For a salary credited in most months but missing in a few, the median is a
    far better "typical month" than the mean (which the missing months drag
    down); on this data it beats every trend model in the walk-forward.
    """
    y = np.asarray(series, dtype=float)
    if len(y) == 0:
        return np.zeros(horizon)
    k = min(window, len(y))
    return np.full(horizon, float(np.median(y[-k:])))


def _moving_average_forecast(series, horizon: int, window: int = 3):
    y = np.asarray(series, dtype=float)
    if len(y) == 0:
        return np.zeros(horizon)
    k = min(window, len(y))
    return np.full(horizon, float(np.mean(y[-k:])))


_FORECAST_CANDIDATES = (
    ("linear_trend", _linear_trend_forecast),
    ("robust_trend", _robust_trend_forecast),
    ("damped_holt", _damped_holt_forecast),
    ("seasonal_naive", _seasonal_naive_forecast),
    ("median_level", _median_level_forecast),
    ("moving_average", _moving_average_forecast),
)


def _walk_forward_errors(series, method_fn, folds: int = 3):
    """One-step-ahead errors for the last ``folds`` months (walk-forward)."""
    y = np.asarray(series, dtype=float)
    n = len(y)
    errs, signed = [], []
    for t in range(max(3, n - folds), n):
        train = y[max(0, t - TREND_WINDOW):t]
        if len(train) < 2:
            continue
        try:
            pred = float(method_fn(train, 1)[0])
        except Exception:
            continue
        errs.append(abs(float(y[t]) - pred))
        signed.append(float(y[t]) - pred)
    return errs, signed


def _select_forecast(series, horizon: int, folds: int = 3) -> Dict:
    """Backtest every candidate on the user's own data and keep the winner.

    Model selection *is* the training here: each candidate is evaluated
    walk-forward against the most recent months, and the one with the lowest
    MAE does the forecasting. ``moving_average`` doubles as the baseline, so
    the caller can report whether the chosen model actually beats "assume the
    recent average".
    """
    _ensure_libs()
    y = np.asarray(series, dtype=float)
    n = len(y)
    if n < 2:
        base = float(y[0]) if n else 0.0
        return {"method": "average", "center": np.full(horizon, base), "backtest": None}

    scores: Dict[str, float] = {}
    errors: Dict[str, list] = {}
    signatures: Dict[str, list] = {}
    for name, fn in _FORECAST_CANDIDATES:
        errs, signed = _walk_forward_errors(y, fn, folds)
        if errs:
            scores[name] = float(np.mean(errs))
            errors[name] = errs
            signatures[name] = signed

    if not scores:
        return {"method": "average", "center": np.full(horizon, float(np.mean(y))), "backtest": None}

    # Strict ``<`` keeps the earlier candidate on ties, so an exactly linear
    # series is reported (and modelled) as ``linear_trend``.
    best_name = None
    best_mae = None
    for name, _ in _FORECAST_CANDIDATES:
        if name in scores and (best_mae is None or scores[name] < best_mae - 1e-9):
            best_name, best_mae = name, scores[name]

    method_fn = dict(_FORECAST_CANDIDATES)[best_name]
    tail = y[-TREND_WINDOW:] if n > TREND_WINDOW else y
    center = np.asarray(method_fn(tail, horizon), dtype=float)

    signed = signatures.get(best_name, [])
    residual_sd = float(np.std(signed)) if len(signed) > 1 else float(best_mae)
    baseline_errs = errors.get("moving_average", [])
    baseline_mae = float(np.mean(baseline_errs)) if baseline_errs else None

    backtest = {
        "folds": len(errors.get(best_name, [])),
        "model_mae": float(best_mae),
        "baseline_mae": baseline_mae,
        "baseline": "3-month average",
        "beats_baseline": baseline_mae is not None and float(best_mae) < baseline_mae,
        "residual_sd": residual_sd,
        "candidates": {k: round(v, 2) for k, v in scores.items()},
    }
    return {"method": best_name, "center": center, "backtest": backtest}


def _net_backtest(income, expense, folds: int = 3) -> Dict | None:
    """Walk-forward check for the income-minus-expense composite forecast.

    Predicts each component one step ahead and nets them, so the score
    reflects the model we actually ship — not a single line fit on the
    volatile net series.
    """
    income = np.asarray(income, dtype=float)
    expense = np.asarray(expense, dtype=float)
    n = len(income)
    if n < 4:
        return None
    net = income - expense
    errs, signed, base_errs = [], [], []
    for t in range(max(3, n - folds), n):
        i_train = income[max(0, t - TREND_WINDOW):t]
        e_train = expense[max(0, t - TREND_WINDOW):t]
        if len(i_train) < 2:
            continue
        i_pred = float(_select_forecast(i_train, 1)["center"][0])
        e_pred = float(_select_forecast(e_train, 1)["center"][0])
        actual = float(net[t])
        pred = i_pred - e_pred
        errs.append(abs(actual - pred))
        signed.append(actual - pred)
        base_errs.append(abs(actual - float(_moving_average_forecast(net[max(0, t - 3):t], 1)[0])))
    if not errs:
        return None
    model_mae = float(np.mean(errs))
    baseline_mae = float(np.mean(base_errs)) if base_errs else None
    return {
        "folds": len(errs),
        "model_mae": model_mae,
        "baseline_mae": baseline_mae,
        "baseline": "3-month average",
        "beats_baseline": baseline_mae is not None and model_mae < baseline_mae,
        "residual_sd": float(np.std(signed)) if len(signed) > 1 else model_mae,
    }


class CashFlowForecaster:
    """Forecast cash flow with a backtest-selected time-series model."""
    
    def __init__(self):
        _ensure_libs()
        self._initialized = False

    def forecast_cash_flow(self, transactions: List[Dict], months_ahead: int = 3) -> Dict:
        """Forecast cash flow for the next N months.

        Income and expenses are modelled separately (a lumpy salary behaves
        nothing like steady spending) and netted for the headline projection.
        The month axis is made *continuous* first — a gap month is a real zero,
        not a month we silently skip, which previously compressed time and
        corrupted the trend and seasonality.
        """
        if not transactions:
            return {"empty": True, "message": "Add transactions to generate a cash-flow forecast."}

        try:
            df = pd.DataFrame(transactions)
            if df.empty or "date" not in df or "amount" not in df:
                return {"empty": True, "message": "Transaction data is incomplete."}
            df['date'] = pd.to_datetime(df['date'], errors='coerce')
            df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
            df = df.dropna(subset=['date', 'amount'])
            if df.empty:
                return {"empty": True, "message": "Add dated transactions to generate a forecast."}
            df = df.sort_values('date')

            # Continuous month grid (gaps become explicit zeros).
            df['period'] = df['date'].dt.to_period('M')
            months = pd.period_range(df['period'].min(), df['period'].max(), freq='M')
            income = (
                df.loc[df['amount'] > 0].groupby('period')['amount'].sum()
                .reindex(months, fill_value=0.0).to_numpy(dtype=float)
            )
            expense = (
                (-df.loc[df['amount'] < 0].groupby('period')['amount'].sum())
                .reindex(months, fill_value=0.0).to_numpy(dtype=float)
            )
            net = income - expense
            months_observed = len(months)

            # Forecast the two components separately, then net them: a lumpy
            # salary and steady spending average out far better than a single
            # line drawn through their volatile difference.
            income_sel = _select_forecast(income, months_ahead) if float(income.sum()) else None
            expense_sel = _select_forecast(expense, months_ahead) if float(expense.sum()) else None
            if income_sel and expense_sel:
                center = income_sel["center"] - expense_sel["center"]
                backtest = _net_backtest(income, expense)
                sigma = float(np.sqrt(
                    ((income_sel.get("backtest") or {}).get("residual_sd") or 0.0) ** 2
                    + ((expense_sel.get("backtest") or {}).get("residual_sd") or 0.0) ** 2
                ))
                method = income_sel["method"] if income_sel["method"] == expense_sel["method"] else "combined"
            else:
                net_sel = _select_forecast(net, months_ahead)
                center = net_sel["center"]
                backtest = net_sel["backtest"]
                method = net_sel["method"]
                sigma = backtest["residual_sd"] if backtest else float(np.std(net))
            half_width = BAND_Z * sigma * np.sqrt(np.arange(1, months_ahead + 1))

            last_month = months[-1].to_timestamp()
            future_months = [
                (last_month + pd.DateOffset(months=i)).strftime('%Y-%m')
                for i in range(1, months_ahead + 1)
            ]
            forecast_rows = [
                {"month": month, "predicted_cashflow": float(c), "lower": float(c - h), "upper": float(c + h)}
                for month, c, h in zip(future_months, center, half_width)
            ]

            # Relative error is measured against the size of the money flowing
            # through a month (spend + income), not net — net hovers near zero
            # and would make every forecast look catastrophically wrong.
            scale = max(float(np.mean(expense)), float(np.mean(income)), 1.0)
            rel_error = backtest["model_mae"] / scale if backtest else None
            if rel_error is None or not backtest["beats_baseline"]:
                confidence = "low"
            else:
                confidence = "high" if rel_error < 0.15 else "medium" if rel_error < 0.30 else "low"

            history = [
                {"month": str(p), "net": float(v), "income": float(i), "expense": float(e)}
                for p, v, i, e in zip(months[-12:], net[-12:], income[-12:], expense[-12:])
            ]

            return {
                "empty": False,
                "forecast": forecast_rows,
                "history": history,
                "next_month_forecast": forecast_rows[0] if forecast_rows else None,
                "three_month_forecast": forecast_rows[:3],
                "three_month_total": float(sum(row["predicted_cashflow"] for row in forecast_rows[:3])),
                "method": method,
                "confidence": confidence,
                "months_observed": int(months_observed),
                "backtest": backtest,
                "average_monthly_income": float(np.mean(income)),
                "average_monthly_expense": float(np.mean(expense)),
                "average_monthly_net": float(np.mean(net)),
                "components": {
                    "income": (
                        {"method": income_sel["method"], "forecast": [float(v) for v in income_sel["center"]]}
                        if income_sel else None
                    ),
                    "expense": (
                        {"method": expense_sel["method"], "forecast": [float(v) for v in expense_sel["center"]]}
                        if expense_sel else None
                    ),
                },
            }

        except Exception as exc:
            logger.error(f"Error forecasting cash flow: {exc}")
            return {}


class BudgetOptimizer:
    """Optimize budget allocations based on spending patterns."""
    
    def __init__(self):
        _ensure_libs()
        self._initialized = False

    def optimize_budgets(self, transactions: List[Dict], total_budget: float) -> Dict:
        """Suggest optimal budget allocations based on spending patterns."""
        if not transactions:
            return {}
        
        try:
            df = pd.DataFrame(transactions)
            df['amount'] = df['amount'].abs()
            
            # Calculate average spending by category
            category_spending = df.groupby('category')['amount'].mean()
            total_spending = category_spending.sum()
            
            if total_spending == 0:
                return {}
            
            # Calculate recommended budget based on historical spending + 10% buffer
            recommended = {}
            for category, avg_spend in category_spending.items():
                recommended[category] = {
                    "historical_avg": float(avg_spend),
                    "recommended_budget": float(avg_spend * 1.1),
                    "percentage": float((avg_spend / total_spending) * 100),
                }
            
            # Scale to fit total budget
            scale_factor = total_budget / (total_spending * 1.1)
            for category in recommended:
                recommended[category]["scaled_budget"] = float(recommended[category]["recommended_budget"] * scale_factor)
            
            return {
                "recommendations": recommended,
                "total_budget": total_budget,
                "total_historical_spending": float(total_spending),
            }
            
        except Exception as exc:
            logger.error(f"Error optimizing budgets: {exc}")
            return {}


class AnomalyDetector:
    """Flag unusual spending — on-demand only, never auto-pushed.

    Three cheap statistical rules over expense rows:
      1. outlier_txn: a transaction's amount exceeds its category's
         mean + 2*std (category needs >=5 expense txns for a meaningful std).
      2. category_spike: this month's category total exceeds 1.6x the
         trailing 3-month average for that category (min ₹500 delta so
         small categories don't generate noise).
      3. new_category: spend this month in a category with zero spend in
         any prior month, above a ₹1000 floor.
    """

    def __init__(self):
        _ensure_libs()
        self._initialized = False

    def detect_anomalies(self, transactions: List[Dict], limit: int = 8) -> Dict:
        if not transactions:
            return {"empty": True, "anomalies": []}
        try:
            df = pd.DataFrame(transactions)
            if df.empty or "date" not in df or "amount" not in df:
                return {"empty": True, "anomalies": []}
            df["date"] = pd.to_datetime(df["date"], errors="coerce")
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
            df = df.dropna(subset=["date", "amount"])
            df = df[df["amount"] < 0].copy()
            if df.empty:
                return {"empty": True, "anomalies": []}
            df["amount"] = df["amount"].abs()
            if "category" not in df:
                df["category"] = "Other"
            df["category"] = df["category"].fillna("Other").replace("", "Other")
            if "description" not in df:
                df["description"] = "Transaction"
            df["description"] = df["description"].fillna("Transaction").replace("", "Transaction")
            df["month"] = df["date"].dt.strftime("%Y-%m")

            months_sorted = sorted(df["month"].unique())
            if not months_sorted:
                return {"empty": True, "anomalies": []}
            current_month = months_sorted[-1]

            anomalies: List[Dict] = []

            # Rule 1 — per-category statistical outliers.
            for category, sub in df.groupby("category"):
                if len(sub) < 5:
                    continue
                mean = sub["amount"].mean()
                std = sub["amount"].std()
                if not std or pd.isna(std):
                    continue
                threshold = mean + 2 * std
                for _, row in sub[sub["amount"] > threshold].iterrows():
                    anomalies.append({
                        "type": "outlier_txn",
                        "category": str(category),
                        "description": (
                            f"₹{row['amount']:,.0f} at {row['description']} is unusually high "
                            f"for {category} (avg ₹{mean:,.0f})."
                        ),
                        "date": row["date"].strftime("%Y-%m-%d"),
                        "amount": float(row["amount"]),
                        "severity": "high" if row["amount"] > mean + 3 * std else "medium",
                    })

            # Rule 2 — this month's category total vs trailing 3-month average.
            monthly_cat = df.groupby(["month", "category"])["amount"].sum().unstack(fill_value=0)
            if current_month in monthly_cat.index:
                prior_months = [m for m in monthly_cat.index if m < current_month][-3:]
                if prior_months:
                    for category in monthly_cat.columns:
                        current_val = float(monthly_cat.loc[current_month, category])
                        trailing_avg = float(monthly_cat.loc[prior_months, category].mean())
                        delta = current_val - trailing_avg
                        if trailing_avg > 0 and current_val > trailing_avg * 1.6 and delta >= 500:
                            anomalies.append({
                                "type": "category_spike",
                                "category": str(category),
                                "description": (
                                    f"{category} spend this month (₹{current_val:,.0f}) is "
                                    f"{(current_val / trailing_avg):.1f}x the recent average "
                                    f"(₹{trailing_avg:,.0f})."
                                ),
                                "amount": current_val,
                                "severity": "high" if current_val > trailing_avg * 2.2 else "medium",
                            })

            # Rule 3 — brand-new category this month, above a noise floor.
            if len(months_sorted) > 1:
                prior_categories = set(df.loc[df["month"] != current_month, "category"].unique())
                current_categories = set(df.loc[df["month"] == current_month, "category"].unique())
                for category in current_categories - prior_categories:
                    amount = float(monthly_cat.loc[current_month, category]) if current_month in monthly_cat.index else 0.0
                    if amount >= 1000:
                        anomalies.append({
                            "type": "new_category",
                            "category": str(category),
                            "description": f"New spending category this month: {category} (₹{amount:,.0f}).",
                            "amount": amount,
                            "severity": "medium",
                        })

            severity_rank = {"high": 0, "medium": 1, "low": 2}
            anomalies.sort(key=lambda a: (severity_rank.get(a["severity"], 1), -a["amount"]))
            anomalies = anomalies[:limit]
            return {"empty": not anomalies, "anomalies": anomalies}
        except Exception as exc:
            logger.error(f"Error detecting anomalies: {exc}")
            return {"empty": True, "anomalies": []}


def detect_recurring_commitments(transactions: List[Dict], min_months: int = 3,
                                 cv_threshold: float = 0.30) -> Dict:
    """Find stable, repeating monthly outflows ("fixed" costs).

    Name-agnostic by design — nothing here keys off category *labels*:

      * **categories** — billed in most months with a steady monthly total
        (rent, utilities, EMIs, a monthly SIP) → a fixed commitment.
      * **subscriptions** — one payee (description) charged in several distinct
        months for a similar amount (OTT, gym, SaaS) → recurring payment.

    Amounts are the median of the active months, so one double-billed month
    doesn't inflate the estimate.
    """
    empty = {"categories": [], "subscriptions": [], "fixed_monthly_total": 0.0, "months_observed": 0}
    if not transactions:
        return empty
    try:
        _ensure_libs()
        df = pd.DataFrame(transactions)
        if df.empty or "date" not in df or "amount" not in df:
            return empty
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
        df = df.dropna(subset=["date", "amount"])
        df = df[df["amount"] < 0].copy()
        if df.empty:
            return empty
        df["amount"] = df["amount"].abs()
        if "category" not in df:
            df["category"] = "Other"
        df["category"] = df["category"].fillna("Other").replace("", "Other")
        if "description" not in df:
            df["description"] = "Transaction"
        df["description"] = df["description"].fillna("Transaction").replace("", "Transaction")
        df["month"] = df["date"].dt.strftime("%Y-%m")

        all_months = sorted(df["month"].unique())
        total_months = len(all_months)
        if total_months == 0:
            return empty
        floor_months = min(min_months, total_months)

        monthly_cat = df.groupby(["month", "category"])["amount"].sum().unstack(fill_value=0.0)
        txn_per_month = df.groupby(["category", "month"]).size()
        categories = []
        for category in monthly_cat.columns:
            series = monthly_cat[category]
            present = int((series > 0).sum())
            if present < floor_months or present < 0.6 * total_months:
                continue
            active = series[series > 0]
            median_amount = float(active.median())
            if median_amount < 100:
                continue
            # A bill is charged about once a month; a category with several
            # hits a month is a habit bucket, however regular its total looks.
            per_month_counts = txn_per_month.loc[category]
            avg_per_active_month = float(per_month_counts[per_month_counts > 0].mean())
            if avg_per_active_month > 1.5:
                continue
            mean = float(active.mean())
            cv = float(active.std(ddof=0)) / mean if mean > 0 else 9.0
            if cv > cv_threshold:
                continue
            categories.append({
                "kind": "fixed",
                "category": str(category),
                "monthly_amount": round(median_amount, 2),
                "months_present": present,
                "months_total": total_months,
                "variability": round(cv, 3),
            })
        categories.sort(key=lambda c: c["monthly_amount"], reverse=True)

        subscriptions = []
        if total_months >= min_months:
            df["payee"] = df["description"].astype(str).str.strip().str.lower()
            for (category, payee), sub in df.groupby(["category", "payee"]):
                months_seen = int(sub["month"].nunique())
                if months_seen < min_months:
                    continue
                # A subscription is one fixed charge a month: at most two hits
                # per month, at a near-constant price, and big enough to matter.
                # A habitual snack bought once a month is recurring too, but it
                # isn't a subscription — the price-steadiness and floor filter
                # those out.
                if int(sub.groupby("month")["amount"].count().max()) > 2:
                    continue
                per_month = sub.groupby("month")["amount"].sum()
                mean = float(per_month.mean())
                if mean < 100:
                    continue
                amount_mean = float(sub["amount"].mean())
                amount_cv = float(sub["amount"].std(ddof=0)) / amount_mean if amount_mean > 0 else 1.0
                if amount_cv > 0.2:
                    continue
                subscriptions.append({
                    "kind": "subscription",
                    "category": str(category),
                    "payee": str(payee),
                    "monthly_amount": round(float(per_month.median()), 2),
                    "months_present": months_seen,
                    "variability": round(amount_cv, 3),
                })
            subscriptions.sort(key=lambda s: s["monthly_amount"], reverse=True)

        return {
            "categories": categories,
            "subscriptions": subscriptions[:10],
            "fixed_monthly_total": round(sum(c["monthly_amount"] for c in categories), 2),
            "months_observed": total_months,
        }
    except Exception as exc:
        logger.error(f"Error detecting recurring commitments: {exc}")
        return empty


# Global instances
_pattern_analyzer = None
_forecaster = None
_budget_optimizer = None
_anomaly_detector = None


def get_pattern_analyzer() -> SpendingPatternAnalyzer:
    """Get or create the pattern analyzer instance."""
    _ensure_libs()
    global _pattern_analyzer
    if _pattern_analyzer is None:
        _pattern_analyzer = SpendingPatternAnalyzer()
    return _pattern_analyzer


def get_forecaster() -> CashFlowForecaster:
    """Get or create the forecaster instance."""
    _ensure_libs()
    global _forecaster
    if _forecaster is None:
        _forecaster = CashFlowForecaster()
    return _forecaster


def get_budget_optimizer() -> BudgetOptimizer:
    """Get or create the budget optimizer instance."""
    _ensure_libs()
    global _budget_optimizer
    if _budget_optimizer is None:
        _budget_optimizer = BudgetOptimizer()
    return _budget_optimizer


def get_anomaly_detector() -> AnomalyDetector:
    """Get or create the anomaly detector instance."""
    _ensure_libs()
    global _anomaly_detector
    if _anomaly_detector is None:
        _anomaly_detector = AnomalyDetector()
    return _anomaly_detector
