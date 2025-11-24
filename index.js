const express = require("express");
const fs = require("fs");
const path = require("path");
const pino = require("pino");
const multer = require("multer");
const {
    makeInMemoryStore,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion,
    makeWASocket,
    isJidBroadcast
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 5000;

// Create necessary directories
if (!fs.existsSync("temp")) fs.mkdirSync("temp");
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("logs")) fs.mkdirSync("logs");

const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const activeClients = new Map();
const activeTasks = new Map();
const taskLogs = new Map();
const userSessions = new Map();

function generateSessionId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 15; i++)
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
}

function generateTaskId() {
    return 't' + Math.random().toString(36).substring(2, 10);
}

app.use((req, res, next) => {
    req.userIP = req.ip || req.connection.remoteAddress;
    next();
});

setInterval(() => {
    const now = Date.now();
    for (const [sessionId, clientInfo] of activeClients.entries()) {
        if (clientInfo.lastActivity && (now - clientInfo.lastActivity > 24 * 60 * 60 * 1000)) {
            if (clientInfo.client) clientInfo.client.end();
            activeClients.delete(sessionId);
            for (const [ip, sessId] of userSessions.entries()) {
                if (sessId === sessionId) userSessions.delete(ip);
            }
            console.log(`Cleaned up inactive session: ${sessionId}`);
        }
    }
    for (const [taskId, logs] of taskLogs.entries()) {
        if (logs.length > 200) logs.splice(200);
    }
}, 60 * 60 * 1000);

app.get("/", (req, res) => {
    // Minimal working home page to avoid "Cannot GET /" error
    res.send(`
        <html>
        <head><title>WhatsApp Baileys Server</title></head>
        <body style="font-family: Arial, sans-serif; text-align:center; padding:30px;">
            <h1>WhatsApp Baileys Server is Running</h1>
            <p>Use the API endpoints or UI to interact with the server.</p>
        </body>
        </html>
    `);
});

// बाकी आपके बाकी API एंडपॉइंट्स और लॉजिक ऐसा ही रहेगा (उदाहरण को रोक दिया है क्योंकि लंबा है)

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
