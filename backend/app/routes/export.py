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


# Each month block gets its own colour theme so consecutive months read as
# distinct sections. ``base`` is dark enough for white header text; ``light``
# is the pastel used for the title + TOTAL bands. Months cycle through the
# palette; the YEAR divider rows stay a neutral dark.
MONTH_THEMES = [
    {"base": "#047857", "light": "#E7F6EE"},  # emerald
    {"base": "#0F766E", "light": "#E7F4F3"},  # teal
    {"base": "#075985", "light": "#E8F3FB"},  # sky
    {"base": "#4338CA", "light": "#ECEAFB"},  # indigo
    {"base": "#86198F", "light": "#FAEAFB"},  # fuchsia
    {"base": "#9F1239", "light": "#FCE8EF"},  # rose
    {"base": "#92400E", "light": "#FBF0E4"},  # amber
    {"base": "#5B21B6", "light": "#EEEAFB"},  # violet
]


def _month_formats(wb, base: str, light: str):
    """The title / header / TOTAL formats for one month's colour theme."""
    return {
        "title": wb.add_format(
            {"bold": True, "font_size": 12, "font_color": base, "font_name": "Calibri",
             "align": "center", "valign": "vcenter", "bg_color": light}
        ),
        "header": wb.add_format(
            {"bold": True, "bg_color": base, "font_color": "#FFFFFF", "font_name": "Calibri",
             "font_size": 11, "align": "center", "valign": "vcenter",
             "border": 1, "border_color": "#FFFFFF"}
        ),
        "total": wb.add_format(
            {"bold": True, "bg_color": light, "font_color": base, "font_name": "Calibri",
             "font_size": 11, "align": "center", "valign": "vcenter",
             "num_format": "₹#,##0.00"}
        ),
    }


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

    # "Good colours" — every column centred, Calibri throughout, and each month
    # block wears its own colour theme (see MONTH_THEMES) so the sheet reads as
    # distinct monthly sections rather than one flat table. YEAR divider rows
    # stay a neutral dark.
    center_fmt = wb.add_format({"align": "center", "valign": "vcenter", "font_name": "Calibri", "font_size": 11})
    # Money cells stay numeric (so they sum in Excel) but display with a rupee
    # symbol — this is a finance sheet, every amount should look like money.
    money_fmt = wb.add_format(
        {"num_format": "₹#,##0.00", "align": "center", "valign": "vcenter",
         "font_name": "Calibri", "font_size": 11}
    )
    year_fmt = wb.add_format(
        {"bold": True, "font_size": 12, "font_color": "#FFFFFF", "bg_color": "#1E293B",
         "font_name": "Calibri", "align": "center", "valign": "vcenter"}
    )

    headers = ["Sno.", "Name Of Item", "Quantity", "Price", "Total Amount", "Date Of Purchase", "Mode of Payment"]
    for c, w in enumerate([6, 42, 10, 24, 14, 18, 20]):
        ws.set_column(c, c, w, center_fmt)

    # Cache one set of formats per theme colour (xlsxwriter also dedups, but
    # this keeps the workbook small for very long histories).
    fmt_cache: dict = {}

    def fmts_for(base: str, light: str):
        if base not in fmt_cache:
            fmt_cache[base] = _month_formats(wb, base, light)
        return fmt_cache[base]

    row = 0
    prev_year = None
    theme_idx = 0
    for key, items in months.items():
        year, month = key.split("-")
        if prev_year is not None and year != prev_year:
            ws.merge_range(row, 0, row, 6, f"YEAR-{year}", year_fmt)
            ws.set_row(row, 20)
            row += 1
        prev_year = year

        # Next colour theme for this month block.
        theme = MONTH_THEMES[theme_idx % len(MONTH_THEMES)]
        theme_idx += 1
        fmts = fmts_for(theme["base"], theme["light"])

        ws.merge_range(row, 0, row, 6, f"Expense Table : {month}/{year}", fmts["title"])
        ws.set_row(row, 24)
        row += 1
        for c, h in enumerate(headers):
            ws.write(row, c, h, fmts["header"])
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
            price_cell = _price_cell(t)
            if isinstance(price_cell, (int, float)):
                ws.write_number(row, 3, price_cell, money_fmt)
            else:
                ws.write(row, 3, price_cell)  # verbatim breakdown already carries ₹
            ws.write_number(row, 4, round(amount, 2), money_fmt)
            ws.write(row, 5, _dmy(t.get("date", "")))
            ws.write(row, 6, t.get("payment_method", ""))
            row += 1

        # TOTAL band: label spans A:D, figure in E, fill carries across F:G.
        ws.merge_range(row, 0, row, 3, "TOTAL", fmts["total"])
        ws.write_number(row, 4, round(month_total, 2), fmts["total"])
        ws.merge_range(row, 5, row, 6, "", fmts["total"])
        ws.set_row(row, 22)
        row += 1

    wb.close()
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=batua_expenditure.xlsx"},
    )
