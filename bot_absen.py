from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder, ContextTypes, CommandHandler,
    CallbackQueryHandler, MessageHandler, filters, ConversationHandler
)
import os
from flask import Flask
import json
from oauth2client.service_account import ServiceAccountCredentials
import gspread
import io
from datetime import datetime
import pytz
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, PageBreak
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors

TOKEN = os.getenv("BOT_TOKEN")
WEBHOOK_URL = os.getenv("WEBHOOK_URL")
application = ApplicationBuilder().token(TOKEN).build()

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

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await update.message.reply_text(
        f"Assalamu'alaikum, {user.first_name}!\n"
        f"Selamat datang di Bot Halaqah.\n\n"
        f"Ketik /halaqah untuk melihat daftar halaqah."
    )
flask_app = Flask(__name__)

@flask_app.route('/')
def home():
    return 'Bot Telegram aktif.'

@flask_app.route('/ping')
def ping():
    return 'pong'

def run_flask():
    flask_app.run(host="0.0.0.0", port=8080)

def main():
    threading.Thread(target=run_flask).start()

    application = ApplicationBuilder().token(TOKEN).build()
application.run_webhook(
    listen="0.0.0.0",
    port=int(os.environ.get('PORT', 10000)),  # render akan otomatis pakai ini
    url_path=TOKEN,
    webhook_url=f"https://bot-telegram-02rg.onrender.com/{TOKEN}",
)

if __name__ == "__main__":
    main()
