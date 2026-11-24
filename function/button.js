import { readFile } from "node:fs/promises";
import {
    generateWAMessageFromContent,
    prepareWAMessageMedia
} from "baileys";
import settings from "../settings.js";

/* ── Fake quote (branding @telkomsel) ───────────── */
const makeFakeQuote = () => ({
    key: {
        fromMe: false,
        participant: "0@s.whatsapp.net",
        remoteJid: "status@broadcast"
    },
    message: {
        imageMessage: {
            text: "@telkomsel",
            caption: "@telkomsel"
        }
    }
});

function extractButtonId(message) {
    const m = message?.message;
    if (!m) return null;

    if (m.buttonsResponseMessage?.selectedButtonId)
        return m.buttonsResponseMessage.selectedButtonId;

    if (m.templateButtonReplyMessage?.selectedId)
        return m.templateButtonReplyMessage.selectedId;

    if (m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
        try {
            return JSON.parse(
                m.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
            )?.id || null;
        } catch { return null; }
    }
    return null;
}

async function sendInteractive(sock, jid, { caption, footer, buttons, imageBuffer }) {
    let header = { title: "", hasMediaAttachment: false };

    if (imageBuffer) {
        const media = await prepareWAMessageMedia(
            { image: imageBuffer },
            { upload: sock.waUploadToServer }
        );
        header = {
            title: "",
            hasMediaAttachment: true,
            imageMessage: media.imageMessage
        };
    }

    const msg = generateWAMessageFromContent(
        jid,
        {
            interactiveMessage: {
                header,
                body:   { text: caption },
                footer: { text: footer },
                nativeFlowMessage: { buttons }
            }
        },
        { userJid: sock.user.id, quoted: makeFakeQuote() } // ← fake quote
    );
    await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

export async function handleButton(sock, message) {
    const id = extractButtonId(message);
    if (!id) return false;

    const jid      = message.key.remoteJid;
    const nama     = message.pushName || "Bapak/Ibu";
    const botName  = settings.botName || "Telkomsel";
    const footer   = `${botName} • ONT Dismantling`;

    switch (id) {
        case "ont_lihat_contoh": {
            let img = null;
            try {
                img = await readFile(new URL("../media/ont.jpg", import.meta.url));
            } catch (e) {
                console.warn("[BTN] ont.jpg tidak ada:", e?.message);
            }

            const caption =
                `Berikut contoh perangkat ONT Telkomsel yang dimaksud. ` +
                `Mohon dicek apakah perangkat seperti ini masih ada di rumah Bapak/Ibu.\n\n` +
                `Silakan pilih konfirmasi di bawah ini.`;

            const buttons = [
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Masih ada",
                        id: "ont_masih_ada"
                    })
                },
                {
                    name: "quick_reply",
                    buttonParamsJson: JSON.stringify({
                        display_text: "Tidak ada",
                        id: "ont_tidak_ada"
                    })
                }
            ];

            try {
                await sendInteractive(sock, jid, {
                    caption, footer, buttons, imageBuffer: img
                });
            } catch (e) {
                console.error("[BTN] Gagal contoh ONT:", e?.message || e);
                await sock.sendMessage(jid, { text: caption }, { quoted: makeFakeQuote() });
            }
            return true;
        }

        case "ont_masih_ada": {
            const body =
                `Baik, terima kasih, Bapak/Ibu ${nama}. ` +
                `Kami catat bahwa perangkat ONT masih ada di rumah.\n\n` +
                `Pengambilan ONT akan dikabarkan kembali oleh tim kami. ` +
                `Mohon bantu kirimkan:\n` +
                `1. Foto perangkat ONT yang ada di rumah\n` +
                `2. Share lokasi alamat rumah\n` +
                `3. Foto tampak depan rumah\n\n` +
                `Waktu pengambilan akan diinformasikan kembali. Terima kasih.\n\n` +
                `_Setelah mengirimkan data di atas, Bapak/Ibu tidak perlu membalas lagi. ` +
                `Tim kami akan menghubungi kembali untuk jadwal pengambilan._`;

            await sock.sendMessage(jid, { text: body }, { quoted: makeFakeQuote() });
            return true;
        }

        case "ont_tidak_ada": {
            const body =
                `Baik, terima kasih, Bapak/Ibu ${nama}. ` +
                `Mohon informasikan perangkat ONT tersebut sudah tidak ada karena alasan apa:\n\n` +
                `1. Sudah diambil oleh teknisi Telkomsel\n` +
                `2. Diambil oleh pihak lain\n` +
                `3. Hilang/rusak/lainnya\n\n` +
                `Jika sudah diambil oleh teknisi Telkomsel, mohon sebutkan kira-kira kapan diambilnya. ` +
                `Jika Bapak/Ibu masih ingat nama teknisi atau ciri-cirinya, boleh diinformasikan. ` +
                `Jika diambil oleh pihak lain, mohon jelaskan siapa dan kapan. ` +
                `Jika tidak ingat detailnya, cukup sampaikan sebisanya. ` +
                `Informasi ini akan kami catat. Terima kasih.`;

            await sock.sendMessage(jid, { text: body }, { quoted: makeFakeQuote() });
            return true;
        }

        default:
            return false;
    }
}

export default handleButton;