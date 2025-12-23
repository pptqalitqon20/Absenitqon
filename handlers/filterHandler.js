// handlers/filterHandler.js
const sharp = require('sharp');
const Jimp = require('jimp');
const { downloadContentFromMessage } = require('baileys');

/**
 * Handler untuk mengubah gambar menjadi Hitam Putih (Grayscale)
 */
async function handleGrayscale(sock, m, msg) {
    try {
        // 1. Ambil pesan gambar (bisa dari pesan langsung atau quoted/balasan)
        const quoted = m.quoted ? m.quoted : m;
        const mime = (quoted.msg || quoted).mimetype || '';

        if (!/image/.test(mime)) {
            return await sock.sendMessage(m.chat, { text: '❌ Kirim atau balas gambar dengan caption *.bw* untuk mengubahnya menjadi hitam putih.' });
        }

        await sock.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

        // 2. Download Media
        const stream = await downloadContentFromMessage(quoted.msg || quoted, 'image');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        let outputBuffer;

        // 3. PROSES UTAMA: Menggunakan SHARP
        try {
            console.log('[BW] Mencoba memproses dengan Sharp...');
            outputBuffer = await sharp(buffer)
                .grayscale() // Efek hitam putih
                .toBuffer();
            console.log('[BW] Berhasil menggunakan Sharp.');
        } 
        // 4. BACKUP: Jika Sharp Gagal, gunakan JIMP
        catch (sharpError) {
            console.error('[BW] Sharp Error, beralih ke Jimp:', sharpError.message);
            try {
                const image = await Jimp.read(buffer);
                outputBuffer = await image
                    .grayscale()
                    .getBufferAsync(Jimp.MIME_JPEG);
                console.log('[BW] Berhasil menggunakan Jimp.');
            } catch (jimpError) {
                throw new Error('Kedua library (Sharp & Jimp) gagal memproses gambar.');
            }
        }

        // 5. Kirim Hasil
        await sock.sendMessage(m.chat, { 
            image: outputBuffer, 
            caption: '✅ Berhasil diubah ke hitam putih.' 
        }, { quoted: m });
        
        await sock.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        return true;

    } catch (err) {
        console.error('❌ Error Grayscale Handler:', err);
        await sock.sendMessage(m.chat, { text: '❌ Terjadi kesalahan saat memproses gambar.' });
        return false;
    }
}

module.exports = { handleGrayscale };
