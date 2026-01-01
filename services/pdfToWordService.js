const fs = require('fs');
const CloudmersiveConvertApiClient =
  require('cloudmersive-convert-api-client');

const defaultClient =
  CloudmersiveConvertApiClient.ApiClient.instance;

defaultClient.authentications['Apikey'].apiKey =
  process.env.CLOUDMERSIVE_API_KEY;

const api = new CloudmersiveConvertApiClient.ConvertDocumentApi();

async function convertPdfToWord(pdfPath, docxPath) {
  return new Promise((resolve, reject) => {
    api.convertDocumentPdfToDocx(
      fs.createReadStream(pdfPath),
      (error, data) => {
        if (error) return reject(error);
        fs.writeFileSync(docxPath, data);
        resolve(docxPath);
      }
    );
  });
}

module.exports = { convertPdfToWord };
