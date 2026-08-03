"""Export routes (CSV/Excel)."""
import io
import csv
from collections import OrderedDict
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from app.dependencies import get_storage

router = APIRouter()


def _dmy(date_str) -> str:
    """Convert YYYY-MM-DD to the DD/MM/YYYY used by the expense-sheet format."""
    parts = str(date_str).split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    return str(date_str)


def _price_cell(t) -> str | float:
    """Price cell for the expense sheet: verbatim arithmetic breakdown when the
    source kept one (e.g. ``₹15*2+₹20``), else the plain per-item price."""
    text = (t.get("price_text") or "").strip()
    if text:
        return text if text.startswith("₹") else f"₹{text}"
    price = t.get("price") or 0
    return round(float(price), 2)


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/export/csv")
async def export_csv(
    month: str | None = None,  # YYYY-MM — export just that month
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
):
    txns = await get_all_txns()
    txns = _filter_by_scope(txns, month, from_, to)
    txns.sort(key=lambda t: t.get("date", ""), reverse=True)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Date", "Description", "Quantity", "Price", "Amount", "Category", "Payment Method", "Notes"])
    for t in txns:
        qty = t.get("quantity", 1) or 1
        price = t.get("price", 0) or round(abs(t.get("amount", 0)) / qty, 2)
        writer.writerow([
            t.get("date", ""), t.get("description", ""), qty, price, t.get("amount", 0),
            t.get("category", ""), t.get("payment_method", ""), t.get("notes", ""),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=batua_transactions.csv"},
    )


@router.get("/export/months")
async def export_months():
    """Distinct YYYY-MM months that have expense data, newest first. Powers the
    export dialog's month dropdown — future months never appear."""
    txns = await get_all_txns()
    months = {str(t.get("date", ""))[:7] for t in txns if (t.get("amount") or 0) < 0 and str(t.get("date", ""))[:7]}
    return {"months": sorted(months, reverse=True)}


def _filter_by_scope(txns, month: str | None, from_: str | None, to: str | None):
    """Transactions narrowed by a month (YYYY-MM) and/or a closed inclusive
    date range. Keeps income and expenses; ``month`` wins when both are given."""
    if month:
        txns = [t for t in txns if str(t.get("date", "")).startswith(month)]
    else:
        if from_:
            txns = [t for t in txns if str(t.get("date", "")) >= from_]
        if to:
            txns = [t for t in txns if str(t.get("date", "")) <= to]
    return txns


@router.get("/export/excel")
async def export_excel(
    month: str | None = None,  # YYYY-MM — export just that month
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
):
    """Export expenses as a stacked ``Expense Table : MM/YYYY`` workbook — the
    format of ``sample-data/Expenditure (1).xlsx``. Each month gets a block with
    its own header + TOTAL row; ``YEAR-YYYY`` rows separate year groups.
    Income (positive) transactions are excluded — this is an expense sheet.

    Filtering: pass ``month=YYYY-MM`` for a single month, or ``from=``/``to=``
    (YYYY-MM-DD) for a custom inclusive range. No params → all expenses.
    """
    import xlsxwriter

    txns = await get_all_txns()
    expenses = _filter_by_scope(txns, month, from_, to)
    expenses = [t for t in expenses if (t.get("amount") or 0) < 0]
    expenses.sort(key=lambda t: str(t.get("date", "")))

    months = OrderedDict()
    for t in expenses:
        months.setdefault(str(t.get("date", ""))[:7], []).append(t)

    out = io.BytesIO()
    wb = xlsxwriter.Workbook(out, {"in_memory": True})
    ws = wb.add_worksheet("Expenses")

    # "Good colours" — Batua's brand green header bar, green section titles,
    # and a soft-green TOTAL band so each month block reads clearly. Every
    # column is centred; Calibri keeps it clean and universally renderable.
    center_fmt = wb.add_format({"align": "center", "valign": "vcenter", "font_name": "Calibri", "font_size": 11})
    title_fmt = wb.add_format(
        {"bold": True, "font_size": 12, "font_color": "#047857", "font_name": "Calibri",
         "align": "center", "valign": "vcenter", "bg_color": "#E7F6EE"}
    )
    year_fmt = wb.add_format(
        {"bold": True, "font_size": 12, "font_color": "#FFFFFF", "bg_color": "#047857",
         "font_name": "Calibri", "align": "center", "valign": "vcenter"}
    )
    header_fmt = wb.add_format(
        {"bold": True, "bg_color": "#047857", "font_color": "#FFFFFF", "font_name": "Calibri",
         "font_size": 11, "align": "center", "valign": "vcenter",
         "border": 1, "border_color": "#FFFFFF"}
    )
    total_fmt = wb.add_format(
        {"bold": True, "bg_color": "#D1FAE5", "font_color": "#065F46", "font_name": "Calibri",
         "font_size": 11, "align": "center", "valign": "vcenter"}
    )

    headers = ["Sno.", "Name Of Item", "Quantity", "Price", "Total Amount", "Date Of Purchase", "Mode of Payment"]
    for c, w in enumerate([6, 42, 10, 24, 14, 18, 20]):
        ws.set_column(c, c, w, center_fmt)

    row = 0
    prev_year = None
    for key, items in months.items():
        year, month = key.split("-")
        if prev_year is not None and year != prev_year:
            ws.merge_range(row, 0, row, 6, f"YEAR-{year}", year_fmt)
            ws.set_row(row, 20)
            row += 1
        prev_year = year

        ws.merge_range(row, 0, row, 6, f"Expense Table : {month}/{year}", title_fmt)
        ws.set_row(row, 24)
        row += 1
        for c, h in enumerate(headers):
            ws.write(row, c, h, header_fmt)
        ws.set_row(row, 22)
        row += 1

        month_total = 0.0
        for i, t in enumerate(items, start=1):
            qty = t.get("quantity", 1) or 1
            amount = abs(float(t.get("amount", 0) or 0))
            month_total += amount
            ws.write_number(row, 0, i)
            ws.write(row, 1, t.get("description", ""))
            ws.write_number(row, 2, float(qty))
            ws.write(row, 3, _price_cell(t))
            ws.write_number(row, 4, round(amount, 2))
            ws.write(row, 5, _dmy(t.get("date", "")))
            ws.write(row, 6, t.get("payment_method", ""))
            row += 1

        # TOTAL band: label spans A:D, figure in E, fill carries across F:G.
        ws.merge_range(row, 0, row, 3, "TOTAL", total_fmt)
        ws.write_number(row, 4, round(month_total, 2), total_fmt)
        ws.merge_range(row, 5, row, 6, "", total_fmt)
        ws.set_row(row, 22)
        row += 1

    wb.close()
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=batua_expenditure.xlsx"},
    )
