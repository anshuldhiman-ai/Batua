"""Export routes (CSV/Excel)."""
import io
import csv
import datetime
from collections import OrderedDict
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from app.dependencies import get_storage

router = APIRouter()


def _to_date(date_str):
    """Parse a YYYY-MM-DD/YYYY-MM-DD HH:MM:SS value into a date for the sheet."""
    s = str(date_str).strip()
    if not s:
        return None
    # Some stored values already carry a time part (e.g. "2025-08-15 00:00:00").
    s = s.split(" ")[0]
    try:
        y, m, d = (int(x) for x in s.split("-"))
        return datetime.date(y, m, d)
    except (ValueError, TypeError):
        return None


def _price_cell(t) -> str | float:
    """Price cell for the expense sheet: verbatim arithmetic breakdown when the
    source kept one (e.g. ``₹15*2+₹20``), else the plain per-item price."""
    text = (t.get("price_text") or "").strip()
    if text:
        return text if text.startswith("₹") else f"₹{text}"
    price = t.get("price") or 0
    return round(float(price), 2)


def _safe_cell(value):
    """Prevent spreadsheet formula injection in exported text cells."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text

async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


# Each month block gets its own colour theme so consecutive months read as
# distinct sections. ``base`` is dark enough for the title/TOTAL text on the
# pastel ``light`` band. Months cycle through the palette; the YEAR divider
# rows stay a neutral green.
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

YEAR_FILL = "#00B050"       # green YEAR divider
YEAR_TEXT = "#FFFF00"       # yellow YEAR label

# One distinct font colour per column so a column can be read at a glance.
# Index matches the header list: Sno · Name · Debit/Credit · Price · Total ·
# Date · Mode. The Debit/Credit cell is recoloured live (red debit / green
# credit) instead of keeping this entry's red.
COLUMN_COLOURS = ["#6B7280", "#334155", "#DC2626", "#B45309",
                  "#0F766E", "#1D4ED8", "#A21CAF"]
DEBIT_COLOUR = "#C0392B"        # muted red for debit side
CREDIT_COLOUR = "#27AE60"       # muted green for credit side
# Money columns (Price, Total Amount) get the ₹ red-for-negative format.
MONEY_COLUMNS = (3, 4)
MONEY_FORMAT = '₹" "#,##0;[Red]₹"-"#,##0'

# Header ("navigation") row — one consistent navy-charcoal band with white
# bold text across every month, matching the requested scheme.
HEADER_BG = "#2C3E50"
HEADER_TEXT = "#FFFFFF"

# Zebra striping: alternate rows are a very light gray for easy scanning.
ZEBRA_BG = "#F7F7F5"
# Pale fill for the TOTAL band (spans the row).
TOTAL_FILL = "#FCEFE3"


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
            t.get("date", ""), _safe_cell(t.get("description", "")), qty, price, t.get("amount", 0),
            _safe_cell(t.get("category", "")), _safe_cell(t.get("payment_method", "")), _safe_cell(t.get("notes", "")),
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
    """Export transactions as a stacked ``Expense Table : MM/YYYY`` workbook.

    Falls back to the ``sample-data/Expenditure (1).xlsx`` style, upgraded:
      - a navy ``navigation`` header band + a distinct colour theme (title +
        TOTAL band) for each month,
      - a unique font colour per column so columns read at a glance, with
        zebra striping on alternating rows,
      - a ``Debit / Credit`` column — income (credit) rows are now included,
        not just expenses (no Quantity column),
      - `dd/mm/yyyy` real dates and ``₹``-prefixed number formats,
      - TOTAL per month = the debit subtotal only (credits are not netted out).

    Filtering: pass ``month=YYYY-MM`` for a single month, or ``from=``/``to=``
    (YYYY-MM-DD) for a custom inclusive range. No params → everything.
    """
    import xlsxwriter

    txns = await get_all_txns()
    rows = _filter_by_scope(txns, month, from_, to)
    rows.sort(key=lambda t: str(t.get("date", "")))

    months = OrderedDict()
    for t in rows:
        months.setdefault(str(t.get("date", ""))[:7], []).append(t)

    out = io.BytesIO()
    wb = xlsxwriter.Workbook(out, {"in_memory": True})
    ws = wb.add_worksheet("Expenses")

    # Base cell style — Calibri 11, centred, no borders.
    center_fmt = wb.add_format({"align": "center", "valign": "vcenter", "font_name": "Calibri", "font_size": 11})
    # Date cells read as a real dd/mm/yyyy date, not text.
    date_fmt = wb.add_format(
        {"num_format": "dd/mm/yyyy", "align": "center", "valign": "vcenter",
         "font_name": "Calibri", "font_size": 11}
    )
    # Green YEAR divider with yellow label.
    year_fmt = wb.add_format(
        {"bold": True, "font_size": 11, "font_color": YEAR_TEXT, "bg_color": YEAR_FILL,
         "font_name": "Calibri", "align": "center", "valign": "vcenter"}
    )

    headers = ["Sno.", "Name Of Item", "Debit / Credit", "Price", "Total Amount", "Date Of Purchase", "Mode of Payment"]

    # One font colour per column — both the header and its data cells share it,
    # so the whole column is distinguishable at a glance. Formats are built in
    # even/odd pairs for zebra striping; the header row is a solid navy band.
    col_fmts = []  # even rows — white background
    zebra_fmts = []  # odd rows — light gray background
    for c, col in enumerate(COLUMN_COLOURS):
        base = {"font_size": 11, "font_color": col, "font_name": "Calibri",
                "align": "center", "valign": "vcenter"}
        if c in MONEY_COLUMNS:  # Price, Total Amount — money columns
            base["num_format"] = MONEY_FORMAT
        even = dict(base)
        odd = dict(base, bg_color=ZEBRA_BG)
        col_fmts.append(wb.add_format(even))
        zebra_fmts.append(wb.add_format(odd))
    # Consistent navy header band — white bold text across every month.
    header_fmts = [
        wb.add_format({"bold": True, "font_size": 11, "font_color": HEADER_TEXT,
                       "font_name": "Calibri", "align": "center", "valign": "vcenter",
                       "bg_color": HEADER_BG})
        for _ in range(len(headers))
    ]

    # Column widths (Quantity column removed).
    for c, w in enumerate([6, 42, 14, 16, 16, 16, 18]):
        ws.set_column(c, c, w, center_fmt)

    # Per-month theme formats, cached by base colour to keep the file small.
    fmt_cache: dict = {}

    def month_fmts(base: str, light: str):
        if base not in fmt_cache:
            fmt_cache[base] = {
                "title": wb.add_format(
                    {"bold": True, "font_size": 11, "font_color": base, "font_name": "Calibri",
                     "align": "center", "valign": "vcenter", "bg_color": light}
                ),
                "total_label": wb.add_format(
                    {"font_size": 11, "font_color": base, "font_name": "Calibri",
                     "align": "center", "valign": "vcenter", "bg_color": light}
                ),
                "total_value": wb.add_format(
                    {"font_size": 11, "font_color": base, "font_name": "Calibri",
                     "align": "center", "valign": "vcenter", "bg_color": light,
                     "num_format": '₹" "#,##0;[Red]₹"-"#,##0'}
                ),
            }
        return fmt_cache[base]

    row = 0
    prev_year = None
    theme_idx = 0
    debit_fmt = wb.add_format(
        {"bold": True, "font_size": 11, "font_color": DEBIT_COLOUR, "font_name": "Calibri",
         "align": "center", "valign": "vcenter"}
    )
    credit_fmt = wb.add_format(
        {"bold": True, "font_size": 11, "font_color": CREDIT_COLOUR, "font_name": "Calibri",
         "align": "center", "valign": "vcenter"}
    )

    for key, items in months.items():
        year, month = key.split("-")
        if prev_year is not None and year != prev_year:
            ws.merge_range(row, 0, row, len(headers) - 1, f"YEAR-{year}", year_fmt)
            row += 1
        prev_year = year

        theme = MONTH_THEMES[theme_idx % len(MONTH_THEMES)]
        theme_idx += 1
        fmts = month_fmts(theme["base"], theme["light"])

        ws.merge_range(row, 0, row, len(headers) - 1, f"Expense Table : {month}/{year}", fmts["title"])
        row += 1
        for c, h in enumerate(headers):
            ws.write(row, c, h, header_fmts[c])
        row += 1

        # TOTAL is the sum of debits only — credits are NOT netted out.
        month_debit_total = 0.0
        for i, t in enumerate(items, start=1):
            amount = float(t.get("amount", 0) or 0)
            if amount < 0:
                month_debit_total += -amount
            fmts_row = zebra_fmts if i % 2 == 0 else col_fmts
            ws.write_number(row, 0, i, fmts_row[0])
            ws.write(row, 1, t.get("description", ""), fmts_row[1])
            if amount >= 0:
                ws.write(row, 2, "Credit", credit_fmt)
            else:
                ws.write(row, 2, "Debit", debit_fmt)
            price_cell = _price_cell(t)
            if isinstance(price_cell, (int, float)):
                ws.write_number(row, 3, price_cell, fmts_row[3])
            else:
                ws.write(row, 3, price_cell, fmts_row[3])  # verbatim breakdown carries ₹
            ws.write_number(row, 4, round(amount, 2), fmts_row[4])
            date = _to_date(t.get("date", ""))
            if date is not None:
                ws.write_datetime(row, 5, date, date_fmt)
            else:
                ws.write(row, 5, t.get("date", ""), fmts_row[5])
            ws.write(row, 6, t.get("payment_method", ""), fmts_row[6])
            row += 1

        # TOTAL band: label spans A:D, figure in E (Total Amount), fill carries
        # across F:G. Shows the debit subtotal (money spent), never net.
        total_fmt = wb.add_format(
            {"bold": True, "font_size": 11, "font_color": DEBIT_COLOUR,
             "font_name": "Calibri", "align": "center", "valign": "vcenter",
             "bg_color": TOTAL_FILL, "num_format": MONEY_FORMAT}
        )
        ws.merge_range(row, 0, row, 3, "TOTAL", fmts["total_label"])
        ws.write_number(row, 4, round(month_debit_total, 2), total_fmt)
        ws.merge_range(row, 5, row, 6, "", fmts["total_label"])
        row += 1

    wb.close()
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=batua_expenditure.xlsx"},
    )
