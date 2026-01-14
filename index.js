require("dotenv").config();
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const express = require("express");
const qrcode = require("qrcode-terminal");
const NodeCache = require("node-cache");
const { Boom } = require("@hapi/boom");
const { MongoClient } = require("mongodb");
const { initSholatReminder } = require('./utils/sholatReminder');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("baileys");

// Router pesan utama
const MessagesUpsert = require("./src/message");

// GOOGLE SHEETS SERVICE
const { sheetsService } = require("./services/sheetsService");

// AI SERVICE (Fitur Keislaman)
const { initializeAIService } = require("./services/aiService");

// ===============================
// EXPRESS SERVER KEEP ALIVE
// ===============================
const app = express();
app.get("/", (req, res) => res.send("PPTQ AL-ITQON BOT RUNNING"));
app.listen(3000, () =>
  console.log(chalk.green("[Server] Running on port 3000"))
);

// ===============================
// STORE SEDERHANA
// ===============================
const store = {
  messages: {},
  contacts: {},
  groupMetadata: {},
  presences: {}
};

// ===============================
// KONSTAN PATH AUTH
// ===============================
const AUTH_DIR = path.join(__dirname, "auth");

// ===============================
// FUNGSI BANTU MONGODB
// ===============================
async function getMongoClient() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.log(chalk.yellow("⚠️ MONGO_URI kosong, session hanya disimpan di file."));
    return null;
  }

  const client = new MongoClient(uri);
  await client.connect();
  return client;
}

async function restoreAuthFromMongo(sessionName) {
  const client = await getMongoClient().catch((err) => {
    console.log(chalk.red("❌ Gagal konek Mongo untuk restore session:"), err.message);
    return null;
  });
  if (!client) return;

  try {
    const dbName = process.env.MONGO_DB_NAME || "whatsapp_bot";
    const collName = process.env.APP_STORE || "baileys_auth_files";
    const db = client.db(dbName);
    const col = db.collection(collName);

    const docs = await col.find({ session: sessionName }).toArray();

    if (!docs.length) {
      console.log(chalk.yellow("ℹ️ Tidak ada session di Mongo, mulai login baru."));
      return;
    }

    await fs.promises.mkdir(AUTH_DIR, { recursive: true });

    for (const doc of docs) {
      const filePath = path.join(AUTH_DIR, doc.filename);
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, doc.content, "utf8");
    }

    console.log(chalk.green("✅ Session berhasil direstore dari Mongo ke folder auth."));
  } catch (err) {
    console.log(chalk.red("❌ Error restoreAuthFromMongo:"), err.message);
  } finally {
    await client.close();
  }
}

async function saveAuthToMongo(sessionName) {
  const client = await getMongoClient().catch((err) => {
    console.log(chalk.red("❌ Gagal konek Mongo untuk simpan session:"), err.message);
    return null;
  });
  if (!client) return;

  try {
    const dbName = process.env.MONGO_DB_NAME || "whatsapp_bot";
    const collName = process.env.APP_STORE || "baileys_auth_files";
    const db = client.db(dbName);
    const col = db.collection(collName);

    if (!fs.existsSync(AUTH_DIR)) {
      console.log(chalk.yellow("ℹ️ Folder auth belum ada, tidak ada yang disimpan ke Mongo."));
      return;
    }

    // helper rekursif baca semua file di AUTH_DIR
    async function walk(dir) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const files = [];
      for (const e of entries) {
        const resPath = path.join(dir, e.name);
        if (e.isDirectory()) {
          files.push(...(await walk(resPath)));
        } else {
          files.push(resPath);
        }
      }
      return files;
    }

    const files = await walk(AUTH_DIR);
    const ops = [];

    for (const file of files) {
      const rel = path.relative(AUTH_DIR, file); // nama file relatif
      const content = await fs.promises.readFile(file, "utf8");

      ops.push({
        updateOne: {
          filter: { session: sessionName, filename: rel },
          update: { $set: { session: sessionName, filename: rel, content } },
          upsert: true
        }
      });
    }

    if (ops.length) {
      await col.bulkWrite(ops);
      console.log(chalk.green(`✅ Session tersimpan ke Mongo (${files.length} file).`));
    } else {
      console.log(chalk.yellow("ℹ️ Tidak ada file auth yang disimpan ke Mongo."));
    }
  } catch (err) {
    console.log(chalk.red("❌ Error saveAuthToMongo:"), err.message);
  } finally {
    await client.close();
  }
}

// ===============================
// START BOT
// ===============================
async function startBot() {
  // INIT GOOGLE SHEETS
  console.log(chalk.cyan("🔧 Initializing Google Sheets..."));
  try {
    await sheetsService.initialize(
       path.join(__dirname, process.env.GOOGLE_SERVICE_ACCOUNT_PATH),
       process.env.GOOGLE_SHEET_ID
   );
    console.log(chalk.green("✅ Google Sheets siap"));
  } catch (err) {
    console.error("❌ Google Sheets error:", err.message || err);
    console.log(
      chalk.yellow("Bot tetap jalan, namun fitur hafalan/rekap mungkin error.")
    );
  }

  // INIT AI SERVICE
  const AI_KEY = process.env.OPENROUTER_API_KEY || "";
  if (!AI_KEY) {
    console.log(chalk.red("❌ OPENROUTER_API_KEY tidak ditemukan di .env"));
    console.log(chalk.yellow("Fitur Keislaman (AI) dinonaktifkan."));
  }
  const aiService = initializeAIService(AI_KEY);

  // Nama session
  const sessionName = process.env.APP_SESSION || "pptq-session";

  // 1) Restore session dari Mongo ke folder auth
  await restoreAuthFromMongo(sessionName);

  // 2) Load auth Baileys dari folder auth
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const { version } = await fetchLatestBaileysVersion();
  const msgRetryCounterCache = new NodeCache();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: state,
    msgRetryCounterCache,
    syncFullHistory: false,
    browser: ["PPTQ AL-ITQON", "Chrome", "1.0"],
  });

  // Setiap creds berubah → simpan ke file lalu ke Mongo
  sock.ev.on("creds.update", async () => {
    await saveCreds();
    await saveAuthToMongo(sessionName);
  });

  // CONNECTION UPDATE
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(chalk.yellow("🔑 Scan QR (jika muncul):"));
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log(
        chalk.green("📱 BOT TERHUBUNG SEBAGAI:"),
        sock.user?.id
        initSholatReminder(sock);
      );
    }

    if (connection === "close") {
      const reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      console.log("💥 Connection closed:", reason, DisconnectReason[reason]);

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔁 Reconnecting...");
        startBot().catch((err) =>
          console.error("❌ Error saat reconnect:", err)
        );
      } else {
        console.log("🚪 Logged out. Kalau mau login ulang, hapus dokumen session di Mongo.");
      }
    }
  });

  // ALL MESSAGES → ROUTER
  sock.ev.on("messages.upsert", async (message) => {
    await MessagesUpsert(sock, message, store, aiService);
  });
}

// Jalankan bot
startBot().catch((err) => {
  console.error("❌ Fatal error startBot:", err);
});
