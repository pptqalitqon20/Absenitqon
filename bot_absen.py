from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ContextTypes, CommandHandler,
    CallbackQueryHandler, MessageHandler, filters, ConversationHandler
)
from fastapi import FastAPI, Request
import asyncio
import os
import json
from oauth2client.service_account import ServiceAccountCredentials
import gspread
import io
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import pytz
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, PageBreak
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from fastapi import FastAPI, Request
import asyncio

app = FastAPI()
# === Setup Google Sheets ===
scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
creds_dict = json.loads(os.environ['GOOGLE_CREDS_JSON'])
creds = ServiceAccountCredentials.from_json_keyfile_dict(creds_dict, scope)
client = gspread.authorize(creds)

spreadsheet_id = '1Og7KigH3QL3eTvLLMrIXMq7gaUzqFaw7B1RBL4aMHTo'
sheet = client.open_by_key(spreadsheet_id).sheet1
sheet_halaqah_umar = client.open_by_key(spreadsheet_id).worksheet('Halaqah Umar')

# === State untuk Conversation ===
PILIH_SANTRI, INPUT_HAFALAN = range(2)
santri_terpilih = {}

# === FastAPI app ===
app = FastAPI()
TOKEN = "YOUR_BOT_TOKEN"
WEBHOOK_URL = "https://your-render-url.onrender.com/webhook"
application = ApplicationBuilder().token(TOKEN).build()

# === Fungsi: Update tanggal & hari ke A2 & B2 ===
def update_tanggal_dan_hari():
    tz = pytz.timezone('Asia/Makassar')
    now = datetime.now(tz)
    hari_indo = {'Monday': 'Senin','Tuesday': 'Selasa','Wednesday': 'Rabu','Thursday': 'Kamis','Friday': 'Jumat','Saturday': 'Sabtu','Sunday': 'Ahad'}
    bulan_indo = {'January': 'Januari','February': 'Februari','March': 'Maret','April': 'April','May': 'Mei','June': 'Juni','July': 'Juli','August': 'Agustus','September': 'September','October': 'Oktober','November': 'November','December': 'Desember'}
    hari = hari_indo[now.strftime('%A')]
    tanggal = now.strftime('%d')
    bulan = bulan_indo[now.strftime('%B')]
    tahun = now.strftime('%Y')
    hasil = f'{hari} {tanggal} {bulan} {tahun}'
    mapping_baris = {'Monday': 2,'Tuesday': 21,'Wednesday': 40,'Thursday': 59,'Friday': 78}
    baris = mapping_baris.get(now.strftime('%A'), 2)
    sheet_halaqah_umar.update_acell(f'A{baris}', hasil)

def get_blok_santri_by_day():
    tz = pytz.timezone('Asia/Makassar')
    now = datetime.now(tz)
    day = now.strftime('%A')
    mapping = {'Monday': 6,'Tuesday': 25,'Wednesday': 44,'Thursday': 63,'Friday': 82}
    return mapping.get(day, 6)

async def absen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    update_tanggal_dan_hari()
    start_row = get_blok_santri_by_day()
    data_mentah = sheet_halaqah_umar.col_values(1)[start_row - 1:]
    data_santri = []
    for nama in data_mentah:
        if not nama.strip(): continue
        if "Absen" in nama or "Catatan" in nama or "Nama Santri" in nama: break
        data_santri.append(nama)
    keyboard = []
    for i in range(0, len(data_santri), 2):
        row = [InlineKeyboardButton(data_santri[i], callback_data=data_santri[i])]
        if i + 1 < len(data_santri):
            row.append(InlineKeyboardButton(data_santri[i + 1], callback_data=data_santri[i + 1]))
        keyboard.append(row)
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("Pilih nama santri yang ingin absen:", reply_markup=reply_markup)
    context.user_data['blok_awal'] = start_row
    return PILIH_SANTRI

async def pilih_santri(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    nama = query.data
    user_id = query.from_user.id
    santri_terpilih[user_id] = nama
    await query.message.reply_text(f"Ketik hafalan untuk {nama} dalam format Juz/Halaman:")
    return INPUT_HAFALAN

async def simpan_hafalan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.message.from_user.id
    if user_id not in santri_terpilih:
        await update.message.reply_text("Santri belum dipilih.")
        return ConversationHandler.END
    try:
        juz, halaman = update.message.text.strip().split('/')
    except:
        await update.message.reply_text("Format salah. Gunakan Juz/Halaman.")
        return INPUT_HAFALAN
    nama_santri = santri_terpilih[user_id]
    del santri_terpilih[user_id]
    blok_awal = context.user_data.get('blok_awal', 6)
    blok_akhir = blok_awal + 17
    try:
        cells = sheet_halaqah_umar.findall(nama_santri)
        target_cell = None
        for cell in cells:
            if blok_awal <= cell.row <= blok_akhir and cell.col == 1:
                target_cell = cell
                break
        if not target_cell:
            await update.message.reply_text("Gagal menyimpan hafalan. Nama tidak ditemukan di blok hari ini.")
            return ConversationHandler.END
        row = target_cell.row
        row_values = sheet_halaqah_umar.row_values(row)
        MAX_COLUMN = 6
        col = 1
        while col <= MAX_COLUMN:
            juz_cell = row_values[col] if col < len(row_values) else ''
            halaman_cell = row_values[col + 1] if (col + 1) < len(row_values) else ''
            if not juz_cell and not halaman_cell:
                sheet_halaqah_umar.update_cell(row, col + 1, juz)
                sheet_halaqah_umar.update_cell(row, col + 2, halaman)
                await update.message.reply_text(
                    f"Hafalan untuk *{nama_santri}* berhasil disimpan.\nJuz {juz} halaman {halaman}",
                    parse_mode='Markdown')
                return ConversationHandler.END
            col += 2
        await update.message.reply_text("⚠️ Data hafalan sudah penuh sampai kolom G.")
        return ConversationHandler.END
    except Exception as e:
        await update.message.reply_text(f"Gagal menyimpan hafalan: {e}")
        return ConversationHandler.END

async def export_pdf(update: Update, context: ContextTypes.DEFAULT_TYPE):
    all_values = sheet_halaqah_umar.get_all_values()
    def ambil_tabel(start, end):
        tabel = []
        for i in range(start - 1, end):
            if i < len(all_values):
                row = all_values[i][:7] + [""] * (7 - len(all_values[i][:7]))
            else:
                row = [""] * 7
            tabel.append(row)
        return tabel
    blok_list = [ambil_tabel(1, 18), ambil_tabel(20, 37), ambil_tabel(39, 56), ambil_tabel(58, 75), ambil_tabel(77, 94)]
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=50, rightMargin=50, topMargin=30, bottomMargin=30)
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
        if idx in [1, 3]: elements.append(PageBreak())
    doc.build(elements)
    buffer.seek(0)
    await update.message.reply_document(document=buffer, filename="rekap_absen.pdf")
async def show_halaqah(update: Update, context: ContextTypes.DEFAULT_TYPE):
    data = sheet.get_all_values()
    message = "Daftar Halaqah dan Ustadz:\n"
    for row in data[1:]:
        if row and row[0]:
            message += f"• {row[0]} — {row[1]}\n"
    await update.message.reply_text(message, parse_mode='Markdown')

async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        sheet_halaqah_umar.batch_clear(["A2", "A21", "A40", "A59", "A78"])
        sheet_halaqah_umar.batch_clear(["B6:G18", "B25:G37", "B44:G56", "B63:G75", "B82:G94"])
        await update.message.reply_text("✅ Data berhasil di-*reset*.")
    except Exception as e:
        await update.message.reply_text(f"❌ Gagal mereset data: {str(e)[:200]}")

# === Pasang semua handler ===
conv_handler = ConversationHandler(
    entry_points=[CommandHandler("absen", absen)],
    states={
        PILIH_SANTRI: [CallbackQueryHandler(pilih_santri)],
        INPUT_HAFALAN: [MessageHandler(filters.TEXT & ~filters.COMMAND, simpan_hafalan)],
    },
    fallbacks=[],
)
app.add_handler(conv_handler)
app.add_handler(CommandHandler("halaqah", show_halaqah))
app.add_handler(CommandHandler("pdf", export_pdf))
app.add_handler(CommandHandler("reset", reset))

@app.post("/webhook")
async def webhook(request: Request):
    data = await request.json()
    update = Update.de_json(data, application.bot)
    await application.update_queue.put(update)
    return {"ok": True}

@app.on_event("startup")
async def startup():
    await application.bot.set_webhook(WEBHOOK_URL)
    asyncio.create_task(application.initialize())
