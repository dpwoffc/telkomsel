import settings from "./settings.js";
import menu from "./function/menu.js";
import send from "./function/send.js";
import blast from "./function/blast.js"
import { handleButton } from "./function/button.js";   // ← tambah

function normalizeNumber(value) {
    if (typeof value !== "string") return "";
    return value.split("@")[0].split(":")[0].replace(/\D/g, "");
}

function getSenderNumber(message) {
    if (message?.key?.fromMe) {
        const ownNumber = normalizeNumber(
            String(message?.botNumber || message?.botJid || "")
        );
        if (ownNumber) return ownNumber;
    }

    const candidates = [
        message?.senderNumber,
        message?.key?.participantAlt,
        message?.key?.remoteJidAlt,
        message?.key?.senderPn,
        message?.senderPn,
        message?.key?.participant,
        message?.key?.remoteJid
    ];

    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        const number = normalizeNumber(candidate);
        if (number) return number;
    }

    return "";
}

function getAllowedNumbers(botNumber) {
    const devNumber = normalizeNumber(String(settings.devNumber || ""));
    const botAccess = Array.isArray(settings.botAccess)
        ? settings.botAccess
        : [settings.botAccess];

    return new Set(
        [devNumber, ...botAccess, botNumber]
            .map((value) => normalizeNumber(String(value || "")))
            .filter(Boolean)
    );
}

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

function withFakeQuote(sock) {
    return new Proxy(sock, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === "sendMessage" && typeof value === "function") {
                return (jid, content, options = {}) => {
                    return Reflect.apply(value, target, [
                        jid,
                        content,
                        {
                            ...(options && typeof options === "object" ? options : {}),
                            quoted: makeFakeQuote()
                        }
                    ]);
                };
            }
            return typeof value === "function" ? value.bind(target) : value;
        }
    });
}

export async function handleMessage(sock, message, botNumber) {
    try {
        if (!message) return;
        const jid = message.key?.remoteJid;
        if (!jid || jid.endsWith("@newsletter")) return;

        // ──────────────────────────────────────────────
        // 1. TOMBOL DARI PELANGGAN — handle PALING AWAL
        //    (sebelum guard admin & sebelum cek "/")
        // ──────────────────────────────────────────────
        if (await handleButton(sock, message)) return;

        if (jid.endsWith("@g.us")) return;

        const senderNumber = getSenderNumber(message);
        const allowedNumbers = getAllowedNumbers(
            botNumber || message?.botNumber || message?.botJid
        );
        if (!senderNumber || !allowedNumbers.has(senderNumber)) return;

        const body = String(message.body || "").trim();
        if (!body.startsWith("/")) return;

        const args = body.slice(1).trim().split(/\s+/);
        const command = String(args.shift() || "").toLowerCase();
        if (!command) return;

        // menu pakai fakeQuote (branding @telkomsel),
        // send pakai sock asli agar notifikasi ✅ reply ke pesan admin.
        const botSock = withFakeQuote(sock);
        switch (command) {
            case "telkom":
                await menu(botSock, message);
            break;

            case "send":
                await send(sock, message, args);   
            break;

            case "blast":
                blast(sock, message, args).catch((e) => console.error("[BLAST]", e));
            break;
        }
    } catch (error) {
        console.error("[handleMessage]", error);
    }
}