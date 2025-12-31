const { exec } = require('child_process');
const path = require('path');

function convertPdfToWord(pdfPath, docxPath) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '../tools/pdf_to_word.py');

    const cmd = `python3 "${scriptPath}" "${pdfPath}" "${docxPath}"`;
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        console.error('Python stderr:', stderr);
        return reject(err);
      }
      resolve(docxPath);
    });
  });
}

module.exports = { convertPdfToWord };
