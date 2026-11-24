import {
    generateWAMessageFromContent
} from "baileys";
import settings from "../settings.js";

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

function normalizeNumber(raw) {
    let n = String(raw || "").replace(/\D/g, "");
    if (!n) return null;
    if (n.startsWith("0")) n = "62" + n.slice(1);
    if (!n.startsWith("62")) n = "62" + n;
    return n;
}

function getSapaanWaktu(date = new Date()) {
    const h = date.getHours();
    if (h >= 4  && h < 11) return "Pagi";
    if (h >= 11 && h < 15) return "Siang";
    if (h >= 15 && h < 18) return "Sore";
    return "Malam";
}

export async function send(sock, message, args) {
    const replyJid = message?.key?.remoteJid;
    if (!sock || !replyJid) return;

    const raw = (args || []).join(" ").trim();
    if (!raw.includes("|")) {
        return sock.sendMessage(replyJid, {
            text: "Format: /send <nomor>|<nama Pelanggan>\nContoh: /send 08123456789|Budi Santoso"
        }, { quoted: message });
    }

    const [numRaw, ...rest] = raw.split("|");
    const namaPelanggan = rest.join("|").trim() || "Pelanggan";
    const target = normalizeNumber(numRaw);
    if (!target) {
        return sock.sendMessage(replyJid, { text: "❌ Nomor tidak valid." }, { quoted: message });
    }

    const targetJid = target + "@s.whatsapp.net";
    const sapaan    = getSapaanWaktu();
    const botName   = settings.botName || "Telkomsel";

    const caption =
        `Selamat ${sapaan}, Bapak/Ibu *${namaPelanggan}*. Kami dari *${botName}*.\n\n` +
        `Kami menginformasikan bahwa karena layanan sudah tidak berlangganan, ` +
        `perangkat ONT (modem/router internet Telkomsel) akan ditarik ke pusat.\n\n` +
        `Mohon konfirmasi, apakah perangkat ONT tersebut masih ada di rumah Bapak/Ibu, ` +
        `atau sudah tidak ada?`;

    const buttons = [
        {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
                display_text: "Lihat contoh ONT",
                id: "ont_lihat_contoh"
            })
        },
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
        const msg = generateWAMessageFromContent(
            targetJid,
            {
                interactiveMessage: {
                    body:   { text: caption },
                    footer: { text: `${botName} • ONT Dismantling` },
                    nativeFlowMessage: { buttons }
                }
            },
            { userJid: sock.user.id, quoted: makeFakeQuote() }
        );
        await sock.relayMessage(targetJid, msg.message, { messageId: msg.key.id });

        await sock.sendMessage(replyJid, {
            text: `✅ Pesan terkirim ke *${target}* (${namaPelanggan}).`
        }, { quoted: message });
    } catch (e) {
        console.error("[SEND] Gagal:", e?.message || e);
        await sock.sendMessage(replyJid, {
            text: `❌ Gagal mengirim: ${e?.message || e}`
        }, { quoted: message });
    }
}

export default send;