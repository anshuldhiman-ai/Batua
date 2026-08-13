"""Goals routes - savings goal tracking."""
from fastapi import APIRouter, HTTPException, Query
from app.models import Goal, GoalCreate
from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache

router = APIRouter()


@router.get("/")
async def list_goals():
    """List all savings goals."""
    storage = get_storage()
    return {"goals": await storage.all("goals")}


@router.post("/")
async def create_goal(payload: GoalCreate):
    """Create a new savings goal."""
    storage = get_storage()
    goal = Goal(**payload.model_dump())
    await storage.insert("goals", goal.model_dump())
    invalidate_analytics_cache()
    return goal.model_dump()


@router.put("/{goal_id}")
async def update_goal(goal_id: str, payload: GoalCreate):
    """Update an existing goal."""
    storage = get_storage()
    existing = await storage.all("goals", {"id": goal_id})
    if not existing:
        raise HTTPException(404, "Goal not found")
    
    updated = await storage.update("goals", goal_id, payload.model_dump())
    invalidate_analytics_cache()
    return updated


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str):
    """Delete a savings goal."""
    storage = get_storage()
    ok = await storage.delete("goals", goal_id)
    if not ok:
        raise HTTPException(404, "Goal not found")
    invalidate_analytics_cache()
    return {"deleted": 1}


@router.post("/{goal_id}/contribute")
async def contribute_to_goal(goal_id: str, amount: float = Query(..., gt=0)):
    """Add a contribution to a goal (increase current_amount)."""
    storage = get_storage()
    existing = await storage.all("goals", {"id": goal_id})
    if not existing:
        raise HTTPException(404, "Goal not found")
    
    goal = existing[0]
    new_amount = round(goal.get("current_amount", 0.0) + amount, 2)
    if new_amount > float(goal.get("target_amount", 0)):
        raise HTTPException(400, "Contribution exceeds the goal target")
    updated = await storage.update("goals", goal_id, {"current_amount": new_amount})
    invalidate_analytics_cache()
    return updated
