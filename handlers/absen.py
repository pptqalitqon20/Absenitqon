from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, ConversationHandler, CallbackQueryHandler, MessageHandler, filters
from constants import PILIH_SANTRI, INPUT_HAFALAN, santri_terpilih
from utils.gsheet import get_sheet
from utils.tanggal import update_tanggal_dan_hari, get_blok_santri_by_day

async def absen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    update_tanggal_dan_hari()
    start_row = get_blok_santri_by_day()
    sheet_halaqah_umar = get_sheet("Halaqah Umar")  # ✅
    data_mentah = sheet_halaqah_umar.col_values(1)[start_row - 1:]
    data_santri = []

    for nama in data_mentah:
        if not nama.strip():
            continue
        if "Absen" in nama or "Catatan" in nama or "Nama Santri" in nama:
            break
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
    santri_terpilih[query.from_user.id] = nama
    await query.message.reply_text(f"Ketik hafalan untuk {nama} dalam format Juz/Halaman:")
    return INPUT_HAFALAN

async def simpan_hafalan(update: Update, context: ContextTypes.DEFAULT_TYPE):
    from_user = update.message.from_user.id
    if from_user not in santri_terpilih:
        await update.message.reply_text("Santri belum dipilih.")
        return ConversationHandler.END

    try:
        juz, halaman = update.message.text.strip().split('/')
    except:
        await update.message.reply_text("Format salah. Gunakan Juz/Halaman.")
        return INPUT_HAFALAN

    nama = santri_terpilih.pop(from_user)
    blok_awal = context.user_data.get('blok_awal', 6)
    blok_akhir = blok_awal + 17

    try:
        cells = sheet_halaqah_umar.findall(nama)
        for cell in cells:
            if blok_awal <= cell.row <= blok_akhir and cell.col == 1:
                row = cell.row
                row_values = sheet_halaqah_umar.row_values(row)
                MAX_COLUMN = 6
                col = 1
                while col <= MAX_COLUMN:
                    if col >= len(row_values) or (not row_values[col] and not row_values[col + 1]):
                        sheet_halaqah_umar.update_cell(row, col + 1, juz)
                        sheet_halaqah_umar.update_cell(row, col + 2, halaman)
                        await update.message.reply_text(
                            f"Hafalan untuk *{nama}* berhasil disimpan.\nJuz {juz} halaman {halaman}",
                            parse_mode='Markdown'
                        )
                        return ConversationHandler.END
                    col += 2

        await update.message.reply_text("⚠️ Data hafalan sudah penuh sampai kolom G.")
        return ConversationHandler.END
    except Exception as e:
        await update.message.reply_text(f"Gagal menyimpan hafalan: {e}")
        return ConversationHandler.END
