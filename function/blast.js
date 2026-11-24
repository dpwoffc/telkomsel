import {
    generateWAMessageFromContent
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

/* ── Helpers ────────────────────────────────────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAX_TARGETS = 10;
const DEFAULT_DELAY_MS = 20_000; // 20 detik

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

/* ── Parser: "62|1, 62|2, 62|3" → [{number,name},...] ── */
function parseTargets(raw) {
    return String(raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
            if (!entry.includes("|")) return null;
            const [numRaw, ...rest] = entry.split("|");
            const name = rest.join("|").trim() || "Pelanggan";
            const number = normalizeNumber(numRaw);
            if (!number) return null;
            return { number, name, jid: number + "@s.whatsapp.net" };
        });
}

/* ── Kirim satu target ──────────────────────────── */
async function sendOne(sock, target, { botName, sapaan }) {
    const caption =
        `Selamat ${sapaan}, Bapak/Ibu *${target.name}*. Kami dari *${botName}*.\n\n` +
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

    const msg = generateWAMessageFromContent(
        target.jid,
        {
            interactiveMessage: {
                body:   { text: caption },
                footer: { text: `${botName} • ONT Dismantling` },
                nativeFlowMessage: { buttons }
            }
        },
        { userJid: sock.user.id, quoted: makeFakeQuote() }
    );
    await sock.relayMessage(target.jid, msg.message, { messageId: msg.key.id });
}

/* ── Command /blast ─────────────────────────────── */
export async function blast(sock, message, args) {
    const replyJid = message?.key?.remoteJid;
    if (!sock || !replyJid) return;

    const raw = (args || []).join(" ").trim();
    if (!raw) {
        return sock.sendMessage(replyJid, {
            text:
                "Format: /blast <nomor>|<nama>, <nomor>|<nama>, ...\n" +
                "Contoh: /blast 628111|Budi, 628222|Ani, 628333|Citra\n\n" +
                `• Maksimal ${MAX_TARGETS} nomor\n` +
                `• Delay ${DEFAULT_DELAY_MS / 1000} detik antar nomor`
        }, { quoted: message });
    }

    const parsed = parseTargets(raw);
    const valid  = parsed.filter(Boolean);
    const invalidCount = parsed.length - valid.length;

    if (!valid.length) {
        return sock.sendMessage(replyJid, {
            text: "❌ Tidak ada target valid. Format: <nomor>|<nama>, <nomor>|<nama>, ..."
        }, { quoted: message });
    }

    if (valid.length > MAX_TARGETS) {
        return sock.sendMessage(replyJid, {
            text: `❌ Terlalu banyak target: ${valid.length}. Maksimal ${MAX_TARGETS} nomor per /blast.`
        }, { quoted: message });
    }

    const botName = settings.botName || "Telkomsel";
    const sapaan  = getSapaanWaktu();

    // Info awal ke admin
    await sock.sendMessage(replyJid, {
        text:
            `🚀 *Blast dimulai*\n\n` +
            `• Total target : *${valid.length}*\n` +
            `• Invalid      : *${invalidCount}*\n` +
            `• Delay        : *${DEFAULT_DELAY_MS / 1000}s* per nomor\n` +
            `• Estimasi     : *~${Math.ceil((valid.length * DEFAULT_DELAY_MS) / 1000)}s*\n\n` +
            `Daftar:\n` +
            valid.map((t, i) => `${i + 1}. ${t.number} (${t.name})`).join("\n")
    }, { quoted: message });

    const okList = [];
    const failList = [];

    for (let i = 0; i < valid.length; i++) {
        const target = valid[i];
        try {
            await sendOne(sock, target, { botName, sapaan });
            okList.push(target);
            console.log(`[BLAST] ✅ ${i + 1}/${valid.length} → ${target.number}`);
        } catch (e) {
            failList.push({ target, error: e?.message || String(e) });
            console.warn(`[BLAST] ❌ ${i + 1}/${valid.length} → ${target.number}:`, e?.message || e);
        }

        // Delay antar target (kecuali target terakhir)
        if (i < valid.length - 1) {
            await sleep(DEFAULT_DELAY_MS);
        }
    }

    // Ringkasan akhir
    const lines = [
        `📊 *Blast selesai*`,
        ``,
        `✅ Berhasil : *${okList.length}*`,
        `❌ Gagal    : *${failList.length}*`
    ];

    if (okList.length) {
        lines.push(``, `*Berhasil:*`);
        okList.forEach((t, i) => lines.push(`${i + 1}. ${t.number} (${t.name})`));
    }

    if (failList.length) {
        lines.push(``, `*Gagal:*`);
        failList.forEach((f, i) =>
            lines.push(`${i + 1}. ${f.target.number} (${f.target.name}) — ${f.error}`)
        );
    }

    await sock.sendMessage(replyJid, { text: lines.join("\n") }, { quoted: message });
}

export default blast;