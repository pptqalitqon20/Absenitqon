from telegram import Update
from telegram.ext import ContextTypes, ConversationHandler, MessageHandler, CommandHandler, filters
from utils.gsheet import get_sheet

NAMA_SHEET = "DATA_SANTRI"
UPLOAD_NIK, UPLOAD_FOTO = range(2)

async def upload_foto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("🪪 Silakan kirim NIK santri yang ingin ditambahkan fotonya:")
    return UPLOAD_NIK

async def proses_upload_nik(update: Update, context: ContextTypes.DEFAULT_TYPE):
    nik = update.message.text.strip()
    context.user_data["upload_nik"] = nik
    await update.message.reply_text("📸 Silakan kirim foto santri sekarang.")
    return UPLOAD_FOTO

async def simpan_foto(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message.photo:
        await update.message.reply_text("❌ Harap kirim *foto*, bukan teks.", parse_mode='Markdown')
        return UPLOAD_FOTO

    file_id = update.message.photo[-1].file_id
    nik = context.user_data.get("upload_nik")

    sheet = get_sheet(NAMA_SHEET)
    data = sheet.get_all_values()

    for i, row in enumerate(data):
        if len(row) > 1 and row[1] == nik:
            kolom_file_id = len(row)  # Asumsi kolom FILE_ID paling akhir
            sheet.update_cell(i+1, kolom_file_id, file_id)
            await update.message.reply_text("✅ Foto berhasil disimpan di data santri.")
            return ConversationHandler.END

    await update.message.reply_text("❌ NIK tidak ditemukan dalam database.")
    return ConversationHandler.END
