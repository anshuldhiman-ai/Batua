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
from sqlalchemy import update as sqlalchemy_update

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
    payment_method: Optional[str] = Field(default="", index=True, nullable=True)
    quantity: Optional[int] = Field(default=1, nullable=True)
    price: Optional[float] = Field(default=0.0, nullable=True)  # per-item price; quantity × price = |amount|
    price_text: Optional[str] = Field(default="", nullable=True)  # verbatim price cell (e.g. "120+240")
    txn_type: Optional[str] = Field(default="", index=True, nullable=True)  # "credit" | "debit"
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


class CustomCategoryDB(SQLModel, table=True):
    __tablename__ = "custom_categories"
    
    id: str = Field(primary_key=True, index=True)
    name: Optional[str] = Field(default="", nullable=True)


class GoalDB(SQLModel, table=True):
    __tablename__ = "goals"
    
    id: str = Field(primary_key=True, index=True)
    name: Optional[str] = Field(default="", nullable=True)
    target_amount: Optional[float] = Field(default=0.0, nullable=True)
    current_amount: Optional[float] = Field(default=0.0, nullable=True)
    target_date: Optional[str] = Field(default="", nullable=True)
    created_at: Optional[str] = Field(default=None, nullable=True)


class PersonEntryDB(SQLModel, table=True):
    """People Ledger entry — a single "gave" or "took" record.

    ``amount`` is always stored positive; the sign of the eventual per-person
    net balance comes from ``direction`` ("gave" = they owe you, "took" =
    you owe them). ``settled`` is per-entry so partial settlements can be
    tracked next to the original open balance.
    """
    __tablename__ = "people"

    id: str = Field(primary_key=True, index=True)
    person_name: Optional[str] = Field(default="", index=True, nullable=True)
    direction: Optional[str] = Field(default="", index=True, nullable=True)  # "gave" | "took"
    amount: Optional[float] = Field(default=0.0, nullable=True)
    reason: Optional[str] = Field(default="", nullable=True)
    date: Optional[str] = Field(default="", index=True, nullable=True)  # YYYY-MM-DD
    settled: Optional[bool] = Field(default=False, nullable=True)
    created_at: Optional[str] = Field(default=None, nullable=True)


class UserDB(SQLModel, table=True):
    """Local account for single-user auth (passwords are hashed)."""
    __tablename__ = "users"

    id: str = Field(primary_key=True, index=True)
    username: Optional[str] = Field(default="", index=True, nullable=True)
    email: Optional[str] = Field(default="", nullable=True)
    password_hash: Optional[str] = Field(default="", nullable=True)
    created_at: Optional[str] = Field(default=None, nullable=True)
    session_token: Optional[str] = Field(default=None, nullable=True)
    session_expires_at: Optional[str] = Field(default=None, nullable=True)
    reset_token: Optional[str] = Field(default=None, nullable=True)
    reset_token_expires_at: Optional[float] = Field(default=None, nullable=True)


_MODEL_MAP = {
    "transactions": TransactionDB,
    "budgets": BudgetDB,
    "sessions": SessionDB,
    "chat_sessions": SessionDB,
    "custom_categories": CustomCategoryDB,
    "goals": GoalDB,
    "people": PersonEntryDB,
    "users": UserDB,
}


def _get_model_class(collection: str) -> Any:
    if collection not in _MODEL_MAP:
        raise ValueError(f"Unknown collection '{collection}'. Registered collections are: {list(_MODEL_MAP.keys())}")
    return _MODEL_MAP[collection]


def _to_dict(obj: Any, collection: str) -> Dict[str, Any]:
    if obj is None:
        return {}
    if collection in {"sessions", "chat_sessions"}:
        try:
            data_dict = json.loads(obj.data or "{}")
        except (json.JSONDecodeError, TypeError):
            data_dict = {}
        return {"id": obj.id, **data_dict}
    
    # Convert model to dict
    d = obj.model_dump()
    # Prune only None values so the response matches MongoDB's dynamic-document
    # behaviour (MongoDB keeps empty-string fields; SQLite must too).
    return {k: v for k, v in d.items() if v is not None}


def _to_model(doc: Dict[str, Any], collection: str) -> Any:
    model_class = _get_model_class(collection)
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

    async def _ensure_indexes(self):
        """Create indexes on frequently queried columns if they don't exist."""
        from sqlalchemy import text
        async with self._lock:
            async with self._engine.begin() as conn:
                result = await conn.execute(text("PRAGMA index_list(transactions)"))
                existing = {row[1] for row in result}
                needed = ["idx_transactions_date", "idx_transactions_category", "idx_transactions_payment_method", "idx_transactions_txn_type"]
                for idx_name in needed:
                    if idx_name not in existing:
                        if idx_name == "idx_transactions_date":
                            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)"))
                        elif idx_name == "idx_transactions_category":
                            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)"))
                        elif idx_name == "idx_transactions_payment_method":
                            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON transactions(payment_method)"))
                        elif idx_name == "idx_transactions_txn_type":
                            await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_transactions_txn_type ON transactions(txn_type)"))

    @staticmethod
    def _migrate_columns(conn):
        """Add columns that create_all won't add to a pre-existing table
        (SQLite has no auto-migration; older store.db files lack `price`)."""
        from sqlalchemy import text
        result = conn.execute(text("PRAGMA table_info(transactions)"))
        existing = {row[1] for row in result}
        if existing and "price" not in existing:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN price FLOAT DEFAULT 0.0"))
        
        # Check if custom_categories table exists, create if not
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = {row[0] for row in result}
        if "custom_categories" not in tables:
            conn.execute(text("""
                CREATE TABLE custom_categories (
                    id VARCHAR PRIMARY KEY,
                    name VARCHAR
                )
            """))

    async def all(self, collection: str, query: Optional[dict] = None, order_by: Optional[str] = None, order_desc: bool = False, limit: Optional[int] = None, offset: Optional[int] = None) -> list[dict]:
        await self._ensure_db()
        await self._ensure_indexes()
        model_class = _get_model_class(collection)
        
        async with AsyncSession(self._engine) as session:
            statement = select(model_class)
            if query:
                for key, value in query.items():
                    # Handle complex MongoDB-style queries for SQLite
                    if isinstance(value, dict):
                        if "$gte" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr >= value["$gte"])
                        elif "$lte" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr <= value["$lte"])
                        elif "$gt" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr > value["$gt"])
                        elif "$lt" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr < value["$lt"])
                    else:
                        attr = getattr(model_class, key, None)
                        if attr is not None:
                            statement = statement.where(attr == value)
            
            # Add ordering
            if order_by:
                attr = getattr(model_class, order_by, None)
                if attr is not None:
                    if order_desc:
                        statement = statement.order_by(attr.desc())
                    else:
                        statement = statement.order_by(attr)
            
            # Add pagination
            if offset is not None:
                statement = statement.offset(offset)
            if limit is not None:
                statement = statement.limit(limit)
            
            results = await session.exec(statement)
            db_objs = results.all()
            return [_to_dict(obj, collection) for obj in db_objs]
    
    async def count(self, collection: str, query: Optional[dict] = None) -> int:
        """Count documents matching a query."""
        await self._ensure_db()
        await self._ensure_indexes()
        model_class = _get_model_class(collection)
        
        async with AsyncSession(self._engine) as session:
            from sqlalchemy import func
            statement = select(func.count()).select_from(model_class)
            
            if query:
                for key, value in query.items():
                    # Handle complex MongoDB-style queries for SQLite
                    if isinstance(value, dict):
                        if "$gte" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr >= value["$gte"])
                        elif "$lte" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr <= value["$lte"])
                        elif "$gt" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr > value["$gt"])
                        elif "$lt" in value:
                            attr = getattr(model_class, key, None)
                            if attr is not None:
                                statement = statement.where(attr < value["$lt"])
                    else:
                        attr = getattr(model_class, key, None)
                        if attr is not None:
                            statement = statement.where(attr == value)
            
            result = await session.exec(statement)
            return result.first() or 0

    async def get(self, collection: str, _id: str) -> Optional[dict]:
        await self._ensure_db()
        model_class = _get_model_class(collection)
        
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
        model_class = _get_model_class(collection)
        
        async with AsyncSession(self._engine) as session:
            statement = select(model_class.id).where(model_class.id.in_(ids))
            results = await session.exec(statement)
            return set(results.all())

    async def update(self, collection: str, _id: str, patch: dict) -> Optional[dict]:
        await self._ensure_db()
        model_class = _get_model_class(collection)
        
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

    async def update_many(self, collection: str, query: dict, patch: dict) -> int:
        """Apply one validated patch to every row matching an equality query."""
        if collection in {"sessions", "chat_sessions"}:
            raise ValueError("Bulk updates are not supported for session collections")
        await self._ensure_db()
        model_class = _get_model_class(collection)
        filters = []
        for key, value in query.items():
            attr = getattr(model_class, key, None)
            if attr is not None:
                filters.append(attr == value)
        values = {key: value for key, value in patch.items() if hasattr(model_class, key)}
        if not filters or not values:
            return 0
        async with self._lock:
            async with AsyncSession(self._engine) as session:
                result = await session.exec(sqlalchemy_update(model_class).where(*filters).values(**values))
                await session.commit()
                return result.rowcount or 0

    async def delete(self, collection: str, _id: str) -> bool:
        await self._ensure_db()
        model_class = _get_model_class(collection)
        
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
        model_class = _get_model_class(collection)
        
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
        model_class = _get_model_class(collection)
        
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
        import pymongo.errors
        
        try:
            # Create indexes for transactions collection
            await self._db.transactions.create_index([("date", -1)])
            await self._db.transactions.create_index([("category", 1), ("date", -1)])
            await self._db.transactions.create_index([("id", 1)], unique=True)
            self._indexes_created = True
            logger.info("MongoDB indexes created")
        except (pymongo.errors.OperationFailure, pymongo.errors.ServerSelectionTimeoutError) as exc:
            logger.warning(f"Failed to create MongoDB indexes: {exc}")

    async def all(self, collection: str, query: Optional[dict] = None, order_by: Optional[str] = None, order_desc: bool = False, limit: Optional[int] = None, offset: Optional[int] = None) -> list[dict]:
        await self._ensure_indexes()
        cursor = self._db[collection].find(query or {}, {"_id": 0})
        
        # Add ordering
        if order_by:
            sort_order = -1 if order_desc else 1
            cursor = cursor.sort(order_by, sort_order)
        
        # Add pagination
        if offset is not None:
            cursor = cursor.skip(offset)
        if limit is not None:
            cursor = cursor.limit(limit)
        
        return await cursor.to_list(length=None)
    
    async def count(self, collection: str, query: Optional[dict] = None) -> int:
        """Count documents matching a query."""
        await self._ensure_indexes()
        return await self._db[collection].count_documents(query or {})

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

    async def update_many(self, collection: str, query: dict, patch: dict) -> int:
        """Apply one patch to every document matching an equality query."""
        if not query or not patch:
            return 0
        result = await self._db[collection].update_many(query, {"$set": patch})
        return result.matched_count

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

_SQLITE_PATH = Path(__file__).parent / "data" / "store.db"


def _sqlite_fallback() -> SQLiteStorage:
    return SQLiteStorage(str(_SQLITE_PATH))


def _use_sqlite_first() -> bool:
    """True when the local SQLite store demonstrably holds the user's data.

    Presence of the file alone isn't enough — a failed Mongo probe still
    creates an empty ``store.db`` — so this only opts into the zero-wait path
    when the database actually has rows, or when a JSON store was migrated
    and never had a corresponding SQLite file.

    Escapes hatch: ``MONGO_REQUIRED=1`` keeps the old blocking behaviour for
    deployments where MongoDB is the system of record and a few seconds of
    startup latency is preferable to ever serving SQLite.
    """
    if os.environ.get("MONGO_REQUIRED", "0").strip().lower() in ("1", "true", "yes"):
        return False
    # A configured, non-local Mongo URL is a deliberate deployment choice —
    # probe it synchronously rather than silently defaulting to SQLite.
    mongo_url = os.environ.get("MONGO_URL", "")
    if mongo_url and "localhost" not in mongo_url and "127.0.0.1" not in mongo_url:
        return False
    if not _SQLITE_PATH.exists():
        # No SQLite file yet, but a legacy JSON store implies existing data.
        return (Path(__file__).parent / "data" / "store.json").exists()
    try:
        import sqlite3

        with sqlite3.connect(str(_SQLITE_PATH)) as conn:
            try:
                row = conn.execute("SELECT 1 FROM transactions LIMIT 1").fetchone()
            except sqlite3.OperationalError:
                # Table not created yet (empty/incompatible file).
                return False
        return row is not None
    except (sqlite3.Error, OSError):
        return False


async def _probe_mongo(mongo_url: str, db_name: str):
    """Return an open MongoStorage, or None when MongoDB isn't reachable."""
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        import pymongo.errors

        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=1500)
        await client.admin.command("ping")
        logger.info("Using MongoDB backend (%s / %s)", mongo_url, db_name)
        return MongoStorage(client, client[db_name])
    except (pymongo.errors.PyMongoError, OSError, asyncio.TimeoutError) as exc:
        logger.warning("MongoDB unavailable (%s).", exc)
        return None


async def create_storage() -> tuple[object, str]:
    """Return (storage, backend_name). Tries MongoDB, falls back to SQLite.

    The SQLite store is opened immediately and returned as long as
    ``storage.sqlite`` holds a live SQLite database — see ``_use_sqlite_first``.

    Set ``STORAGE_BACKEND=sqlite`` to skip the MongoDB probe entirely — used
    on Android where Mongo is never available and the 1.5s timeout is wasted.
    """
    # Short-circuit to SQLite when configured (mobile / offline use)
    if os.environ.get("STORAGE_BACKEND", "").strip().lower() == "sqlite":
        sqlite_path = Path(__file__).parent / "data" / "store.db"
        logger.info("STORAGE_BACKEND=sqlite, using SQLite directly at %s", sqlite_path)
        return SQLiteStorage(str(sqlite_path)), "sqlite"

    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "batua")

    # A 1.5s Mongo ping on a machine with no MongoDB is dead time in the
    # startup path. When a local SQLite store already holds data the user is
    # plainly running against it, so start on SQLite right away and check
    # MongoDB in the background instead of blocking boot on it.
    if _use_sqlite_first():
        logger.info("Local SQLite store has data; starting on SQLite (Mongo probe runs in background)")
        asyncio.create_task(_probe_mongo_in_background(mongo_url, db_name))
        return _sqlite_fallback(), "sqlite"

    mongo = await _probe_mongo(mongo_url, db_name)
    if mongo is not None:
        return mongo, "mongodb"

    sqlite_path = Path(__file__).parent / "data" / "store.db"
    logger.warning("Falling back to SQLite SQLModel store at %s", sqlite_path)
    return SQLiteStorage(str(sqlite_path)), "sqlite"


async def _probe_mongo_in_background(mongo_url: str, db_name: str) -> None:
    """Verify MongoDB is reachable, for logging/observability only.

    We deliberately do NOT switch the live app over to MongoDB after startup:
    ``set_storage`` already handed the SQLite instance to every request
    handler, and the two backends are not kept in sync, so a late swap would
    silently split the user's data across two stores mid-session.
    """
    mongo = await _probe_mongo(mongo_url, db_name)
    if mongo is not None:
        await mongo.close()
        logger.info(
            "MongoDB is reachable at %s, but the session is already running on "
            "SQLite; restart the backend to switch backends.",
            mongo_url,
        )
