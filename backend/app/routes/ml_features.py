"""ML-powered features endpoints."""
from fastapi import APIRouter, HTTPException, Query
from starlette.concurrency import run_in_threadpool
from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache
import ml_nlp
import ml_analytics
import ml_goals
import ml_rag
import local_llm
import chat_engine
from pydantic import BaseModel

router = APIRouter()


class GoalCreate(BaseModel):
    name: str
    target_amount: float
    target_date: str
    current_amount: float = 0.0


class QuestionRequest(BaseModel):
    question: str
    # "rules" (patterns only) | "llm" (local model answers) | "hybrid"
    # (patterns compute, model rewords). Chosen in Settings on the frontend.
    mode: str = "hybrid"
    # Optional — when present, the question is routed through chat_engine
    # for session memory + follow-up resolution. Omitted -> identical
    # behavior to before (no new I/O), for backward compatibility.
    session_id: str | None = None


@router.post("/parse-local")
async def parse_transaction_local(text: str):
    """Parse transaction using local ML (no external API)."""
    result = ml_nlp.parse_transaction_local(text)
    if not result:
        raise HTTPException(400, "Failed to parse transaction")
    return result


@router.post("/classify")
async def classify_transaction(description: str):
    """Classify transaction category using ML."""
    return ml_nlp.classify_transaction_detailed(description)


@router.post("/recategorize")
async def recategorize_transactions(apply: bool = Query(False)):
    """Suggest or apply high-confidence local category repairs for existing transactions."""
    storage = get_storage()
    transactions = await storage.all("transactions")
    changes = []

    descriptions = [
        txn.get("description", "")
        for txn in transactions
        if txn.get("description")
    ]
    detailed = ml_nlp.classify_many_detailed(descriptions)

    for txn in transactions:
        description = txn.get("description", "")
        current = txn.get("category") or "Other"
        if not description:
            continue
        result = detailed.get(description, {})
        category = result.get("category")
        confidence = float(result.get("confidence") or 0)
        source = result.get("source")
        if not category or category == "Other" or category == current:
            continue
        if source != "keyword" and confidence < 0.8:
            continue
        changes.append({
            "id": txn.get("id"),
            "description": description,
            "from": current,
            "to": category,
            "confidence": confidence,
            "source": source,
        })

    if apply:
        for change in changes:
            if change["id"]:
                await storage.update("transactions", change["id"], {"category": change["to"]})
        if changes:
            invalidate_analytics_cache()

    return {"apply": apply, "count": len(changes), "changes": changes[:100]}


@router.get("/ml-status")
async def ml_status():
    """Check if ML features are available."""
    parser = ml_nlp.get_nlp_parser()
    classifier = ml_nlp.get_classifier()
    
    return {
        "nlp_parser_available": True,
        "nlp_parser_mode": "spacy" if parser and parser._initialized else "rules_fallback",
        "classifier_available": classifier._initialized if classifier else False,
        "gemini_available": False,  # Will be updated if needed
        # What the Natural Q&A runs on: pattern-matched answers, optionally
        # reworded by a local Ollama model when the server is reachable.
        "qa_llm_enabled": local_llm.is_enabled(),
        "qa_llm_model": local_llm.model_name(),
    }


@router.get("/spending-patterns")
async def analyze_spending_patterns():
    """Analyze spending patterns using ML."""
    try:
        storage = get_storage()
        transactions = await storage.all("transactions")
        analyzer = ml_analytics.get_pattern_analyzer()
        return analyzer.analyze_patterns(transactions)
    except Exception as exc:
        raise HTTPException(500, f"Failed to analyze spending patterns: {exc}") from exc


@router.get("/cash-flow-forecast")
async def forecast_cash_flow(months_ahead: int = Query(3, ge=1, le=12)):
    """Forecast cash flow for the next N months."""
    try:
        storage = get_storage()
        transactions = await storage.all("transactions")
        forecaster = ml_analytics.get_forecaster()
        return forecaster.forecast_cash_flow(transactions, months_ahead)
    except Exception as exc:
        raise HTTPException(500, f"Failed to forecast cash flow: {exc}") from exc


@router.post("/optimize-budget")
async def optimize_budgets(total_budget: float):
    """Suggest optimal budget allocations based on spending patterns."""
    storage = get_storage()
    transactions = await storage.all("transactions")
    
    optimizer = ml_analytics.get_budget_optimizer()
    recommendations = optimizer.optimize_budgets(transactions, total_budget)
    
    return recommendations


@router.post("/goals")
async def create_goal(goal: GoalCreate):
    """Create a new savings goal."""
    tracker = ml_goals.get_goal_tracker()
    goal_data = tracker.create_goal(
        goal.name,
        goal.target_amount,
        goal.target_date,
        goal.current_amount
    )
    return goal_data


@router.get("/goals/{goal_id}/predict")
async def predict_goal_completion(goal_id: str):
    """Predict if a goal will be met based on spending patterns."""
    storage = get_storage()
    transactions = await storage.all("transactions")
    
    # For now, return a mock prediction (in real app, goals would be stored)
    tracker = ml_goals.get_goal_tracker()
    
    # Create a mock goal for demonstration
    mock_goal = {
        "id": goal_id,
        "name": "Sample Goal",
        "target_amount": 50000,
        "current_amount": 15000,
        "target_date": "2024-12-31",
        "months_remaining": 6,
        "required_monthly_savings": 5833.33,
    }
    
    prediction = tracker.predict_goal_completion(mock_goal, transactions)
    return prediction


@router.get("/goals/{goal_id}/impact")
async def analyze_spending_impact(goal_id: str):
    """Analyze how current spending impacts goal progress."""
    storage = get_storage()
    transactions = await storage.all("transactions")
    
    tracker = ml_goals.get_goal_tracker()
    
    # Create a mock goal for demonstration
    mock_goal = {
        "id": goal_id,
        "target_amount": 50000,
        "current_amount": 15000,
        "required_monthly_savings": 5833.33,
    }
    
    impact = tracker.analyze_spending_impact(transactions, mock_goal)
    return impact


@router.get("/recommendations")
async def get_recommendations():
    """Generate personalized savings recommendations."""
    try:
        storage = get_storage()
        transactions = await storage.all("transactions")
        engine = ml_goals.get_recommendation_engine()
        return engine.generate_recommendations(transactions)
    except Exception as exc:
        raise HTTPException(500, f"Failed to generate recommendations: {exc}") from exc


@router.get("/anomalies")
async def get_anomalies():
    """On-demand anomaly detection — never auto-pushed, only surfaced when asked."""
    try:
        storage = get_storage()
        transactions = await storage.all("transactions")
        detector = ml_analytics.get_anomaly_detector()
        return detector.detect_anomalies(transactions)
    except Exception as exc:
        raise HTTPException(500, f"Failed to detect anomalies: {exc}") from exc


@router.post("/qa")
async def ask_question(request: QuestionRequest):
    """Answer a natural language question about finances.

    Without ``session_id``: identical to before — stateless single-turn
    answer, no new I/O. With ``session_id``: routes through ``chat_engine``
    for session memory, follow-up resolution, and intent tagging.
    """
    try:
        storage = get_storage()
        transactions = await storage.all("transactions")

        # Normalize mode names to match backend expectations
        mode = request.mode
        if mode == "llama":
            mode = "llm"  # Frontend uses "llama", backend expects "llm"

        if not request.session_id:
            qa = ml_rag.get_qa_system()
            # answer_question may call the local LLM (blocking HTTP) — run it
            # off the event loop so concurrent requests stay responsive.
            return await run_in_threadpool(
                qa.answer_question, request.question, transactions, mode
            )

        session_id = request.session_id
        if not (1 <= len(session_id) <= 128):
            raise HTTPException(400, "Invalid session_id")

        session = await chat_engine.load_session(storage, session_id)
        result = await run_in_threadpool(
            chat_engine.process_turn, session, request.question, transactions, mode
        )
        await chat_engine.save_session(storage, session)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Failed to answer question: {exc}") from exc


@router.get("/qa/suggestions")
async def get_qa_suggestions():
    """Get suggested questions to ask."""
    storage = get_storage()
    transactions = await storage.all("transactions")

    qa = ml_rag.get_qa_system()
    suggestions = qa.get_suggested_questions(transactions)

    return {"suggestions": suggestions}


@router.get("/chat/{session_id}")
async def get_chat_session(session_id: str):
    """Fetch a chat session's turn history (empty defaults if not found)."""
    storage = get_storage()
    session = await chat_engine.load_session(storage, session_id)
    return {"id": session["id"], "summary": session.get("summary", ""), "turns": session.get("turns", [])}


@router.delete("/chat/{session_id}")
async def reset_chat_session(session_id: str):
    """Clear a chat session's memory."""
    storage = get_storage()
    await chat_engine.delete_session(storage, session_id)
    return {"deleted": True}
