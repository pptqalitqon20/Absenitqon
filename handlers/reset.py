from telegram import Update
from telegram.ext import ContextTypes
from utils.gsheet import get_sheet

async def reset(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        sheet = get_sheet("Halaqah Umar")
        sheet_halaqah_umar.batch_clear(["A2", "A21", "A40", "A59", "A78"])
        sheet_halaqah_umar.batch_clear([
            "B6:G18",
            "B25:G37",
            "B44:G56",
            "B63:G75",
            "B82:G94"
        ])
        await update.message.reply_text("✅ Data berhasil di-*reset*.")
    except Exception as e:
        await update.message.reply_text(f"❌ Gagal mereset data: {str(e)[:200]}")
