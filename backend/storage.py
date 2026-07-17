"""Storage abstraction with a MongoDB (motor) primary and a SQLite fallback.

The app tries MongoDB first. If the server can't be reached within a short
timeout, it transparently falls back to a local SQLite database so the project runs
on a machine without MongoDB installed.

Both backends expose the same async interface. MongoDB documents are always
projected with ``{"_id": 0}`` so the Mongo ``_id`` never leaks into responses
(per spec — UUID string ``id`` is the identifier).
"""
import os
import json
import asyncio
import logging
from pathlib import Path
from typing import Optional, Any, Dict

from sqlmodel import SQLModel, Field, select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine

logger = logging.getLogger("batua.storage")


# --------------------------------------------------------------------------- #
# SQLModel Database Tables
# --------------------------------------------------------------------------- #

class TransactionDB(SQLModel, table=True):
    __tablename__ = "transactions"
    
    id: str = Field(primary_key=True, index=True)
    date: Optional[str] = Field(default="", index=True, nullable=True)  # YYYY-MM-DD
    description: Optional[str] = Field(default="", nullable=True)
    amount: Optional[float] = Field(default=0.0, nullable=True)
    category: Optional[str] = Field(default="Other", index=True, nullable=True)
    payment_method: Optional[str] = Field(default="", nullable=True)
    quantity: Optional[int] = Field(default=1, nullable=True)
    price: Optional[float] = Field(default=0.0, nullable=True)  # per-item price; quantity × price = |amount|
    price_text: Optional[str] = Field(default="", nullable=True)  # verbatim price cell (e.g. "120+240")
    txn_type: Optional[str] = Field(default="", nullable=True)  # "credit" | "debit"
    notes: Optional[str] = Field(default="", nullable=True)
    created_at: Optional[str] = Field(default=None, nullable=True)


class BudgetDB(SQLModel, table=True):
    __tablename__ = "budgets"
    
    id: str = Field(primary_key=True, index=True)
    category: Optional[str] = Field(default="", index=True, nullable=True)
    limit: Optional[float] = Field(default=0.0, nullable=True)


class SessionDB(SQLModel, table=True):
    __tablename__ = "sessions"
    
    id: str = Field(primary_key=True, index=True)
    data: Optional[str] = Field(default="{}", nullable=True)  # JSON-serialized session dictionary


_MODEL_MAP = {
    "transactions": TransactionDB,
    "budgets": BudgetDB,
    "sessions": SessionDB,
    "chat_sessions": SessionDB,
}


# --------------------------------------------------------------------------- #
# Helper to convert between DB instances and standard dicts
# --------------------------------------------------------------------------- #

def _to_dict(obj: Any, collection: str) -> Dict[str, Any]:
    if obj is None:
        return {}
    if collection in {"sessions", "chat_sessions"}:
        try:
            data_dict = json.loads(obj.data or "{}")
        except Exception:
            data_dict = {}
        return {"id": obj.id, **data_dict}
    
    # Convert model to dict
    d = obj.model_dump()
    # Prune None and empty strings so it behaves exactly like dynamic document storage
    return {k: v for k, v in d.items() if v is not None and v != ""}


def _to_model(doc: Dict[str, Any], collection: str) -> Any:
    model_class = _MODEL_MAP[collection]
    clean_doc = {k: v for k, v in doc.items() if v is not None}
    
    if collection in {"sessions", "chat_sessions"}:
        session_id = doc.get("id")
        data_dict = {k: v for k, v in doc.items() if k != "id"}
        return SessionDB(id=session_id, data=json.dumps(data_dict))
        
    return model_class(**clean_doc)


# --------------------------------------------------------------------------- #
# SQLite SQLModel-backed Storage Wrapper
# --------------------------------------------------------------------------- #

class SQLiteStorage:
    """SQLite-backed store using SQLModel/SQLAlchemy for async operations."""

    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        
        # Async engine with SQLite WAL journaling
        self._engine = create_async_engine(
            f"sqlite+aiosqlite:///{self.path}",
            echo=False,
            future=True
        )
        self._initialized = False

    async def _ensure_db(self):
        if self._initialized:
            return
        async with self._lock:
            if self._initialized:
                return
            async with self._engine.begin() as conn:
                await conn.run_sync(SQLModel.metadata.create_all)
                await conn.run_sync(self._migrate_columns)
            self._initialized = True

    @staticmethod
    def _migrate_columns(conn):
        """Add columns that create_all won't add to a pre-existing table
        (SQLite has no auto-migration; older store.db files lack `price`)."""
        from sqlalchemy import text
        existing = {row[1] for row in conn.execute(text("PRAGMA table_info(transactions)"))}
        if existing and "price" not in existing:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN price FLOAT DEFAULT 0.0"))
        if existing and "price_text" not in existing:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN price_text VARCHAR DEFAULT ''"))

    async def all(self, collection: str, query: Optional[dict] = None) -> list[dict]:
        await self._ensure_db()
        model_class = _MODEL_MAP[collection]
        
        async with AsyncSession(self._engine) as session:
            statement = select(model_class)
            if query:
                for key, value in query.items():
                    attr = getattr(model_class, key, None)
                    if attr is not None:
                        statement = statement.where(attr == value)
            
            results = await session.exec(statement)
            db_objs = results.all()
            return [_to_dict(obj, collection) for obj in db_objs]

    async def get(self, collection: str, _id: str) -> Optional[dict]:
        await self._ensure_db()
        model_class = _MODEL_MAP[collection]
        
        async with AsyncSession(self._engine) as session:
            db_obj = await session.get(model_class, _id)
            if db_obj is None:
                return None
            return _to_dict(db_obj, collection)

    async def insert(self, collection: str, doc: dict) -> dict:
        await self._ensure_db()
        db_obj = _to_model(doc, collection)
        
        async with self._lock:
            async with AsyncSession(self._engine) as session:
                session.add(db_obj)
                await session.commit()
        return doc

    async def insert_many(self, collection: str, docs: list[dict], progress_cb=None) -> int:
        if not docs:
            return 0
        await self._ensure_db()
        
        async with self._lock:
            async with AsyncSession(self._engine) as session:
                batch_size = 500
                total = len(docs)
                inserted = 0
                
                for i in range(0, total, batch_size):
                    batch = docs[i:i + batch_size]
                    db_objs = [_to_model(doc, collection) for doc in batch]
                    session.add_all(db_objs)
                    await session.commit()
                    
                    inserted += len(batch)
                    if progress_cb:
                        progress_cb(inserted / total)
                        
        return len(docs)
    
    async def filter_existing(self, collection: str, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        await self._ensure_db()
        model_class = _MODEL_MAP[collection]
        
        async with AsyncSession(self._engine) as session:
            statement = select(model_class.id).where(model_class.id.in_(ids))
            results = await session.exec(statement)
            return set(results.all())

    async def update(self, collection: str, _id: str, patch: dict) -> Optional[dict]:
        await self._ensure_db()
        model_class = _MODEL_MAP[collection]
        
        async with self._lock:
            async with AsyncSession(self._engine) as session:
                db_obj = await session.get(model_class, _id)
                if db_obj is None:
                    return None
                
                if collection in {"sessions", "chat_sessions"}:
                    current_data = json.loads(db_obj.data or "{}")
                    current_data.update(patch)
                    db_obj.data = json.dumps(current_data)
                else:
                    for key, val in patch.items():
                        if hasattr(db_obj, key):
                            setattr(db_obj, key, val)
                            
                session.add(db_obj)
                await session.commit()
                await session.refresh(db_obj)
                return _to_dict(db_obj, collection)

    async def delete(self, collection: str, _id: str) -> bool:
        await self._ensure_db()
        model_class = _MODEL_MAP[collection]
        
        async with self._lock:
            async with AsyncSession(self._engine) as session:
                db_obj = await session.get(model_class, _id)
                if db_obj is None:
                    return False
                await session.delete(db_obj)
                await session.commit()
                return True

    async def delete_many(self, collection: str, ids: list[str]) -> int:
        if not ids:
            return 0
        await self._ensure_db()
        model_class = _MODEL_MAP[collection]
        
        async with self._lock:
            async with AsyncSession(self._engine) as session:
                statement = select(model_class).where(model_class.id.in_(ids))
                results = await session.exec(statement)
                db_objs = results.all()
                
                count = len(db_objs)
                for obj in db_objs:
                    await session.delete(obj)
                await session.commit()
                return count

    async def clear(self, collection: str) -> int:
        await self._ensure_db()
        model_class = _MODEL_MAP[collection]
        
        async with self._lock:
            async with AsyncSession(self._engine) as session:
                statement = select(model_class)
                results = await session.exec(statement)
                db_objs = results.all()
                
                count = len(db_objs)
                for obj in db_objs:
                    await session.delete(obj)
                await session.commit()
                return count

    async def close(self):
        await self._engine.dispose()


# --------------------------------------------------------------------------- #
# MongoDB-backed Store Wrapper
# --------------------------------------------------------------------------- #

class MongoStorage:
    """MongoDB-backed store using motor."""

    def __init__(self, client, db):
        self._client = client
        self._db = db
        self._indexes_created = False

    async def _ensure_indexes(self):
        """Create indexes for better query performance."""
        if self._indexes_created:
            return
        
        try:
            # Create indexes for transactions collection
            await self._db.transactions.create_index([("date", -1)])
            await self._db.transactions.create_index([("category", 1), ("date", -1)])
            await self._db.transactions.create_index([("id", 1)], unique=True)
            self._indexes_created = True
            logger.info("MongoDB indexes created")
        except Exception as exc:
            logger.warning(f"Failed to create MongoDB indexes: {exc}")

    async def all(self, collection: str, query: Optional[dict] = None) -> list[dict]:
        await self._ensure_indexes()
        cur = self._db[collection].find(query or {}, {"_id": 0})
        return await cur.to_list(length=None)

    async def get(self, collection: str, _id: str) -> Optional[dict]:
        return await self._db[collection].find_one({"id": _id}, {"_id": 0})

    async def insert(self, collection: str, doc: dict) -> dict:
        await self._ensure_indexes()
        await self._db[collection].insert_one(dict(doc))
        return doc

    async def insert_many(self, collection: str, docs: list[dict], progress_cb=None) -> int:
        if not docs:
            return 0
        await self._ensure_indexes()
        
        # Insert in batches for better performance with progress tracking
        batch_size = 500
        total = len(docs)
        inserted = 0
        
        for i in range(0, total, batch_size):
            batch = docs[i:i + batch_size]
            await self._db[collection].insert_many([dict(d) for d in batch])
            inserted += len(batch)
            if progress_cb:
                progress_cb(inserted / total)
        
        return len(docs)
    
    async def filter_existing(self, collection: str, ids: list[str]) -> set[str]:
        if not ids:
            return set()
        cursor = self._db[collection].find({"id": {"$in": ids}}, {"id": 1})
        existing = await cursor.to_list(length=None)
        return {doc["id"] for doc in existing}

    async def update(self, collection: str, _id: str, patch: dict) -> Optional[dict]:
        await self._db[collection].update_one({"id": _id}, {"$set": patch})
        return await self.get(collection, _id)

    async def delete(self, collection: str, _id: str) -> bool:
        res = await self._db[collection].delete_one({"id": _id})
        return res.deleted_count > 0

    async def delete_many(self, collection: str, ids: list[str]) -> int:
        res = await self._db[collection].delete_many({"id": {"$in": ids}})
        return res.deleted_count

    async def clear(self, collection: str) -> int:
        res = await self._db[collection].delete_many({})
        return res.deleted_count

    async def close(self):
        self._client.close()


# --------------------------------------------------------------------------- #
# Connection entry point
# --------------------------------------------------------------------------- #

async def create_storage() -> tuple[object, str]:
    """Return (storage, backend_name). Tries MongoDB, falls back to SQLite."""
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "batua")
    try:
        from motor.motor_asyncio import AsyncIOMotorClient

        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1500)
        await client.admin.command("ping")
        logger.info("Using MongoDB backend (%s / %s)", mongo_url, db_name)
        return MongoStorage(client, client[db_name]), "mongodb"
    except Exception as exc:
        sqlite_path = Path(__file__).parent / "data" / "store.db"
        logger.warning(
            "MongoDB unavailable (%s). Falling back to SQLite SQLModel store at %s",
            exc,
            sqlite_path,
        )
        return SQLiteStorage(str(sqlite_path)), "sqlite"
