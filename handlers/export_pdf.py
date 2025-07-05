from telegram import Update
from telegram.ext import ContextTypes
from utils.gsheet import get_sheet
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, PageBreak
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
import io

async def export_pdf(update: Update, context: ContextTypes.DEFAULT_TYPE):
    sheet = get_sheet("Halaqah Umar")
    all_values = sheet.get_all_values()

    def ambil_tabel(start, end):
        tabel = []
        for i in range(start - 1, end):
            if i < len(all_values):
                row = all_values[i][:7]
                row += [""] * (7 - len(row))
            else:
                row = [""] * 7
            tabel.append(row)
        return tabel

    blok_list = [
        ambil_tabel(1, 18),   # Blok 1
        ambil_tabel(20, 37),  # Blok 2
        ambil_tabel(39, 56),  # Blok 3
        ambil_tabel(58, 75),  # Blok 4
        ambil_tabel(77, 94),  # Blok 5
    ]

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=50,
        rightMargin=50,
        topMargin=30,
        bottomMargin=30
    )
    elements = []

    col_widths = [190, 66, 68, 66, 68, 66, 68]
    scale = 495 / sum(col_widths)
    col_widths = [w * scale for w in col_widths]

    for idx, blok in enumerate(blok_list):
        table = Table(blok, colWidths=col_widths)
        style = TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.3, colors.black),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("FONTNAME", (0, 0), (-1, -1), "Times-Roman"),
        ])

        if len(blok) >= 5:
            style.add("BACKGROUND", (0, 0), (-1, 0), colors.lightgreen)
            style.add("SPAN", (0, 0), (-1, 0))
            style.add("SPAN", (0, 1), (-1, 1))
            style.add("SPAN", (0, 2), (0, 4))
            style.add("SPAN", (1, 2), (4, 2))
            style.add("SPAN", (5, 2), (6, 2))
            style.add("SPAN", (1, 3), (2, 3))
            style.add("SPAN", (3, 3), (4, 3))
            style.add("SPAN", (5, 3), (6, 3))

        table.setStyle(style)
        elements.append(table)
        elements.append(Spacer(1, 10))

        if idx in [1, 3]:
            elements.append(PageBreak())

    doc.build(elements)
    buffer.seek(0)
    await update.message.reply_document(document=buffer, filename="rekap_absen.pdf")
