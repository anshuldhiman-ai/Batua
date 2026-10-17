"""Number-grounding guards in ml_rag.FinanceQA.

These stop a reworded / LLM answer from quietly changing the figures it was
given: the model is told to keep numbers exact, and these enforce it.
"""
import pytest

from ml_rag import FinanceQA


@pytest.fixture(scope="module")
def qa():
    return FinanceQA()


def test_numbers_preserved_accepts_exact_reword(qa):
    assert qa._numbers_preserved("You spent ₹1,250.50 on food.", "Food cost ₹1,250.50.") is True


def test_numbers_preserved_rejects_dropped_digit(qa):
    # "₹500" must not be satisfied by "₹1500" — the old substring test allowed it.
    assert qa._numbers_preserved("You spent ₹500.", "You spent ₹1500.") is False


def test_numbers_preserved_normalises_formatting(qa):
    assert qa._numbers_preserved("Total ₹1,250", "Total ₹1250") is True


def test_numbers_preserved_without_amounts_is_true(qa):
    assert qa._numbers_preserved("You have 5 categories.", "Five categories total.") is True


def test_has_invented_amounts_flags_new_figure(qa):
    digest = "Food & Dining: ₹4,200 total. Income ₹50,000."
    assert qa._has_invented_amounts(digest, "You spent ₹4,200 on food.") is False
    assert qa._has_invented_amounts(digest, "You spent ₹9,999 on food.") is True
