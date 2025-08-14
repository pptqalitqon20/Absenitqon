#!/usr/bin/env bash
set -e

# Catatan:
# - Awal pakai DRY-RUN (paper trading) agar aman.
# - Telegram diaktifkan dari config.json (token dan chat_id via ENV).
# - Aktifkan API server Freqtrade (untuk masa depan kalau mau cek status via HTTP).

# Jalankan Freqtrade (background)
freqtrade trade \
  --config /freqtrade/user_data/config.json \
  --logfile /freqtrade/freqtrade.log \
  --strategy SmaCross \
  --dry-run &

# Jalankan web server /health (foreground, dengarkan pada $PORT dari Render)
uvicorn app:app --host 0.0.0.0 --port ${PORT}
