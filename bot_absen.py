# bot_halaqah.py
import os
import io
import pytz
from flask import Flask, request
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, MessageHandler,
    ContextTypes, ConversationHandler, filters
)
from oauth2client.service_account import ServiceAccountCredentials
from datetime import datetime
import gspread
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, PageBreak
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
import asyncio

# === Setup Google Sheets ===
scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
creds = ServiceAccountCredentials.from_json_keyfile_name('bamboo-analyst-462502-v8-0d9cdb673ec2.json', scope)
client = gspread.authorize(creds)
spreadsheet_id = '1Og7KigH3QL3eTvLLMrIXMq7gaUzqFaw7B1RBL4aMHTo'
sheet = client.open_by_key(spreadsheet_id).sheet1
sheet_halaqah_umar = client.open_by_key(spreadsheet_id).worksheet('Halaqah Umar')

# === Constants ===
TOKEN = "YOUR_BOT_TOKEN"
WEBHOOK_PATH = "/webhook"
WEBHOOK_URL = "https://your-app-name.onrender.com/webhook"  # ganti sesuai domain Render kamu
app = Flask(__name__)
application = Application.builder().token(TOKEN).build()

# === States ===
PILIH_SANTRI, INPUT_HAFALAN = range(2)
santri_terpilih = {}

# === Fungsi Utama dan Handler (SAMA seperti sebelumnya) ===
# ⬇️ kamu bisa paste semua fungsi `update_tanggal_dan_hari`, `absen`, `pilih_santri`, dll.
# dari kode kamu sebelumnya di sini TANPA ubah
# (sudah saya potong di sini agar pendek, tapi kamu tinggal tempel semua itu)

# === Route Flask ===
@app.route(WEBHOOK_PATH, methods=["POST"])
async def webhook():
    update = Update.de_json(request.get_json(force=True), application.bot)
    await application.process_update(update)
    return "OK"

# === Setup Webhook dan Jalankan Server ===
async def setup():
    await application.initialize()
    await application.bot.set_webhook(WEBHOOK_URL)
    await application.start()
    print("Bot webhook aktif.")

if __name__ == '__main__':
    # Tambahkan semua handler Telegram kamu di sini
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("absen", absen)],
        states={
            PILIH_SANTRI: [CallbackQueryHandler(pilih_santri)],
            INPUT_HAFALAN: [MessageHandler(filters.TEXT & ~filters.COMMAND, simpan_hafalan)],
        },
        fallbacks=[],
    )
    application.add_handler(conv_handler)
    application.add_handler(CommandHandler("halaqah", show_halaqah))
    application.add_handler(CommandHandler("pdf", export_pdf))
    application.add_handler(CommandHandler("reset", reset))

    # Jalankan Flask server + setup webhook
    loop = asyncio.get_event_loop()
    loop.create_task(setup())
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
