from telegram import Update                                                                          from telegram.ext import ContextTypes
from utils.gsheet import get_sheet

NAMA_SHEET = "DATA_SANTRI"

async def lihat_semua(update: Update, context: ContextTypes.DEFAULT_TYPE):
    sheet = get_sheet(NAMA_SHEET)
    rows = sheet.get_all_values()[2:]  # Ambil data mulai baris ke-3

    daftar_nama = []
    total_alumni = 0
    for row in rows:
        # Misal kolom alumni di kolom AE (index 30)
        is_alumni = row[31].strip().lower() == "alumni" if len(row) > 31 else False
        if is_alumni:
            total_alumni += 1
            continue  # Jangan ditampilkan

        nama = row[2] if len(row) > 2 else "Tanpa Nama"
        daftar_nama.append(nama)

    total_aktif = len(daftar_nama)

    pesan = f"📋 *Daftar Santri Aktif di PPTQ AL-ITQON GOWA*\n"
    pesan += f"Total: *{total_aktif} santri aktif* | *{total_alumni} Alumni*\n\n"

    for i, nama in enumerate(daftar_nama, 1):
        pesan += f"{i}. {nama}\n"

    await update.message.reply_text(pesan, parse_mode="Markdown")
