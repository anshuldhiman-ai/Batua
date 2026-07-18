"""Categories route."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from parser import CATEGORIES
from app.dependencies import get_storage
from app.cache import invalidate_analytics_cache

router = APIRouter()

DEFAULT_CATEGORIES = list(CATEGORIES.keys()) + ["Other"]


class CategoryCreate(BaseModel):
    name: str


class CategoryRename(BaseModel):
    old_name: str
    new_name: str


class CategoryDelete(BaseModel):
    name: str
    reassign_to: str


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/")
async def categories():
    """Get all categories (default + custom + used)."""
    storage = get_storage()
    txns = await storage.all("transactions")
    used = {t.get("category", "Other") for t in txns}
    
    # Get custom categories from storage if they exist
    custom_cats = []
    try:
        custom = await storage.all("custom_categories")
        custom_cats = [c.get("name") for c in custom if c.get("name")]
    except Exception:
        pass
    
    allc = list(dict.fromkeys(DEFAULT_CATEGORIES + sorted(custom_cats) + sorted(used)))
    return {"categories": allc, "custom": custom_cats}


@router.post("/add")
async def add_category(payload: CategoryCreate):
    """Add a custom category."""
    if not payload.name or not payload.name.strip():
        raise HTTPException(400, "Category name cannot be empty")
    
    name = payload.name.strip()
    if name in DEFAULT_CATEGORIES:
        raise HTTPException(400, f"'{name}' is already a default category")
    
    storage = get_storage()
    
    # Check if already exists
    try:
        existing = await storage.all("custom_categories")
        if any(c.get("name") == name for c in existing):
            raise HTTPException(400, f"Category '{name}' already exists")
    except Exception:
        pass
    
    # Add custom category
    import uuid
    await storage.insert("custom_categories", {
        "id": str(uuid.uuid4()),
        "name": name
    })
    
    invalidate_analytics_cache()
    return {"name": name, "status": "added"}


@router.post("/rename")
async def rename_category(payload: CategoryRename):
    """Rename a category and update all transactions using it."""
    if not payload.old_name or not payload.new_name:
        raise HTTPException(400, "Category names cannot be empty")
    
    old_name = payload.old_name.strip()
    new_name = payload.new_name.strip()
    
    if old_name in DEFAULT_CATEGORIES:
        raise HTTPException(400, f"Cannot rename default category '{old_name}'")
    
    if old_name == new_name:
        raise HTTPException(400, "Old and new names are the same")
    
    storage = get_storage()
    
    # Update custom category
    try:
        custom = await storage.all("custom_categories")
        cat_to_update = next((c for c in custom if c.get("name") == old_name), None)
        if not cat_to_update:
            raise HTTPException(404, f"Custom category '{old_name}' not found")
        
        await storage.update("custom_categories", cat_to_update["id"], {"name": new_name})
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(404, f"Custom category '{old_name}' not found")
    
    # Update all transactions with this category
    txns = await storage.all("transactions")
    updated_count = 0
    for t in txns:
        if t.get("category") == old_name:
            await storage.update("transactions", t["id"], {"category": new_name})
            updated_count += 1
    
    invalidate_analytics_cache()
    return {"old_name": old_name, "new_name": new_name, "transactions_updated": updated_count}


@router.post("/delete")
async def delete_category(payload: CategoryDelete):
    """Delete a custom category and reassign its transactions."""
    if not payload.name or not payload.reassign_to:
        raise HTTPException(400, "Category names cannot be empty")
    
    name = payload.name.strip()
    reassign_to = payload.reassign_to.strip()
    
    if name in DEFAULT_CATEGORIES:
        raise HTTPException(400, f"Cannot delete default category '{name}'")
    
    if name == reassign_to:
        raise HTTPException(400, "Cannot reassign to the same category being deleted")
    
    storage = get_storage()
    
    # Delete custom category
    try:
        custom = await storage.all("custom_categories")
        cat_to_delete = next((c for c in custom if c.get("name") == name), None)
        if not cat_to_delete:
            raise HTTPException(404, f"Custom category '{name}' not found")
        
        await storage.delete("custom_categories", cat_to_delete["id"])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(404, f"Custom category '{name}' not found")
    
    # Reassign all transactions with this category
    txns = await storage.all("transactions")
    reassigned_count = 0
    for t in txns:
        if t.get("category") == name:
            await storage.update("transactions", t["id"], {"category": reassign_to})
            reassigned_count += 1
    
    invalidate_analytics_cache()
    return {"deleted": name, "reassigned_to": reassign_to, "transactions_reassigned": reassigned_count}
