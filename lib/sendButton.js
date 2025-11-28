// lib/sendButton.js
// Helper untuk kirim tombol Hitori-style (buttons + native_flow)

const {
  generateWAMessageFromContent,
  generateWAMessageContent,
  jidNormalizedUser,
} = require("baileys");

/**
 * Kirim tombol menggunakan skema Hitori:
 * - dibungkus dalam viewOnceMessage + buttonsMessage
 * - tambahan "biz/interactive/native_flow" supaya tombol kebaca sebagai Native Flow
 *
 * @param {import("baileys").WASocket} sock
 * @param {string} jid
 * @param {object} content
 * @param {object} options
 */
async function sendButtonMsg(sock, jid, content = {}, options = {}) {
  const {
    text,
    caption,
    footer = "",
    headerType = 1,
    contextInfo = {},
    buttons = [],
    mentions = [],
    ...media
  } = content;

  // generate isi media (kalau ada dokumen/gambar/video)
  let mediaMsg = {};
  if (media && Object.keys(media).length > 0) {
    mediaMsg = await generateWAMessageContent(media, {
      upload: sock.waUploadToServer,
    });
  }

  // Bangun pesan viewOnce + buttonsMessage
  const msg = await generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          buttonsMessage: {
            ...mediaMsg,
            contentText: text || caption || "",
            footerText: footer,
            buttons,
            headerType:
              media && Object.keys(media).length > 0
                ? Math.max(
                    ...Object.keys(media).map(
                      (a) => ({ document: 3, image: 4, video: 5, location: 6 })[a] || headerType
                    )
                  )
                : headerType,
            contextInfo: {
              ...contextInfo,
              ...(options.contextInfo || {}),
              mentionedJid: options.mentions || mentions,
            },
          },
        },
      },
    },
    {}
  );

  // Relay dengan tambahan node "biz/interactive" supaya tombol jadi native_flow
  const hasil = await sock.relayMessage(jid, msg.message, {
    messageId: msg.key.id,
    additionalNodes: [
      {
        tag: "biz",
        attrs: {},
        content: [
          {
            tag: "interactive",
            attrs: {
              type: "native_flow",
              v: "1",
            },
            content: [
              {
                tag: "native_flow",
                attrs: {
                  name: "quick_reply",
                },
              },
            ],
          },
        ],
      },
    ],
  });

  return hasil;
}

module.exports = { sendButtonMsg };
