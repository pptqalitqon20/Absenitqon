const { google } = require('googleapis');

/* ======================================
   HELPER PARSE TANGGAL
====================================== */
function parseDateCellToISO(cell) {
  if (!cell) return null;

  if (typeof cell === 'string') {
    const s = cell.trim();

    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // dd/mm/yyyy atau dd-mm-yyyy
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, '0');
      const mm = String(m[2]).padStart(2, '0');
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

class SheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = null;
    this.initialized = false;

    this.TAB_TITLE = 'Absensi';
    this.HEADERS = ['Nama', 'Halaqah', 'Tanggal Ujian', 'Kategori', 'Juz', 'Ket'];
    this.HEADER_RANGE = `${this.TAB_TITLE}!A1:F1`;
    this.APPEND_RANGE = `${this.TAB_TITLE}!A:F`;
  }

  /* ======================================
     INITIALIZE
  ====================================== */
  async initialize(credentialsPath, spreadsheetId) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.auth = auth;
      this.sheets = google.sheets({ version: 'v4', auth });
      this.spreadsheetId = spreadsheetId;
      this.initialized = true;

      await this.ensureAbsensiSheet();
      console.log('✅ SheetsService ready (Absensi)');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets:', error);
      throw error;
    }
  }

  /* ======================================
     META & GENERIC
  ====================================== */
  async getSpreadsheetMeta() {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const res = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets(properties(sheetId,title))',
    });

    return res.data;
  }

  async getSheetValues(sheetName) {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const range = `${sheetName}!A:Z`;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    return res.data.values || [];
  }

  /* ======================================
     ABSENSI SETUP
  ====================================== */
  async ensureAbsensiSheet() {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const meta = await this.getSpreadsheetMeta();
    const sheets = meta.sheets || [];
    const exists = sheets.some((s) => s.properties?.title === this.TAB_TITLE);

    if (!exists) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: this.TAB_TITLE,
                  gridProperties: { rowCount: 1000, columnCount: 6 },
                },
              },
            },
          ],
        },
      });
    }

    const getHead = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.HEADER_RANGE,
    });

    const currentHeader = getHead.data.values?.[0] || [];

    const headerMismatch =
      currentHeader.length !== this.HEADERS.length ||
      this.HEADERS.some((h, i) => (currentHeader[i] || '').trim() !== h);

    if (headerMismatch) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: this.HEADER_RANGE,
        valueInputOption: 'RAW',
        resource: { values: [this.HEADERS] },
      });
    }
  }

  /* ======================================
     TAMBAH ABSENSI
  ====================================== */
  async addAbsensiRow(payload) {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const {
      nama = '',
      halaqah = '',
      tanggal = '',
      kategori = '',
      juz = '',
      ket = '',
    } = payload || {};

    const row = [nama, halaqah, tanggal, kategori, juz, ket];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: this.APPEND_RANGE,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] },
    });

    return true;
  }

  /* ======================================
     LIST SEMUA ABSENSI (RAW)
  ====================================== */
  async listAbsensiRows() {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const range = 'Absensi!A2:F';

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });

    const rows = res.data.values || [];

    return rows
      .map((r) => ({
        nama: (r[0] || '').trim(),
        halaqah: (r[1] || '').trim(),
        tanggal: parseDateCellToISO(r[2]),
        kategori: (r[3] || '').trim(),
        juz: (r[4] || '').trim(),
        ket: (r[5] || '').trim(),
      }))
      .filter((x) => x.nama && x.tanggal);
  }

  /* ======================================
     🔥 TAMBAHAN: LIST SEMUA UNTUK REKAP
  ====================================== */
  async listAllAbsensi() {
    const all = await this.listAbsensiRows();

    // Sort terbaru di atas
    all.sort((a, b) => {
      if (a.tanggal > b.tanggal) return -1;
      if (a.tanggal < b.tanggal) return 1;
      return a.nama.localeCompare(b.nama);
    });

    return all;
  }

  /* ======================================
     FILTER PER BULAN (MASIH ADA)
  ====================================== */
  async listAbsensiByMonth({ year, month, halaqah }) {
    const all = await this.listAbsensiRows();

    const y = String(year);
    const m = String(month).padStart(2, '0');
    const ym = `${y}-${m}`;

    let filtered = all.filter((x) => x.tanggal?.startsWith(ym));

    if (halaqah) {
      const h = halaqah.toLowerCase();
      filtered = filtered.filter((x) =>
        x.halaqah.toLowerCase().includes(h)
      );
    }

    filtered.sort((a, b) => {
      if (a.tanggal < b.tanggal) return -1;
      if (a.tanggal > b.tanggal) return 1;
      return a.nama.localeCompare(b.nama);
    });

    return filtered;
  }

  /* ======================================
     UPDATE CELL
  ====================================== */
  async updateCell(sheetName, a1Notation, value) {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const range = `${sheetName}!${a1Notation}`;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[value]],
      },
    });

    return true;
  }
}

/* ======================================
   EXPORT SINGLETON
====================================== */
const sheetsService = new SheetsService();
module.exports = { sheetsService };
