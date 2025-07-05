from telegram.ext import (
    ApplicationBuilder, CommandHandler, ConversationHandler,
    MessageHandler, CallbackQueryHandler, filters
)
from handlers.absen import absen, pilih_santri, simpan_hafalan
from handlers.export_pdf import export_pdf
from handlers.reset import reset
from handlers.lihat_semua import lihat_semua
from handlers.data_santri import (
    data_santri, pilih_mode, proses_cari_nik,
    navigasi_callback, tampilkan_detail_callback,
    PILIH_MODE, CARI_NIK        # ⬅️  tambahkan ini
)
from handlers.upload_foto import (
    upload_foto, proses_upload_nik, simpan_foto, UPLOAD_NIK, UPLOAD_FOTO
)
from constants import PILIH_SANTRI, INPUT_HAFALAN
from utils.tanggal import update_tanggal_dan_hari
from handlers.compress import get_compress_handler
def main():
    update_tanggal_dan_hari()
    app = ApplicationBuilder().token("7948946741:AAHO5ZBHRfoB3maZgOr5fxaxsJAOR_2zXHc").build()

    # Absen handler
    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("absen", absen)],
        states={
            PILIH_SANTRI: [CallbackQueryHandler(pilih_santri)],
            INPUT_HAFALAN: [MessageHandler(filters.TEXT & ~filters.COMMAND, simpan_hafalan)],
        },
        fallbacks=[],
    )

    # Data Santri handler
    data_santri_conv = ConversationHandler(
    entry_points=[CommandHandler("data_santri", data_santri)],
    states={
        PILIH_MODE: [
            CallbackQueryHandler(pilih_mode, pattern="^mode\\|"),
            CallbackQueryHandler(navigasi_callback, pattern="^navi\\|"),
            CallbackQueryHandler(tampilkan_detail_callback, pattern="^lihat\\|"),
        ],
        CARI_NIK: [
            MessageHandler(filters.TEXT & ~filters.COMMAND, proses_cari_nik),
        ],
    },
    fallbacks=[],
    per_chat=True  # ✅ perbaiki dari per_message=True
)
    upload_foto_conv = ConversationHandler(
    entry_points=[CommandHandler("upload_foto", upload_foto)],
    states={
        UPLOAD_NIK: [MessageHandler(filters.TEXT & ~filters.COMMAND, proses_upload_nik)],
        UPLOAD_FOTO: [MessageHandler(filters.PHOTO, simpan_foto)],
    },
    fallbacks=[],
)
    app.add_handler(upload_foto_conv)
    app.add_handler(conv_handler)
    app.add_handler(data_santri_conv)
    app.add_handler(get_compress_handler())
    app.add_handler(CommandHandler("pdf", export_pdf))
    app.add_handler(CommandHandler("reset", reset))
    app.add_handler(CommandHandler("lihat_semua", lihat_semua))

    app.run_polling()

if name == 'main':
    main()
