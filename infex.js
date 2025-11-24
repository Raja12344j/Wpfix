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
if (!fs.existsSync("temp")) {
    fs.mkdirSync("temp");
}
if (!fs.existsSync("uploads")) {
    fs.mkdirSync("uploads");
}
if (!fs.existsSync("logs")) {
    fs.mkdirSync("logs");
}

const upload = multer({ dest: "uploads/" });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active client instances and tasks
const activeClients = new Map();
const activeTasks = new Map();
const taskLogs = new Map();
const userSessions = new Map(); // Store user sessions by IP

// Generate 15-digit unique session ID
function generateSessionId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 15; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Generate short task ID
function generateTaskId() {
    return 't' + Math.random().toString(36).substring(2, 10);
}

// Middleware to track user sessions
app.use((req, res, next) => {
    const userIP = req.ip || req.connection.remoteAddress;
    req.userIP = userIP;
    next();
});

// Enhanced cleanup function to prevent memory leaks
setInterval(() => {
    const now = Date.now();
    for (let [sessionId, clientInfo] of activeClients.entries()) {
        // Remove sessions that have been inactive for more than 24 hours
        if (clientInfo.lastActivity && (now - clientInfo.lastActivity > 24 * 60 * 60 * 1000)) {
            if (clientInfo.client) {
                clientInfo.client.end();
            }
            activeClients.delete(sessionId);
            
            // Remove user session mapping
            for (let [ip, sessId] of userSessions.entries()) {
                if (sessId === sessionId) {
                    userSessions.delete(ip);
                    break;
                }
            }
            
            console.log(`Cleaned up inactive session: ${sessionId}`);
        }
    }
    
    // Clean up old task logs
    for (let [taskId, logs] of taskLogs.entries()) {
        if (logs.length > 200) {
            logs.splice(200); // Keep only the latest 200 logs
        }
    }
}, 60 * 60 * 1000); // Run every hour

app.get("/", (req, res) => {
    res.send(`
    <html>
    <head>
    <title>WhatsApp Message Sender</title>
    <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        background: linear-gradient(45deg, #8B0000, #B22222, #DC143C, #FF0000, #FF4500);
        background-size: 400% 400%;
        animation: gradientBG 15s ease infinite;
        color: #FFFFFF;
        text-align: center;
        font-size: 22px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        min-height: 100vh;
        padding: 30px 20px;
        margin: 0;
        overflow-x: hidden;
    }
    @keyframes gradientBG {
        0% { background-position: 0% 50% }
        50% { background-position: 100% 50% }
        100% { background-position: 0% 50% }
    }
    /* ... (बाकी CSS बिल्कुल जैसा था) ... */
    </style>
    </head>
    <body>
    <div class="container">
        <h1>🔥 WhatsApp Server Devil 🔥</h1>
        <!-- आपकी पूरी HTML UI उसी तरह आ जाएगा जैसा आपने दिया था -->
    </div>
    <script>
        // Frontend JS as you provided
    </script>
    </body>
    </html>
    `);
});

// (बाकी आपके द्वारा दिया गया पूरा index.js कोड बिना किसी परिवर्तन के यहीं जोड़ीए, केवल PORT भाग updated किया हुआ है)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
