"""Pydantic models for Batua backend."""
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict


class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD
    description: str
    amount: float  # negative = expense, positive = income
    category: str = "Other"
    payment_method: str = ""
    quantity: int = 1  # quantity of items purchased/credited
    txn_type: str = ""  # "credit" (money in) | "debit" (money out) — derived from amount
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str
    description: str
    amount: float
    category: str = "Other"
    payment_method: str = ""
    quantity: int = 1
    notes: str = ""


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str | None = None
    description: str | None = None
    amount: float | None = None
    category: str | None = None
    payment_method: str | None = None
    quantity: int | None = None
    notes: str | None = None


class NLRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    text: str
    force_recurring: bool = False


class BulkNLRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    text: str


class BulkDelete(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ids: list[str] = []


class BulkCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    items: list[TransactionCreate] = []


class RecurringCreate(BaseModel):
    """Create the same entry across several months in one request."""
    model_config = ConfigDict(extra="ignore")
    description: str
    amount: float            # signed: negative = expense/debit, positive = credit
    category: str = "Other"
    payment_method: str = ""
    notes: str = ""
    day: int = 1             # day-of-month for each generated entry
    months: list[str] = []   # ["2025-10", "2025-11", ...]


class Budget(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    limit: float


class BudgetCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    category: str
    limit: float
