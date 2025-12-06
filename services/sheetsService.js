const { google } = require('googleapis');
// Helper untuk parsing tanggal di kolom Absensi
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
  // fallback: biarkan null kalau tak terdeteksi
  return null;
}

class SheetsService {
  constructor() {
    this.auth = null;
    this.sheets = null;
    this.spreadsheetId = null;
    this.initialized = false;

    // Konstanta untuk sheet "Absensi"
    this.TAB_TITLE = 'Absensi';
    this.HEADERS = ['Nama', 'Halaqah', 'Tanggal Ujian', 'Kategori', 'Juz', 'Ket'];
    this.HEADER_RANGE = `${this.TAB_TITLE}!A1:F1`;
    this.APPEND_RANGE = `${this.TAB_TITLE}!A:F`;
  }

  // Inisialisasi auth dan client Google Sheets
  async initialize(credentialsPath, spreadsheetId) {
    try {
      console.log('🔧 Initializing Google Sheets (Absensi only)...');

      const auth = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.auth = auth;
      this.sheets = google.sheets({ version: 'v4', auth });
      this.spreadsheetId = spreadsheetId;
      this.initialized = true;

      console.log('✅ Google Sheets auth successful');
      await this.ensureAbsensiSheet();
      console.log('✅ Google Sheets service fully initialized (Absensi ready)');
    } catch (error) {
      console.error('❌ Failed to initialize Google Sheets:', error);
      throw error;
    }
  }

  // =======================
  // Fungsi umum (multi-sheet)
  // =======================

  /**
   * Mengambil semua nilai (A:Z) dari sheet tertentu.
   * @param {string} sheetName - Nama sheet (misal: "Santri").
   */
  async getSheetValues(sheetName) {
    if (!this.initialized) throw new Error('Sheets service not initialized.');
    try {
      const range = `${sheetName}!A:Z`;
      const res = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return res.data.values || [];
    } catch (err) {
      console.error(`❌ getSheetValues for ${sheetName} error:`, err);
      return [];
    }
  }

  async getSpreadsheetMeta() {
    if (!this.initialized) throw new Error('Sheets service not initialized.');
    const res = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: 'sheets(properties(sheetId,title))',
    });
    return res.data;
  }

  // =======================
  // Konfigurasi sheet "Absensi"
  // =======================

  async ensureAbsensiSheet() {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const meta = await this.getSpreadsheetMeta();
    const sheets = meta.sheets || [];
    const exists = sheets.some((s) => s.properties?.title === this.TAB_TITLE);

    if (!exists) {
      console.log(`🆕 Creating sheet "${this.TAB_TITLE}"...`);
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
    } else {
      console.log(`✅ Sheet "${this.TAB_TITLE}" already exists`);
    }
    //A1-F1
        const getHead = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: this.HEADER_RANGE,
    });
    const currentHeader = getHead.data.values?.[0] || [];

    const headerMismatch =
      currentHeader.length !== this.HEADERS.length ||
      this.HEADERS.some((h, i) => (currentHeader[i] || '').trim() !== h);

    if (headerMismatch) {
      console.log('📝 Writing Absensi headers A1:F1 ...');
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: this.HEADER_RANGE,
        valueInputOption: 'RAW',
        resource: { values: [this.HEADERS] },
      });

      // (Opsional) Bold header
      try {
        const meta2 = await this.getSpreadsheetMeta();
        const sheet = meta2.sheets.find(
          (s) => s.properties?.title === this.TAB_TITLE
        );
        const sheetId = sheet?.properties?.sheetId;

        if (sheetId != null) {
          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            resource: {
              requests: [
                {
                  repeatCell: {
                    range: {
                      sheetId,
                      startRowIndex: 0,
                      endRowIndex: 1,
                      startColumnIndex: 0,
                      endColumnIndex: 6,
                    },
                    cell: {
                      userEnteredFormat: {
                        textFormat: { bold: true },
                        horizontalAlignment: 'CENTER',
                      },
                    },
                    fields:
                      'userEnteredFormat(textFormat,horizontalAlignment)',
                  },
                },
                {
                  autoResizeDimensions: {
                    dimensions: {
                      sheetId,
                      dimension: 'COLUMNS',
                      startIndex: 0,
                      endIndex: 6,
                    },
                  },
                },
              ],
            },
          });
        }
      } catch (e) {
        console.warn('⚠️ Header formatting skipped:', e.message || e);
      }
    } else {
      console.log('✅ Absensi headers already set.');
    }
  }

  /**
   * Tambahkan satu baris Absensi ke A:F.
   * payload = { nama, halaqah, tanggal, kategori, juz, ket }
   */
  async addAbsensiRow(payload) {
    try {
      if (!this.initialized) throw new Error('Sheets service not initialized.');

      const {
        nama = '',
        halaqah = '',
        tanggal = '', // ex: '2025-10-31'
        kategori = '',
        juz = '',
        ket = '',
      } = payload || {};

      const row = [nama, halaqah, tanggal, kategori, juz, ket];

      // Validasi minimal
      const requiredIdx = [0, 1, 2, 3, 4]; // Nama,Halaqah,Tanggal,Kategori,Juz
      const missing = [];
      requiredIdx.forEach((i) => {
        if (!String(row[i] || '').trim()) missing.push(this.HEADERS[i]);
      });
      if (missing.length) {
        throw new Error(`Kolom wajib belum lengkap: ${missing.join(', ')}`);
      }

      await this.ensureAbsensiSheet();

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: this.APPEND_RANGE,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [row] },
      });

      console.log('✅ Absensi appended:', row);
      return true;
    } catch (err) {
      console.error('❌ Error addAbsensiRow:', err);
      return false;
    }
  }

  // =======================
  // Helper rekap bulanan (Absensi)
  // =======================
    async listAbsensiRows() {
    try {
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
          _rawTanggal: r[2] || '',
        }))
        .filter((x) => x.nama && x.tanggal);
    } catch (err) {
      console.error('❌ listAbsensiRows error:', err);
      return [];
    }
  }

  async listAbsensiByMonth({ year, month, halaqah }) {
    try {
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

      // Sort by tanggal ascending, lalu nama
      filtered.sort((a, b) => {
        if (a.tanggal < b.tanggal) return -1;
        if (a.tanggal > b.tanggal) return 1;
        return a.nama.localeCompare(b.nama);
      });

      return filtered;
    } catch (err) {
      console.error('❌ listAbsensiByMonth error:', err);
      return [];
    }
  }

  // =======================
  // Update satu sel (dipakai laporan pekanan)
  // =======================
  async updateCell(sheetName, a1Notation, value) {
    if (!this.initialized) throw new Error('Sheets service not initialized.');

    const range = `${sheetName}!${a1Notation}`; // contoh: "Santri!F12"

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[value]], // 1 sel saja
      },
    });

    return true;
  }
}

// Alias kompatibilitas (kalau ada kode lama pakai ensureSheetAndHeaders)
if (
  typeof SheetsService.prototype.ensureAbsensiSheetAndHeaders === 'function' &&
  typeof SheetsService.prototype.ensureSheetAndHeaders !== 'function'
) {
  SheetsService.prototype.ensureSheetAndHeaders =
    SheetsService.prototype.ensureAbsensiSheetAndHeaders;
}

// Singleton export
const sheetsService = new SheetsService();
module.exports = { sheetsService };
      
