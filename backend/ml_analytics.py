"""ML-powered analytics for spending patterns and forecasting."""
import pandas as pd
import numpy as np
from typing import Dict, List
import logging

logger = logging.getLogger("batua.ml_analytics")


class SpendingPatternAnalyzer:
    """Analyze spending patterns using time series and clustering."""
    
    def __init__(self):
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
            
            results = {
                "empty": False,
                "transaction_count": int(len(df)),
                "monthly_patterns": self._analyze_monthly_patterns(df),
                "weekday_patterns": self._analyze_weekday_patterns(df),
                "category_trends": self._analyze_category_trends(df),
                "spending_clusters": self._cluster_spending(df),
                "seasonal_patterns": self._detect_seasonal_patterns(df),
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
        if len(monthly) < 2:
            trend = "stable"
        else:
            delta = monthly['sum'].iloc[-1] - monthly['sum'].iloc[0]
            threshold = max(monthly['sum'].mean() * 0.05, 1)
            trend = "increasing" if delta > threshold else "decreasing" if delta < -threshold else "stable"
        
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
            
            return {"clusters": clusters}
            
        except Exception as exc:
            logger.warning(f"Clustering failed: {exc}")
            return {"clusters": []}
    
    def _detect_seasonal_patterns(self, df: pd.DataFrame) -> Dict:
        """Detect seasonal spending patterns."""
        df['month_num'] = df['date'].dt.month
        monthly_avg = df.groupby('month_num')['amount'].mean()
        
        # Find peak and low months
        peak_month = monthly_avg.idxmax()
        low_month = monthly_avg.idxmin()
        
        month_names = {
            1: 'January', 2: 'February', 3: 'March', 4: 'April',
            5: 'May', 6: 'June', 7: 'July', 8: 'August',
            9: 'September', 10: 'October', 11: 'November', 12: 'December'
        }
        
        return {
            "peak_spending_month": month_names[peak_month],
            "lowest_spending_month": month_names[low_month],
            "monthly_averages": {month_names[m]: float(monthly_avg[m]) for m in monthly_avg.index},
        }


class CashFlowForecaster:
    """Forecast cash flow using time series models."""
    
    def __init__(self):
        self._initialized = False
    
    def forecast_cash_flow(self, transactions: List[Dict], months_ahead: int = 3) -> Dict:
        """Forecast cash flow for the next N months."""
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
            
            # Aggregate by month
            df['month'] = df['date'].dt.to_period('M')
            monthly_cashflow = df.groupby('month').agg({
                'amount': 'sum'
            }).reset_index()
            monthly_cashflow['month'] = monthly_cashflow['month'].astype(str)
            
            months_observed = len(monthly_cashflow)
            if months_observed < 3:
                # Not enough data for forecasting, use simple average
                avg_cashflow = monthly_cashflow['amount'].mean()
                forecast = [avg_cashflow] * months_ahead
            else:
                # Use simple moving average for forecasting
                recent_avg = monthly_cashflow['amount'].tail(3).mean()
                forecast = [recent_avg] * months_ahead
            
            # Generate future month labels
            last_month = pd.to_datetime(monthly_cashflow['month'].iloc[-1])
            future_months = []
            for i in range(1, months_ahead + 1):
                future_date = last_month + pd.DateOffset(months=i)
                future_months.append(future_date.strftime('%Y-%m'))
            
            forecast_rows = [{"month": month, "predicted_cashflow": float(cf)} for month, cf in zip(future_months, forecast)]
            confidence_score = min(0.9, 0.35 + (months_observed * 0.08))
            confidence = "high" if confidence_score >= 0.75 else "medium" if confidence_score >= 0.55 else "low"

            return {
                "empty": False,
                "forecast": forecast_rows,
                "next_month_forecast": forecast_rows[0] if forecast_rows else None,
                "three_month_forecast": forecast_rows[:3],
                "three_month_total": float(sum(row["predicted_cashflow"] for row in forecast_rows[:3])),
                "method": "moving_average",
                "confidence": confidence,
                "confidence_score": round(confidence_score, 2),
                "months_observed": int(months_observed),
            }
            
        except Exception as exc:
            logger.error(f"Error forecasting cash flow: {exc}")
            return {}


class BudgetOptimizer:
    """Optimize budget allocations based on spending patterns."""
    
    def __init__(self):
        self._initialized = False
    
    def optimize_budgets(self, transactions: List[Dict], total_budget: float) -> Dict:
        """Suggest optimal budget allocations based on spending patterns."""
        if not transactions:
            return {}
        
        try:
            df = pd.DataFrame(transactions)
            df['amount'] = pd.abs(df['amount'])
            
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


# Global instances
_pattern_analyzer = None
_forecaster = None
_budget_optimizer = None


def get_pattern_analyzer() -> SpendingPatternAnalyzer:
    """Get or create the pattern analyzer instance."""
    global _pattern_analyzer
    if _pattern_analyzer is None:
        _pattern_analyzer = SpendingPatternAnalyzer()
    return _pattern_analyzer


def get_forecaster() -> CashFlowForecaster:
    """Get or create the forecaster instance."""
    global _forecaster
    if _forecaster is None:
        _forecaster = CashFlowForecaster()
    return _forecaster


def get_budget_optimizer() -> BudgetOptimizer:
    """Get or create the budget optimizer instance."""
    global _budget_optimizer
    if _budget_optimizer is None:
        _budget_optimizer = BudgetOptimizer()
    return _budget_optimizer
