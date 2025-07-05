from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes, ConversationHandler
from utils.gsheet import get_sheet
import datetime
import asyncio

NAMA_SHEET = "DATA_SANTRI"
JUMLAH_PER_HALAMAN = 10
PILIH_MODE, CARI_NIK = range(2)

def get_data_santri():
    sheet = get_sheet(NAMA_SHEET)
    return sheet.get_all_values()[2:]  # Ambil dari baris ke-3 ke bawah

async def data_santri(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = [
        [InlineKeyboardButton("🔍 Cari Berdasarkan NIK", callback_data="mode|nik")],
        [InlineKeyboardButton("📑 Lihat Daftar Nama Santri", callback_data="mode|nama")]
    ]
    await update.message.reply_text(
        "📋 *Pilih Mode Pencarian Data Santri:*",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )
    return PILIH_MODE

async def pilih_mode(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    mode = query.data.split("|")[1]

    context.user_data["santri_data"] = get_data_santri()

    if mode == "nik":
        await query.edit_message_text(
            text="Silakan masukkan NIK santri yang ingin dicari:",
            parse_mode='Markdown'
        )
        return CARI_NIK
    elif mode == "nama":
        context.user_data["halaman"] = 0
        await tampilkan_nama_inline(query, context)
        return PILIH_MODE

async def proses_cari_nik(update: Update, context: ContextTypes.DEFAULT_TYPE):
    nik_input = update.message.text.strip()
    data = context.user_data.get("santri_data", get_data_santri())

    for row in data:
        if row[1] == nik_input:
            return await tampilkan_detail(row, update)

    await update.message.reply_text("❌ Data tidak ditemukan untuk NIK tersebut.")
    return ConversationHandler.END

async def tampilkan_nama_inline(query, context):
    data = context.user_data["santri_data"]
    halaman = context.user_data["halaman"]
    awal = halaman * JUMLAH_PER_HALAMAN
    akhir = awal + JUMLAH_PER_HALAMAN
    potongan = data[awal:akhir]

    keyboard = [
        [InlineKeyboardButton(f"{i+1+awal}. {row[2]}", callback_data=f"lihat|{row[2]}")]
        for i, row in enumerate(potongan)
    ]

    navigasi = []
    if halaman > 0:
        navigasi.append(InlineKeyboardButton("⬅️ Sebelumnya", callback_data="navi|prev"))
    if akhir < len(data):
        navigasi.append(InlineKeyboardButton("➡️ Selanjutnya", callback_data="navi|next"))

    if navigasi:
        keyboard.append(navigasi)

    await query.edit_message_text(
        text="📋 *Pilih Nama Santri:*",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )

async def navigasi_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    arah = query.data.split("|")[1]

    if arah == "next":
        context.user_data["halaman"] += 1
    elif arah == "prev" and context.user_data["halaman"] > 0:
        context.user_data["halaman"] -= 1

    await tampilkan_nama_inline(query, context)

async def tampilkan_detail_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    chat_id = query.message.chat.id
    message_id = query.message.message_id

    # Tampilkan loading
    try:
        await query.edit_message_text(text="🔄 Membuka detail...", reply_markup=None)
    except telegram.error.BadRequest:
        pass  # Abaikan jika isi pesan tidak berubah

    nama = query.data.split("|")[1]
    data = context.user_data.get("santri_data", get_data_santri())

    for row in data:
        if row[2] == nama:
            await asyncio.sleep(0.5)
            await tampilkan_detail(row, query)

            # ✅ Hapus pesan loading
            try:
                await context.bot.delete_message(chat_id=chat_id, message_id=message_id)
            except:
                pass

            return ConversationHandler.END

    await query.message.reply_text("Santri tidak ditemukan.")

async def tampilkan_detail(row, msg_or_query):
    (nis, nik, nama, tmp_lahir, tgl_lahir, jk, agama, anak_ke, alamat, kecamatan, kabupaten, provinsi, sekolah,
     jenis, npsn, lokasi, lulus, provinsi_sekolah, ayah, kk, nikayah, t4ayah, tgl_lahirayah, pendidikan, job, ibu,
     nikibu, t4ibu, tglibu, pndibu, pkibu, status, file_id) = (row + [''] * 33)[:33]

    try:
        tgl_lahir = datetime.datetime.strptime(tgl_lahir, "%d/%m/%Y").strftime("%d-%m-%Y")
    except:
        pass

    file_id = row[31].strip() if len(row) > 31 else None

    msg = (
        f"*📄 Detail Santri:*\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"👤 *Nama:* {nama}\n"
        f"🆔 *NIS:* {nis}\n"
        f"🪪 *NIK:* {nik}\n"
        f"🎂 *Tempat, Tanggal Lahir:* {tmp_lahir}, {tgl_lahir}\n"
        f"🚻 *Jenis Kelamin:* {jk}\n"
        f"🕌 *Agama:* {agama}\n"
        f"👶 *Anak ke:* {anak_ke}\n"
        f"📍 *Alamat:* {alamat}\n"
        f"🗺️  *Kecamatan:* {kecamatan}\n"
        f"🏙️  *Kabupaten:* {kabupaten}\n"
        f"🏜️  *Provinsi:* {provinsi}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"*📄 Data Pendidikan:*\n"
        f"🏫 *Nama:* {sekolah}\n"
        f"🏭 *Jenis Pendidikan:* {jenis}\n"
        f"🧾 *NPSN:* {npsn}\n"
        f"📍 *Lokasi:* {lokasi}\n"
        f"🗓 *Tahun Lulus:* {lulus}\n"
        f"🏞 *Provinsi:* {provinsi_sekolah}\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"*📑 Data Orangtua/Wali:*\n"
        f"👨‍🦰*Nama Ayah:* {ayah}\n"
        f"📋 *Nomor KK:* {kk}\n"
        f"🗂  *NIK :* {nikayah}\n"
        f"🎂 *Tempat, Tanggal Lahir:* {t4ayah}, {tgl_lahirayah}\n"
        f"📚 *Pendidikan:* {pendidikan}\n"
        f"🔨 *Pekerjaan:* {job}\n"
        f"🧕🏻*Nama Ibu:* {ibu}\n"
        f"🗂  *NIK :* {nikibu}\n"
        f"🎂 *Tempat, Tanggal Lahir:* {t4ibu}, {tglibu}\n"
        f"📚 *Pendidikan:* {pndibu}\n"
        f"🔨 *Pekerjaan:* {pkibu}"
    )

    if file_id and len(file_id) > 50:
        try:
            await msg_or_query.message.reply_photo(
                photo=file_id,
                caption=msg,
                parse_mode="Markdown"
            )
        except Exception as e:
            await msg_or_query.message.reply_text(
                f"⚠️ Gagal menampilkan foto:\n{e}\n\n{msg}",
                parse_mode="Markdown"
            )
    else:
        await msg_or_query.message.reply_text(msg, parse_mode="Markdown")

    return ConversationHandler.END
