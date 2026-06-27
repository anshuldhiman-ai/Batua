"""Generate demo Excel files for Batua.

  python make_samples.py

Produces:
  Expenditure.xlsx  — stacked "Expense Table : MM/YYYY" custom format
  bank-export.xlsx  — generic bank-style export with aliased columns
"""
import os
import xlsxwriter
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))


def make_stacked():
    path = os.path.join(HERE, "Expenditure.xlsx")
    wb = xlsxwriter.Workbook(path)
    ws = wb.add_worksheet("Expenses")
    rows = [
        ["Expense Table : 04/2026"],
        ["Sno", "Name Of Item", "Quantity", "Price", "Total Amount", "Date", "Mode"],
        [1, "Petrol", 1, 1150, 1150, "05/04/2026", "HDFC"],
        [2, "Zomato Dinner", 1, 520, 520, "11/04/2026", "UPI"],
        [3, "Lays", 3, 20, 60, "15/04/2026", "Cash"],
        [4, "Bigbasket", 1, 2100, 2100, "20/04/2026", "UPI"],
        ["TOTAL", "", "", "", 3830, "", ""],
        ["Expense Table : 05/2026"],
        ["Sno", "Name Of Item", "Quantity", "Price", "Total Amount", "Date", "Mode"],
        [1, "Netflix", 1, 799, 799, "01/05/2026", "Credit Card"],
        [2, "Petrol", 1, 1200, 1200, "08/05/2026", "HDFC"],
        [3, "Swiggy Lunch", 1, 380, 380, "14/05/2026", "UPI"],
        [4, "Samosa", 4, 15, 60, "18/05/2026", "Cash"],
        ["TOTAL", "", "", "", 2439, "", ""],
        ["Expense Table : 06/2026"],
        ["Sno", "Name Of Item", "Quantity", "Price", "Total Amount", "Date", "Mode"],
        [1, "Netflix", 1, 799, 799, "01/06/2026", "Credit Card"],
        [2, "Ola Ride", 1, 240, 240, "03/06/2026", "UPI"],
        [3, "Bigbasket", 1, 1850, 1850, "07/06/2026", "UPI"],
        [4, "Petrol", 1, 1300, 1300, "10/06/2026", "HDFC"],
        ["YEAR-2026", "", "", "", 0, "", ""],
    ]
    for r, row in enumerate(rows):
        for c, v in enumerate(row):
            ws.write(r, c, v)
    wb.close()
    print("wrote", path)


def make_generic():
    path = os.path.join(HERE, "bank-export.xlsx")
    df = pd.DataFrame(
        {
            "Txn Date": ["2026-06-02", "2026-06-04", "2026-06-09", "2026-06-12"],
            "Narration": ["Uber Ride", "Amazon Order", "Salary Credit", "PharmEasy"],
            "Amount": [-250, -1499, 85000, -640],
            "Mode": ["UPI", "Credit Card", "Net Banking", "UPI"],
        }
    )
    df.to_excel(path, index=False)
    print("wrote", path)


if __name__ == "__main__":
    make_stacked()
    make_generic()
