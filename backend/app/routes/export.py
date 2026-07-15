"""Export routes (CSV/Excel)."""
import io
import csv
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.dependencies import get_storage

router = APIRouter()


async def get_all_txns():
    """Helper to get all transactions."""
    storage = get_storage()
    return await storage.all("transactions")


@router.get("/export/csv")
async def export_csv():
    txns = await get_all_txns()
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


@router.get("/export/excel")
async def export_excel():
    import xlsxwriter

    txns = await get_all_txns()
    txns.sort(key=lambda t: t.get("date", ""), reverse=True)
    out = io.BytesIO()
    wb = xlsxwriter.Workbook(out, {"in_memory": True})
    ws = wb.add_worksheet("Transactions")
    bold = wb.add_format({"bold": True, "bg_color": "#047857", "font_color": "#FFFFFF"})
    headers = ["Date", "Description", "Quantity", "Price", "Amount", "Category", "Payment Method", "Notes"]
    for c, h in enumerate(headers):
        ws.write(0, c, h, bold)
    ws.set_column(0, 0, 12)
    ws.set_column(1, 1, 30)
    ws.set_column(2, 7, 16)
    for r, t in enumerate(txns, start=1):
        qty = t.get("quantity", 1) or 1
        price = t.get("price", 0) or round(abs(t.get("amount", 0)) / qty, 2)
        ws.write(r, 0, t.get("date", ""))
        ws.write(r, 1, t.get("description", ""))
        ws.write_number(r, 2, float(qty))
        ws.write_number(r, 3, float(price))
        ws.write_number(r, 4, float(t.get("amount", 0)))
        ws.write(r, 5, t.get("category", ""))
        ws.write(r, 6, t.get("payment_method", ""))
        ws.write(r, 7, t.get("notes", ""))
    wb.close()
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=batua_transactions.xlsx"},
    )
