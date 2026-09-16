"""Pydantic models for Batua backend."""
import uuid
from datetime import datetime, timezone, date
from pydantic import BaseModel, Field, ConfigDict, model_validator, field_validator


class Transaction(BaseModel):
    """A financial transaction (expense or income)."""
    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "examples": [
                {
                    "id": "txn_1234567890",
                    "date": "2026-06-19",
                    "description": "Zomato",
                    "amount": -450.0,
                    "category": "Food Delivery",
                    "payment_method": "UPI",
                    "quantity": 1,
                    "price": 450.0,
                    "price_text": "",
                    "txn_type": "debit",
                    "notes": "Dinner with friends",
                    "created_at": "2026-06-19T10:30:00Z"
                }
            ]
        }
    )

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique transaction identifier")
    date: str = Field(..., description="Transaction date in YYYY-MM-DD format", examples=["2026-06-19"])
    description: str = Field(..., description="Transaction description or merchant name", examples=["Zomato", "Salary"])
    amount: float = Field(..., allow_inf_nan=False, description="Transaction amount (negative for expense, positive for income)", examples=[-450.0, 50000.0])
    category: str = Field(default="Other", description="Transaction category", examples=["Food Delivery", "Income"])
    payment_method: str = Field(default="", description="Payment method used", examples=["UPI", "Credit Card", "Cash"])
    quantity: int = Field(1, ge=1, le=100000, description="Quantity of items (for multi-item transactions)", examples=[1, 2])
    price: float = Field(default=0.0, description="Per-item price in INR (quantity × price = |amount|)", examples=[450.0, 25.0])
    price_text: str = Field(default="", description="Original price text from source (e.g., '120+240')", examples=["120+240", "15*2+20"])
    txn_type: str = Field(default="", description="Transaction type: 'credit' (money in) or 'debit' (money out)", examples=["credit", "debit"])
    notes: str = Field(default="", description="Additional notes or description", examples=["Dinner with friends"])
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="ISO timestamp when transaction was created")

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
    """Request model for creating a new transaction."""
    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "examples": [
                {
                    "date": "2026-06-19",
                    "description": "Zomato",
                    "amount": -450.0,
                    "category": "Food Delivery",
                    "payment_method": "UPI",
                    "quantity": 1,
                    "price": 450.0,
                    "price_text": "",
                    "notes": "Dinner with friends"
                }
            ]
        }
    )

    date: str = Field(..., description="Transaction date in YYYY-MM-DD format", examples=["2026-06-19"])
    description: str = Field(..., description="Transaction description or merchant name", examples=["Zomato", "Salary"])
    amount: float = Field(..., description="Transaction amount (negative for expense, positive for income)", examples=[-450.0, 50000.0])
    category: str = Field(default="Other", description="Transaction category", examples=["Food Delivery", "Income"])
    payment_method: str = Field(default="", description="Payment method used", examples=["UPI", "Credit Card", "Cash"])
    quantity: int = Field(default=1, description="Quantity of items", examples=[1, 2])
    price: float = Field(default=0.0, description="Per-item price in INR", examples=[450.0, 25.0])
    price_text: str = Field(default="", description="Original price text from source", examples=["120+240"])
    notes: str = Field(default="", description="Additional notes", examples=["Dinner with friends"])


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
    """Request model for natural language transaction parsing."""
    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "examples": [
                {
                    "text": "zomato 450 yesterday upi",
                    "force_recurring": False
                },
                {
                    "text": "salary +5k on 1st every month",
                    "force_recurring": False
                }
            ]
        }
    )

    text: str = Field(..., description="Natural language transaction description", examples=["zomato 450 yesterday upi", "salary +5k credit"])
    force_recurring: bool = Field(default=False, description="Force parsing as recurring transaction", examples=[False, True])


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
    """A budget limit for a specific category."""
    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "examples": [
                {
                    "id": "budget_1234567890",
                    "category": "Food Delivery",
                    "limit": 5000.0
                }
            ]
        }
    )

    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique budget identifier")
    category: str = Field(..., description="Category name for this budget", examples=["Food Delivery", "Transportation"])
    limit: float = Field(..., gt=0, allow_inf_nan=False, description="Monthly spending limit for this category", examples=[5000.0, 2000.0])


class BudgetCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    category: str = Field(..., min_length=1, max_length=80)
    limit: float = Field(..., gt=0, allow_inf_nan=False)


class Goal(BaseModel):
    """A savings goal with target amount and deadline."""
    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "examples": [
                {
                    "id": "goal_abc123def456",
                    "name": "Emergency Fund",
                    "target_amount": 100000.0,
                    "current_amount": 25000.0,
                    "target_date": "2026-12-31",
                    "created_at": "2026-06-19T10:30:00Z"
                }
            ]
        }
    )

    id: str = Field(default_factory=lambda: f"goal_{uuid.uuid4().hex[:12]}", description="Unique goal identifier")
    name: str = Field(..., description="Goal name", examples=["Emergency Fund", "Vacation", "New Laptop"])
    target_amount: float = Field(..., gt=0, allow_inf_nan=False, description="Target amount to save", examples=[100000.0, 50000.0])
    current_amount: float = Field(0.0, ge=0, allow_inf_nan=False, description="Current saved amount", examples=[25000.0, 0.0])
    target_date: str = Field(..., description="Target date in YYYY-MM-DD format", examples=["2026-12-31", "2026-09-01"])
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="ISO timestamp when goal was created")


class GoalCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    @field_validator("target_date")
    @classmethod
    def validate_target_date(cls, value):
        try:
            date.fromisoformat(value)
        except (TypeError, ValueError):
            raise ValueError("target_date must be YYYY-MM-DD") from None
        return value
    name: str = Field(..., min_length=1, max_length=120)
    target_amount: float = Field(..., gt=0, allow_inf_nan=False)
    current_amount: float = Field(0.0, ge=0, allow_inf_nan=False)
    target_date: str


class PersonEntry(BaseModel):
    """A single "I gave X to Rahul" or "I took Y from Mom" record.

    Direction is one of:
        "gave"  — you gave money, the other person owes you
        "took"  — you took/borrowed money, you owe the other person

    These entries are deliberately independent from the regular transaction
    list: the People Ledger is a self-contained credit/IOU tracker, not a
    double-entry accounting system. ``settled`` is per-entry so a partial
    repayment (a smaller follow-up entry marked settled) can be tracked
    alongside the original open balance.
    """
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: f"pe_{uuid.uuid4().hex[:12]}")
    person_name: str
    direction: str  # "gave" | "took"
    amount: float  # always positive; direction carries the sign
    reason: str = ""
    date: str  # YYYY-MM-DD
    settled: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class PersonEntryUpdate(BaseModel):
    """Patch payload — every field optional so a single endpoint can edit
    amount, settle/un-settle, rename, or change the reason/date."""
    model_config = ConfigDict(extra="ignore")

    person_name: str | None = None
    direction: str | None = None
    amount: float | None = None
    reason: str | None = None
    date: str | None = None
    settled: bool | None = None
