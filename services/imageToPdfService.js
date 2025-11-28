// services/imageToPdfService.js

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit'); // ⚠️ Menggunakan PDFKit, pastikan sudah diinstall

// Pastikan folder temp dan output ada
const TEMP_DIR = path.join(__dirname, '../temp');
const OUTPUT_DIR = path.join(__dirname, '../output');

// Buat folder jika belum ada
[TEMP_DIR, OUTPUT_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

class ImageToPdfService {
    constructor() {
        console.log('✅ ImageToPdfService initialized with PDFKit');
        // Bersihkan file lama saat inisialisasi
        this.cleanupOldFiles();
        // Jadwalkan cleanup setiap jam
        setInterval(() => this.cleanupOldFiles(), 60 * 60 * 1000);
    }

    /**
     * Konversi single image ke PDF, menggunakan PDFKit.
     * Gambar akan dipaskan ke halaman A4.
     * @param {string} imagePath - Path ke gambar
     * @returns {Promise<string>} Path ke PDF yang dihasilkan
     */
    async convertSingleImageToPDF(imagePath) {
        return new Promise((resolve, reject) => {
            console.log(`🔄 Converting single image to PDF: ${path.basename(imagePath)}`);
            
            if (!imagePath || !fs.existsSync(imagePath)) {
                return reject(new Error("File gambar tidak ditemukan."));
            }

            const pdfPath = path.join(OUTPUT_DIR, `pdf_${Date.now()}.pdf`);
            // pdfkit menggunakan ukuran A4 default
            const doc = new PDFDocument({ autoFirstPage: false }); 

            const stream = fs.createWriteStream(pdfPath);
            doc.pipe(stream);

            try {
                // Tambahkan halaman baru (A4 default)
                doc.addPage()
                // Masukkan gambar, paskan (fit) ke halaman
                .image(imagePath, 0, 0, { 
                    fit: [doc.page.width, doc.page.height], 
                    align: 'center', 
                    valign: 'center' 
                });

                doc.end();
                stream.on('finish', () => resolve(pdfPath));
                stream.on('error', reject);
            } catch (error) {
                this.cleanupFile(pdfPath);
                reject(error);
            }
        });
    }

    /**
     * Konversi multiple images ke PDF (native method), satu gambar per halaman A4.
     * @param {Array<string>} imagePaths - Array path gambar
     * @returns {Promise<string>} Path ke PDF yang dihasilkan
     */
    async convertImagesToPDFNative(imagePaths) {
        return new Promise((resolve, reject) => {
            console.log(`🔄 Converting ${imagePaths.length} images to PDF (Native)`);
            
            if (!imagePaths || imagePaths.length === 0) {
                return reject(new Error("Daftar gambar kosong."));
            }
            
            const pdfPath = path.join(OUTPUT_DIR, `pdf_${Date.now()}_${imagePaths.length}pages.pdf`);
            const doc = new PDFDocument({ autoFirstPage: false });

            const stream = fs.createWriteStream(pdfPath);
            doc.pipe(stream);

            try {
                imagePaths.forEach(imagePath => {
                    if (fs.existsSync(imagePath)) {
                        // Tambahkan halaman baru (A4 default) untuk setiap gambar
                        doc.addPage()
                        .image(imagePath, 0, 0, { 
                            fit: [doc.page.width, doc.page.height], 
                            align: 'center', 
                            valign: 'center' 
                        });
                        console.log(`✅ Added page for: ${path.basename(imagePath)}`);
                    } else {
                        console.warn(`⚠️ Gambar tidak ditemukan, dilewati: ${imagePath}`);
                    }
                });
                
                if (doc.page.count === 0) {
                     throw new Error('No valid images were processed');
                }

                doc.end();
                stream.on('finish', () => resolve(pdfPath));
                stream.on('error', reject);
            } catch (error) {
                this.cleanupFile(pdfPath);
                reject(error);
            }
        });
    }

    // --- Cleanup & Utility methods (dipertahankan dari kode asli) ---

    /**
     * Hapus file temporary
     * @param {string} filePath - Path file yang akan dihapus
     */
    cleanupFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Cleaned up: ${path.basename(filePath)}`);
            }
        } catch (error) {
            console.warn(`⚠️ Could not cleanup file ${filePath}:`, error.message);
        }
    }

    /**
     * Hapus multiple files
     * @param {Array<string>} filePaths - Array path files yang akan dihapus
     */
    cleanupFiles(filePaths) {
        if (!Array.isArray(filePaths)) return;
        
        filePaths.forEach(filePath => {
            this.cleanupFile(filePath);
        });
    }

    /**
     * Bersihkan folder temp dari file lama (older than 1 hour)
     */
    cleanupOldFiles() {
        try {
            const now = Date.now();
            const maxAge = 60 * 60 * 1000; // 1 hour
            
            const cleanFolder = (folderPath) => {
                if (!fs.existsSync(folderPath)) return;
                
                const files = fs.readdirSync(folderPath);
                files.forEach(file => {
                    const filePath = path.join(folderPath, file);
                    try {
                        const stats = fs.statSync(filePath);
                        if (now - stats.mtime.getTime() > maxAge) {
                            fs.unlinkSync(filePath);
                            console.log(`🗑️ Cleaned up old file: ${file}`);
                        }
                    } catch (error) {
                        console.warn(`⚠️ Could not cleanup old file ${file}:`, error.message);
                    }
                });
            };

            cleanFolder(TEMP_DIR);
            cleanFolder(OUTPUT_DIR);
            
        } catch (error) {
            console.warn('⚠️ Error during old files cleanup:', error.message);
        }
    }
}

// ✅ Singleton instance
const imageToPdfService = new ImageToPdfService();

module.exports = imageToPdfService;
