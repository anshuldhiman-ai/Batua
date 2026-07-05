"""ML-powered goal tracking and savings predictions."""
import pandas as pd
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import logging

logger = logging.getLogger("batua.ml_goals")


class SavingsGoalTracker:
    """Track and predict progress towards savings goals."""
    
    def __init__(self):
        self._initialized = False
    
    def create_goal(self, name: str, target_amount: float, target_date: str, 
                   current_amount: float = 0.0) -> Dict:
        """Create a new savings goal."""
        try:
            target_dt = datetime.strptime(target_date, '%Y-%m-%d')
            today = datetime.now()
            days_remaining = (target_dt - today).days
            
            if days_remaining <= 0:
                raise ValueError("Target date must be in the future")
            
            # Calculate required monthly savings
            months_remaining = max(1, days_remaining / 30)
            required_monthly = (target_amount - current_amount) / months_remaining
            
            return {
                "id": f"goal_{datetime.now().timestamp()}",
                "name": name,
                "target_amount": target_amount,
                "current_amount": current_amount,
                "target_date": target_date,
                "days_remaining": days_remaining,
                "months_remaining": round(months_remaining, 1),
                "required_monthly_savings": round(required_monthly, 2),
                "progress_percentage": round((current_amount / target_amount) * 100, 1),
                "status": "on_track" if current_amount >= required_monthly * (months_remaining - 1) else "behind",
                "created_at": today.isoformat(),
            }
        except Exception as exc:
            logger.error(f"Error creating goal: {exc}")
            raise
    
    def predict_goal_completion(self, goal: Dict, transactions: List[Dict]) -> Dict:
        """Predict if the goal will be met based on spending patterns."""
        try:
            df = pd.DataFrame(transactions)
            df['date'] = pd.to_datetime(df['date'])
            df['amount'] = pd.abs(df['amount'])
            
            # Calculate average monthly savings (income - expenses)
            df['month'] = df['date'].dt.to_period('M')
            monthly_net = df.groupby('month')['amount'].sum()
            
            # Calculate average savings rate (assuming 20% of income is saved)
            avg_monthly_savings = monthly_net.mean() * 0.2 if len(monthly_net) > 0 else 0
            
            # Project savings
            months_remaining = goal['months_remaining']
            projected_savings = goal['current_amount'] + (avg_monthly_savings * months_remaining)
            
            # Calculate probability of success
            success_probability = min(100, max(0, (projected_savings / goal['target_amount']) * 100))
            
            # Generate recommendations
            recommendations = []
            if success_probability < 50:
                recommendations.append({
                    "type": "increase_savings",
                    "message": f"Increase monthly savings by ₹{round((goal['target_amount'] - projected_savings) / months_remaining, 2)}",
                    "priority": "high"
                })
            elif success_probability < 80:
                recommendations.append({
                    "type": "moderate_adjustment",
                    "message": f"Consider increasing savings by ₹{round((goal['target_amount'] - projected_savings) / months_remaining / 2, 2)}",
                    "priority": "medium"
                })
            
            if success_probability >= 100:
                recommendations.append({
                    "type": "early_completion",
                    "message": "You're on track to complete this goal early!",
                    "priority": "low"
                })
            
            return {
                "goal_id": goal['id'],
                "projected_completion_amount": round(projected_savings, 2),
                "success_probability": round(success_probability, 1),
                "predicted_completion_date": self._calculate_completion_date(
                    goal['current_amount'], goal['target_amount'], avg_monthly_savings
                ),
                "average_monthly_savings": round(avg_monthly_savings, 2),
                "required_monthly_savings": goal['required_monthly_savings'],
                "gap": round(goal['target_amount'] - projected_savings, 2),
                "recommendations": recommendations,
            }
            
        except Exception as exc:
            logger.error(f"Error predicting goal completion: {exc}")
            return {"error": str(exc)}
    
    def _calculate_completion_date(self, current: float, target: float, monthly_savings: float) -> Optional[str]:
        """Calculate when the goal will be completed based on current savings rate."""
        if monthly_savings <= 0:
            return None
        
        remaining = target - current
        months_needed = remaining / monthly_savings
        
        if months_needed <= 0:
            return datetime.now().strftime('%Y-%m-%d')
        
        completion_date = datetime.now() + timedelta(days=months_needed * 30)
        return completion_date.strftime('%Y-%m-%d')
    
    def analyze_spending_impact(self, transactions: List[Dict], goal: Dict) -> Dict:
        """Analyze how current spending impacts goal progress."""
        try:
            df = pd.DataFrame(transactions)
            df['date'] = pd.to_datetime(df['date'])
            df['amount'] = pd.abs(df['amount'])
            
            # Categorize expenses
            category_spending = df.groupby('category')['amount'].sum()
            
            # Identify non-essential spending that could be redirected to savings
            non_essential_categories = ['Entertainment', 'Shopping', 'Food Delivery', 'Subscriptions']
            non_essential_spending = category_spending[category_spending.index.isin(non_essential_categories)].sum()
            
            # Calculate potential savings if non-essential spending is reduced by 30%
            potential_savings = non_essential_spending * 0.3
            
            # Calculate impact on goal timeline
            months_saved = potential_savings / goal['required_monthly_savings']
            
            return {
                "goal_id": goal['id'],
                "non_essential_spending": round(non_essential_spending, 2),
                "potential_monthly_savings": round(potential_savings, 2),
                "months_saved_if_reduced": round(months_saved, 1),
                "new_completion_date": self._calculate_completion_date(
                    goal['current_amount'], goal['target_amount'], 
                    goal['required_monthly_savings'] + potential_savings
                ),
                "top_reduction_candidates": [
                    {"category": cat, "amount": round(amount, 2)}
                    for cat, amount in category_spending[category_spending.index.isin(non_essential_categories)].items()
                ],
            }
            
        except Exception as exc:
            logger.error(f"Error analyzing spending impact: {exc}")
            return {"error": str(exc)}


class RecommendationEngine:
    """Generate personalized savings recommendations."""
    
    def __init__(self):
        self._initialized = False
    
    def generate_recommendations(self, transactions: List[Dict]) -> Dict:
        """Generate personalized savings recommendations."""
        if not transactions:
            return {
                "empty": True,
                "recommendations": [],
                "total_potential_monthly_savings": 0,
                "total_potential_annual_savings": 0,
                "message": "Add expense transactions to generate recommendations.",
            }

        try:
            df = pd.DataFrame(transactions)
            if df.empty or "date" not in df or "amount" not in df:
                return {"empty": True, "recommendations": [], "message": "Transaction data is incomplete."}
            df['date'] = pd.to_datetime(df['date'], errors='coerce')
            df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
            df = df.dropna(subset=['date', 'amount'])
            df = df[df['amount'] < 0].copy()
            if df.empty:
                return {
                    "empty": True,
                    "recommendations": [],
                    "total_potential_monthly_savings": 0,
                    "total_potential_annual_savings": 0,
                    "message": "Add expense transactions to generate recommendations.",
                }
            if "category" not in df:
                df["category"] = "Other"
            df["category"] = df["category"].fillna("Other").replace("", "Other")
            df['amount'] = df['amount'].abs()
            df['month'] = df['date'].dt.to_period('M')
            months_observed = max(1, df['month'].nunique())
            monthly_by_category = df.groupby('category')['amount'].sum() / months_observed
            
            recommendations = []
            
            # Analyze subscription spending
            monthly_subscription_cost = float(monthly_by_category.get('Subscriptions', 0))
            if monthly_subscription_cost > 0:
                if monthly_subscription_cost > 500:
                    recommendations.append({
                        "type": "subscription_audit",
                        "title": "Review Subscriptions",
                        "description": f"You spend ₹{monthly_subscription_cost:.2f}/month on subscriptions. Consider canceling unused ones.",
                        "potential_savings": round(monthly_subscription_cost * 0.3, 2),
                        "priority": "medium",
                    })
            
            # Analyze food delivery spending
            monthly_food_delivery = float(monthly_by_category.get('Food Delivery', 0))
            if monthly_food_delivery > 0:
                if monthly_food_delivery > 1000:
                    recommendations.append({
                        "type": "reduce_food_delivery",
                        "title": "Reduce Food Delivery",
                        "description": f"You spend ₹{monthly_food_delivery:.2f}/month on food delivery. Cooking at home could save ~30%.",
                        "potential_savings": round(monthly_food_delivery * 0.3, 2),
                        "priority": "high",
                    })
            
            # Analyze entertainment spending
            monthly_entertainment = float(monthly_by_category.get('Entertainment', 0))
            if monthly_entertainment > 0:
                if monthly_entertainment > 500:
                    recommendations.append({
                        "type": "entertainment_budget",
                        "title": "Set Entertainment Budget",
                        "description": f"You spend ₹{monthly_entertainment:.2f}/month on entertainment. Consider setting a monthly limit.",
                        "potential_savings": round(monthly_entertainment * 0.2, 2),
                        "priority": "low",
                    })
            
            # Analyze shopping patterns
            monthly_shopping = float(monthly_by_category.get('Shopping', 0))
            if monthly_shopping > 0:
                if monthly_shopping > 2000:
                    recommendations.append({
                        "type": "shopping_control",
                        "title": "Control Impulse Shopping",
                        "description": f"You spend ₹{monthly_shopping:.2f}/month on shopping. Try the 30-day rule before purchases.",
                        "potential_savings": round(monthly_shopping * 0.25, 2),
                        "priority": "medium",
                    })
            
            # Sort by potential savings
            recommendations.sort(key=lambda x: x.get('potential_savings', 0), reverse=True)
            
            total_potential_savings = sum(r.get('potential_savings', 0) for r in recommendations)
            
            return {
                "empty": False,
                "recommendations": recommendations[:5],  # Top 5 recommendations
                "total_potential_monthly_savings": round(total_potential_savings, 2),
                "total_potential_annual_savings": round(total_potential_savings * 12, 2),
                "months_observed": int(months_observed),
            }
            
        except Exception as exc:
            logger.error(f"Error generating recommendations: {exc}")
            return {"recommendations": [], "error": str(exc)}

    def investment_nudge(self, transactions: List[Dict]) -> Optional[Dict]:
        """Cash-flow-only investment nudge (no portfolio/market data exists
        in this app). Fires only when this month's net cash flow is positive
        and the Investments-category spend rate trails the user's own
        savings rate — otherwise returns None."""
        if not transactions:
            return None
        try:
            df = pd.DataFrame(transactions)
            if df.empty or "date" not in df or "amount" not in df:
                return None
            df["date"] = pd.to_datetime(df["date"], errors="coerce")
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
            df = df.dropna(subset=["date", "amount"])
            if df.empty:
                return None
            if "category" not in df:
                df["category"] = "Other"
            df["category"] = df["category"].fillna("Other").replace("", "Other")
            df["month"] = df["date"].dt.strftime("%Y-%m")

            months = sorted(df["month"].unique())
            if not months:
                return None
            current_month = months[-1]
            month_df = df[df["month"] == current_month]

            income = float(month_df.loc[month_df["amount"] > 0, "amount"].sum())
            if income <= 0:
                return None
            expense = float(month_df.loc[month_df["amount"] < 0, "amount"].abs().sum())
            net_cash_flow = income - expense
            if net_cash_flow <= 0:
                return None

            savings_rate = net_cash_flow / income
            invest_spend = float(
                month_df.loc[
                    (month_df["amount"] < 0) & (month_df["category"] == "Investments"), "amount"
                ].abs().sum()
            )
            invest_rate = invest_spend / income
            if invest_rate >= savings_rate * 0.5:
                return None

            suggested_monthly = round(net_cash_flow * 0.3, 2)
            return {
                "type": "investment_nudge",
                "title": "Put idle cash flow to work",
                "description": (
                    f"You had a positive cash flow of ₹{net_cash_flow:,.2f} this month but only "
                    f"₹{invest_spend:,.2f} went to Investments. Consider directing part of your "
                    f"surplus (e.g. ₹{suggested_monthly:,.2f}/month) toward investments."
                ),
                "net_cash_flow": round(net_cash_flow, 2),
                "current_investment": round(invest_spend, 2),
                "suggested_monthly_investment": suggested_monthly,
            }
        except Exception as exc:
            logger.error(f"Error generating investment nudge: {exc}")
            return None


# Global instances
_goal_tracker = None
_recommendation_engine = None


def get_goal_tracker() -> SavingsGoalTracker:
    """Get or create the goal tracker instance."""
    global _goal_tracker
    if _goal_tracker is None:
        _goal_tracker = SavingsGoalTracker()
    return _goal_tracker


def get_recommendation_engine() -> RecommendationEngine:
    """Get or create the recommendation engine instance."""
    global _recommendation_engine
    if _recommendation_engine is None:
        _recommendation_engine = RecommendationEngine()
    return _recommendation_engine
