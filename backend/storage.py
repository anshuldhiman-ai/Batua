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
from typing import Optional

logger = logging.getLogger("batua.storage")


class SQLiteStorage:
    """SQLite-backed store using aiosqlite for async operations."""

    def __init__(self, path: str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._conn = None

    async def _get_conn(self):
        if self._conn is None:
            import aiosqlite
            self._conn = await aiosqlite.connect(self.path)
            await self._conn.execute("PRAGMA journal_mode=WAL")
            await self._conn.execute("PRAGMA synchronous=NORMAL")
        return self._conn

    async def _ensure_table(self, collection: str):
        conn = await self._get_conn()
        await conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {collection} (
                id TEXT PRIMARY KEY,
                data JSON NOT NULL
            )
        """)
        await conn.commit()

    def _build_where(self, query: Optional[dict]) -> tuple[str, list]:
        if not query:
            return "", []
        conditions = []
        params = []
        for key, value in query.items():
            conditions.append(f"json_extract(data, '$.{key}') = ?")
            params.append(value)
        return " WHERE " + " AND ".join(conditions), params

    async def all(self, collection: str, query: Optional[dict] = None) -> list[dict]:
        await self._ensure_table(collection)
        conn = await self._get_conn()
        where_clause, params = self._build_where(query)
        cursor = await conn.execute(f"SELECT data FROM {collection}{where_clause}", params)
        rows = await cursor.fetchall()
        return [json.loads(row[0]) for row in rows]

    async def get(self, collection: str, _id: str) -> Optional[dict]:
        await self._ensure_table(collection)
        conn = await self._get_conn()
        cursor = await conn.execute(
            f"SELECT data FROM {collection} WHERE id = ?", (_id,)
        )
        row = await cursor.fetchone()
        return json.loads(row[0]) if row else None

    async def insert(self, collection: str, doc: dict) -> dict:
        async with self._lock:
            await self._ensure_table(collection)
            conn = await self._get_conn()
            await conn.execute(
                f"INSERT INTO {collection} (id, data) VALUES (?, ?)",
                (doc["id"], json.dumps(doc))
            )
            await conn.commit()
        return doc

    async def insert_many(self, collection: str, docs: list[dict], progress_cb=None) -> int:
        """Insert multiple documents with optional progress callback.
        
        Args:
            collection: Collection/table name
            docs: List of documents to insert
            progress_cb: Optional callback(fraction) for progress updates
        """
        if not docs:
            return 0
        async with self._lock:
            await self._ensure_table(collection)
            conn = await self._get_conn()
            
            # Insert in batches for better performance with progress tracking
            batch_size = 500
            total = len(docs)
            inserted = 0
            
            for i in range(0, total, batch_size):
                batch = docs[i:i + batch_size]
                await conn.executemany(
                    f"INSERT INTO {collection} (id, data) VALUES (?, ?)",
                    [(doc["id"], json.dumps(doc)) for doc in batch]
                )
                inserted += len(batch)
                if progress_cb:
                    progress_cb(inserted / total)
            
            await conn.commit()
        return len(docs)
    
    async def filter_existing(self, collection: str, ids: list[str]) -> set[str]:
        """Return set of IDs that already exist in the collection.
        
        Much faster than loading all documents for duplicate checking.
        """
        if not ids:
            return set()
        await self._ensure_table(collection)
        conn = await self._get_conn()
        placeholders = ",".join("?" * len(ids))
        cursor = await conn.execute(
            f"SELECT id FROM {collection} WHERE id IN ({placeholders})", ids
        )
        rows = await cursor.fetchall()
        return {row[0] for row in rows}

    async def update(self, collection: str, _id: str, patch: dict) -> Optional[dict]:
        async with self._lock:
            doc = await self.get(collection, _id)
            if doc is None:
                return None
            doc.update(patch)
            conn = await self._get_conn()
            await conn.execute(
                f"UPDATE {collection} SET data = ? WHERE id = ?",
                (json.dumps(doc), _id)
            )
            await conn.commit()
            return doc

    async def delete(self, collection: str, _id: str) -> bool:
        async with self._lock:
            await self._ensure_table(collection)
            conn = await self._get_conn()
            cursor = await conn.execute(
                f"DELETE FROM {collection} WHERE id = ?", (_id,)
            )
            await conn.commit()
            return cursor.rowcount > 0

    async def delete_many(self, collection: str, ids: list[str]) -> int:
        if not ids:
            return 0
        async with self._lock:
            await self._ensure_table(collection)
            conn = await self._get_conn()
            placeholders = ",".join("?" * len(ids))
            cursor = await conn.execute(
                f"DELETE FROM {collection} WHERE id IN ({placeholders})", ids
            )
            await conn.commit()
            return cursor.rowcount

    async def clear(self, collection: str) -> int:
        async with self._lock:
            await self._ensure_table(collection)
            conn = await self._get_conn()
            cursor = await conn.execute(f"DELETE FROM {collection}")
            await conn.commit()
            return cursor.rowcount

    async def close(self):
        if self._conn:
            await self._conn.close()
            self._conn = None


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
        """Insert multiple documents with optional progress callback.
        
        Args:
            collection: Collection name
            docs: List of documents to insert
            progress_cb: Optional callback(fraction) for progress updates
        """
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
        """Return set of IDs that already exist in the collection.
        
        Much faster than loading all documents for duplicate checking.
        """
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
            "MongoDB unavailable (%s). Falling back to SQLite store at %s",
            exc,
            sqlite_path,
        )
        return SQLiteStorage(str(sqlite_path)), "sqlite"
