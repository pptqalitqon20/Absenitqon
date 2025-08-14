# Base image Freqtrade
FROM freqtradeorg/freqtrade:stable

# Install python deps untuk web /health
RUN pip install --no-cache-dir fastapi uvicorn

# Copy user_data (config + strategy)
COPY user_data /freqtrade/user_data

# Copy health app + entrypoint
COPY app.py /freqtrade/app.py
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Render mengatur PORT env. Kita pakai itu untuk web server.
ENV PORT=10000

WORKDIR /freqtrade
ENTRYPOINT ["/entrypoint.sh"]
