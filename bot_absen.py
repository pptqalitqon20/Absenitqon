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
from datetime import datetime
import pytz
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Spacer, PageBreak
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors

# === Inisialisasi FastAPI dan Telegram App secara terpisah ===
fastapi_app = FastAPI()
TOKEN = "7948946741:AAFI3qDEhj1g0a79NUHJAWb4QkDGLrCLOrA"  # Ganti dengan token bot kamu
WEBHOOK_URL = "https://absenitqon.onrender.com/webhook"  # Ganti dengan URL webhook kamu
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
    user_id = update.m
