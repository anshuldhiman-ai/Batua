"""Pydantic models for Batua backend."""
import uuid
from datetime import datetime, timezone
from pydantic import BaseModel, Field, ConfigDict, model_validator


class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # YYYY-MM-DD
    description: str
    amount: float  # negative = expense, positive = income
    category: str = "Other"
    payment_method: str = ""
    quantity: int = 1  # quantity of items purchased/credited
    price: float = 0.0  # per-item price (₹); quantity × price = |amount|
    price_text: str = ""  # verbatim price cell from the source file (e.g. "120+240")
    txn_type: str = ""  # "credit" (money in) | "debit" (money out) — derived from amount
    notes: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @model_validator(mode="after")
    def _derive_price(self):
        """Fill in per-item price when the caller didn't supply one, so every
        stored transaction carries quantity × price = |amount| (like the
        Quantity / Price / Total Amount columns of an expense sheet)."""
        if self.price <= 0:
            qty = self.quantity if self.quantity and self.quantity > 0 else 1
            self.price = round(abs(self.amount) / qty, 2)
        return self


class TransactionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str
    description: str
    amount: float
    category: str = "Other"
    payment_method: str = ""
    quantity: int = 1
    price: float = 0.0
    price_text: str = ""
    notes: str = ""


class TransactionUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str | None = None
    description: str | None = None
    amount: float | None = None
    category: str | None = None
    payment_method: str | None = None
    quantity: int | None = None
    price: float | None = None
    price_text: str | None = None
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


class Goal(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: f"goal_{uuid.uuid4().hex[:12]}")
    name: str
    target_amount: float
    current_amount: float = 0.0
    target_date: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
