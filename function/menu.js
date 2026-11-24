import settings from "../settings.js";
import { readFile } from "node:fs/promises";

const getSetting = (...keys) => {
    for (const key of keys) {
        if (settings?.[key] !== undefined && settings[key] !== null && settings[key] !== "")
            return settings[key];
    }
    return undefined;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

export async function menu(sock, message) {
    const jid = message?.key?.remoteJid;
    if (!sock || !jid) return console.error("[MENU] Socket/JID kosong.");

    const devNumber = String(
        getSetting("devNumber", "developerNumber", "ownerNumber") || ""
    ).replace(/\D/g, "");
    if (!devNumber) return console.error("[MENU] devNumber tidak ada.");

    const botName = getSetting("botName", "nameBot") || "GROUP SECURITY";
    const devName = getSetting("devName", "developerName") || "Developer";
    const prefix = String(getSetting("prefix") || "/");
    const pushName = message?.pushName || "Pengguna";
    const displayBotName = String(botName)

    const caption = [
        "╭━━━〔 " + "*" + displayBotName + "*" + " 〕━━━╮",
        "│",
        "│ Halo, " + "*" + pushName + "*" + " !",
        "│",
        "│ Bot pengiriman pesan Dismantling",
        "│",
        "├──〔 MENU BOT 〕",
        "│",
        "│ " + prefix + "menu",
        "│ " + prefix + "send <nomor>|<nama Pelanggan>",
        "│ " + prefix + "blast <nomor>|<nama Pelanggan>",
        "│ " + prefix + "help",
        "│ " + prefix + "dev", 
        "│ ",
        "│ Bot ini dibuat oleh " + "*" + devName + "*",
        "╰━━━━━━━━━━━━━━━━━━━━━━╯",
    ].join("\n");

    const buttons = [
        {
            name: "cta_url",
            buttonParamsJson: JSON.stringify(
                {
                    display_text: "GitHub",
                    url: "https://github.com/dpwofc"
                }
            )
        },
        {
            name: "cta_url",
            buttonParamsJson: JSON.stringify(
                {
                    display_text: "Business",
                    url: "https://business.dpwoffc.my.id"
                }
            )
        }
    ];

    const trySend = async (label, payload) => {
        try {
            await sock.sendMessage(jid, payload, { quoted: makeFakeQuote() });
            return true;
        } catch (e) {
            console.warn("[MENU] " + label + " gagal:", e?.message || e);
            return false;
        }
    };

    let gif = null;
    try {
        gif = await readFile(new URL("../media/menu.gif", import.meta.url));
    } catch (e) {
        console.warn("[MENU] menu.gif tidak ditemukan:", e?.message);
    }

    // GIF dikirim sebagai video GIF-style bersama tombol dalam interactiveMessage.
    if (gif && await trySend("interactiveMessage GIF + tombol", {
        interactiveMessage: {
            title: caption,
            footer: "*" + botName + " • Bot Menu" + "*",
            buttons,
            header: "",
            video: gif,
            gifPlayback: true
        }
    })) return;

    await sleep(1000);

    // Fallback gambar dengan tombol dalam satu interactiveMessage.
    let image = null;
    try {
        image = await readFile(new URL("../media/menu.jpg", import.meta.url));
    } catch (e) {
        console.warn("[MENU] menu.jpg tidak ditemukan:", e?.message);
    }

    if (image && await trySend("interactiveMessage gambar + tombol", {
        interactiveMessage: {
            title: caption,
            footer: "*" + botName + " • Bot Menu" + "*",
            buttons,
            header: "",
            image
        }
    })) return;

    await sleep(1000);

    // Fallback teks dengan tombol interactiveMessage.
    if (await trySend("interactiveMessage teks", {
        interactiveMessage: {
            title: caption,
            footer: "*" + botName + " • Bot Menu" + "*",
            buttons
        }
    })) return;

    // Fallback terakhir: teks biasa.
    try {
        await sock.sendMessage(jid, { text: caption }, { quoted: makeFakeQuote() });
    } catch (e) {
        console.error("[MENU] Gagal mengirim menu:", e?.message || e);
    }
}

export default menu;