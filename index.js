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
function generateSessionId(req) {
    return "session_" + Date.now().toString(36);
}
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
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    
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
    
    .container {
        max-width: 900px;
        margin: 0 auto;
        padding: 20px;
    }
    
    h1 {
        color: #FFD700;
        text-shadow: 0 0 20px #FF0000, 0 0 30px #FF4500;
        font-size: 42px;
        margin-bottom: 30px;
        background: rgba(0, 0, 0, 0.7);
        padding: 20px;
        border-radius: 15px;
        border: 3px solid #FFD700;
    }
    
    .box {
        background: rgba(0, 0, 0, 0.85);
        padding: 40px 30px;
        border-radius: 20px;
        margin: 30px auto;
        border: 3px solid #FF4500;
        box-shadow: 0 0 30px rgba(255, 69, 0, 0.6),
                    inset 0 0 20px rgba(139, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        width: 100%;
        max-width: 800px;
    }
    
    h2, h3 {
        color: #FFD700;
        text-shadow: 0 0 10px #FF0000;
        margin-bottom: 25px;
        font-size: 28px;
    }
    
    input, button, select, textarea {
        display: block;
        margin: 25px auto;
        padding: 20px;
        font-size: 22px;
        width: 95%;
        max-width: 600px;
        border-radius: 12px;
        border: 3px solid;
        background: rgba(20, 0, 0, 0.9);
        color: #FFFFFF;
        transition: all 0.4s ease;
        font-weight: bold;
    }
    
    input::placeholder, textarea::placeholder {
        color: #FFB6C1;
        font-style: italic;
    }
    
    /* Different border colors for each input box */
    input:nth-of-type(1) { border-color: #FF0000; }
    input:nth-of-type(2) { border-color: #FF4500; }
    input:nth-of-type(3) { border-color: #FF6347; }
    input:nth-of-type(4) { border-color: #FF7F50; }
    select { border-color: #FFA500; }
    textarea { border-color: #FFD700; }
    
    /* Focus animations with different colors */
    input:nth-of-type(1):focus { 
        border-color: #00FF00;
        box-shadow: 0 0 25px #00FF00;
        transform: scale(1.02);
    }
    input:nth-of-type(2):focus { 
        border-color: #00FFFF;
        box-shadow: 0 0 25px #00FFFF;
        transform: scale(1.02);
    }
    input:nth-of-type(3):focus { 
        border-color: #FF00FF;
        box-shadow: 0 0 25px #FF00FF;
        transform: scale(1.02);
    }
    input:nth-of-type(4):focus { 
        border-color: #FFFF00;
        box-shadow: 0 0 25px #FFFF00;
        transform: scale(1.02);
    }
    select:focus { 
        border-color: #00FF00;
        box-shadow: 0 0 25px #00FF00;
        transform: scale(1.02);
    }
    textarea:focus { 
        border-color: #00FFFF;
        box-shadow: 0 0 25px #00FFFF;
        transform: scale(1.02);
    }
    
    button {
        background: linear-gradient(45deg, #FF0000, #FF4500, #FF6347, #FF7F50);
        color: #FFFFFF;
        border: none;
        cursor: pointer;
        font-weight: bold;
        transition: all 0.4s ease;
        font-size: 24px;
        letter-spacing: 1.5px;
        margin-top: 35px;
        text-shadow: 0 0 5px #000000;
        border: 2px solid #FFD700;
    }
    
    button:hover {
        transform: translateY(-5px) scale(1.05);
        box-shadow: 0 10px 25px rgba(255, 0, 0, 0.8),
                    0 0 30px rgba(255, 215, 0, 0.6);
        background: linear-gradient(45deg, #FF7F50, #FF6347, #FF4500, #FF0000);
    }
    
    .instructions {
        text-align: left;
        max-width: 700px;
        margin: 30px auto;
        padding: 25px;
        background: rgba(139, 0, 0, 0.6);
        border-radius: 15px;
        border-left: 5px solid #FFD700;
        font-size: 20px;
        line-height: 1.6;
    }
    
    .instructions li {
        margin-bottom: 15px;
        padding-left: 10px;
    }
    
    .status-box {
        background: rgba(0, 0, 0, 0.9);
        padding: 30px;
        border-radius: 20px;
        margin: 25px auto;
        border: 3px solid #FF4500;
        text-align: center;
        max-width: 800px;
    }
    
    .status-item {
        margin: 20px 0;
        padding: 15px;
        border-bottom: 2px solid #FF0000;
        font-size: 22px;
    }
    
    a {
        color: #FFD700;
        text-decoration: none;
        font-weight: bold;
        font-size: 22px;
        display: inline-block;
        margin-top: 30px;
        padding: 15px 30px;
        border-radius: 10px;
        background: rgba(139, 0, 0, 0.8);
        border: 2px solid #FFD700;
        transition: all 0.3s ease;
    }
    
    a:hover {
        background: rgba(255, 215, 0, 0.3);
        text-decoration: none;
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.7);
        transform: scale(1.05);
    }
    
    .logs-container {
        max-height: 600px;
        overflow-y: auto;
        background: rgba(0, 0, 0, 0.8);
        padding: 20px;
        border-radius: 15px;
        margin: 25px 0;
        text-align: left;
        font-family: monospace;
        font-size: 18px;
        border: 2px solid #FF4500;
    }
    
    .log-entry {
        margin: 12px 0;
        padding: 12px;
        border-radius: 8px;
        border-left: 5px solid;
        font-size: 18px;
    }
    
    .log-success {
        border-left-color: #00FF00;
        background: rgba(0, 255, 0, 0.1);
        color: #90EE90;
    }
    
    .log-error {
        border-left-color: #FF0000;
        background: rgba(255, 0, 0, 0.1);
        color: #FFB6C1;
    }
    
    .log-info {
        border-left-color: #FFD700;
        background: rgba(255, 215, 0, 0.1);
        color: #FFFACD;
    }
    
    .group-list {
        max-height: 500px;
        overflow-y: auto;
        text-align: left;
        margin: 25px 0;
    }
    
    .group-item {
        padding: 20px;
        margin: 15px 0;
        background: rgba(139, 0, 0, 0.6);
        border-radius: 12px;
        border: 2px solid #FF4500;
        transition: all 0.3s ease;
    }
    
    .group-item:hover {
        transform: translateX(10px);
        box-shadow: 0 5px 15px rgba(255, 0, 0, 0.4);
    }
    
    .session-display {
        background: rgba(0, 0, 0, 0.9);
        padding: 25px;
        border-radius: 15px;
        margin-top: 25px;
        border: 3px solid #FFD700;
        animation: glow 2s infinite alternate;
        font-size: 20px;
    }
    
    @keyframes glow {
        from { box-shadow: 0 0 10px rgba(255, 215, 0, 0.5); }
        to { box-shadow: 0 0 30px rgba(255, 215, 0, 0.9), 
                         0 0 40px rgba(255, 215, 0, 0.6); }
    }
    
    .warning-message {
        background: rgba(255, 0, 0, 0.3);
        padding: 20px;
        border-radius: 10px;
        border: 2px solid #FF0000;
        margin: 20px 0;
        font-size: 20px;
        color: #FFB6C1;
    }
    
    /* Responsive design */
    @media (max-width: 768px) {
        body {
            font-size: 18px;
            padding: 15px 10px;
        }
        
        h1 {
            font-size: 32px;
            padding: 15px;
        }
        
        .box {
            padding: 25px 15px;
            margin: 20px auto;
        }
        
        input, button, select, textarea {
            font-size: 18px;
            padding: 15px;
            margin: 15px auto;
        }
        
        button {
            font-size: 20px;
        }
    }
    </style>
    </head>
    <body>
    <div class="container">
        <h1>🔥 WhatsApp Server Nobita 🔥</h1>
        
        <div class="warning-message">
            ⚠️ <strong>IMPORTANT:</strong> You must first pair your WhatsApp number before sending messages!
        </div>
        
        <div class="box">
            <h2>Step 1: Pair Your WhatsApp Number</h2>
            <form id="pairingForm">
                <input type="text" id="numberInput" name="number" placeholder="Enter Your WhatsApp Number (with country code)" required>
                <button type="button" onclick="generatePairingCode()">Generate Pairing Code</button>
            </form>
            <div id="pairingResult"></div>
        </div>

        <div class="box">  
            <h2>Step 2: Send Messages (After Pairing)</h2>
            <form action="/send-message" method="POST" enctype="multipart/form-data" id="messageForm">  
                <select name="targetType" required>  
                    <option value="">-- Select Target Type --</option>  
                    <option value="number">Target Number</option>  
                    <option value="group">Group UID</option>  
                </select>  
                <input type="text" name="target" placeholder="Enter Target Number / Group UID" required>  
                <input type="file" name="messageFile" accept=".txt" required>  
                <input type="text" name="prefix" placeholder="Enter Message Prefix (optional)">  
                <input type="number" name="delaySec" placeholder="Delay in Seconds (between messages)" min="1" required>  
                <button type="submit" id="sendButton" disabled>Start Sending Messages</button>  
            </form>  
            <div id="formMessage" style="margin-top: 15px;"></div>
        </div>  

        <div class="box">  
            <h2>Step 3: Manage Your Groups</h2>
            <button type="button" onclick="getMyGroups()" id="groupsButton" disabled>Show My Group UIDs</button>
            <div id="groupListDisplay" class="session-display" style="display:none;"></div>
        </div>

        <div class="box">  
            <h2>Step 4: Session Management</h2>
            <form action="/view-session" method="POST">  
                <input type="text" name="sessionId" placeholder="Enter Your Session ID to View Details" required>  
                <button type="submit">View Session Details</button>  
            </form>  
            <br>
            <form action="/stop-session" method="POST">  
                <input type="text" name="sessionId" placeholder="Enter Your Session ID to Stop" required>  
                <button type="submit" style="background:linear-gradient(45deg, #DC143C, #8B0000);">Stop My Session</button>  
            </form>  
        </div>

        <div class="instructions">
            <h3>📋 How to Use:</h3>
            <ol>
                <li><strong>Step 1:</strong> Enter your WhatsApp number and generate pairing code</li>
                <li><strong>Step 2:</strong> Open WhatsApp → Settings → Linked Devices → Link a Device</li>
                <li><strong>Step 3:</strong> Enter the pairing code shown above</li>
                <li><strong>Step 4:</strong> Once connected, you can start sending messages</li>
                <li><strong>Step 5:</strong> Save your Session ID for managing your tasks</li>
            </ol>
            <p><strong>Note:</strong> Each user must use their own WhatsApp number. You cannot use someone else's session.</p>
        </div>
    </div>

    <script>
        // Check if user has active session and enable/disable forms accordingly
        function checkSessionStatus() {
            const sessionId = localStorage.getItem('wa_session_id');
            const sendButton = document.getElementById('sendButton');
            const groupsButton = document.getElementById('groupsButton');
            const formMessage = document.getElementById('formMessage');
            
            if (sessionId) {
                sendButton.disabled = false;
                sendButton.innerHTML = 'Start Sending Messages';
                groupsButton.disabled = false;
                formMessage.innerHTML = '<span style="color:#00FF00;">✓ Session active. You can now send messages.</span>';
            } else {
                sendButton.disabled = true;
                sendButton.innerHTML = 'Please Pair Your Number First';
                groupsButton.disabled = true;
                formMessage.innerHTML = '<span style="color:#FF0000;">✗ Please complete Step 1 first.</span>';
            }
        }
        
        // Check session status on page load
        window.onload = function() {
            checkSessionStatus();
            // Check every 5 seconds if session becomes active
            setInterval(checkSessionStatus, 5000);
        };
        
        async function generatePairingCode() {
            const number = document.getElementById('numberInput').value;
            if (!number) {
                alert('Please enter a valid WhatsApp number');
                return;
            }
            
            const button = document.querySelector('#pairingForm button');
            button.disabled = true;
            button.innerHTML = 'Generating Code...';
            
            try {
                const response = await fetch('/code?number=' + encodeURIComponent(number));
                const result = await response.text();
                document.getElementById('pairingResult').innerHTML = result;
                
                // Start checking for session activation
                setTimeout(checkSessionStatus, 2000);
            } catch (error) {
                alert('Error generating pairing code: ' + error.message);
            } finally {
                button.disabled = false;
                button.innerHTML = 'Generate Pairing Code';
            }
        }
        
        async function getMyGroups() {
            const button = document.getElementById('groupsButton');
            const originalText = button.innerHTML;
            button.disabled = true;
            button.innerHTML = 'Loading Groups...';
            
            try {
                const response = await fetch('/get-groups');
                const result = await response.text();
                const displayDiv = document.getElementById('groupListDisplay');
                displayDiv.innerHTML = result;
                displayDiv.style.display = 'block';
            } catch (error) {
                alert('Error loading groups: ' + error.message);
            } finally {
                button.disabled = false;
                button.innerHTML = originalText;
            }
        }
        
        // Prevent form submission if not paired
        document.getElementById('messageForm').addEventListener('submit', function(e) {
            if (document.getElementById('sendButton').disabled) {
                e.preventDefault();
                alert('Please complete Step 1: Pair your WhatsApp number first!');
                return false;
            }
        });
    </script>
    </body>  
    </html>
    `);
});

app.get("/code", async (req, res) => {
    const num = req.query.number.replace(/[^0-9]/g, "");
    const userIP = req.userIP;
    
    // Check if user already has an active session
    if (userSessions.has(userIP)) {
        const existingSessionId = userSessions.get(userIP);
        return res.send(`  
            <div style="padding: 25px; background: rgba(255, 0, 0, 0.2); border-radius: 15px; border: 2px solid #FF0000;">
                <h2 style="color: #FFB6C1;">⚠️ Session Already Active</h2>  
                <p style="font-size: 20px; margin: 15px 0;">You already have an active session with this IP address.</p>
                <p style="font-size: 18px;"><strong>Your Session ID: ${existingSessionId}</strong></p>
                <p style="font-size: 16px; margin-top: 15px;">Use this Session ID to manage your message sending tasks.</p>
                <a href="/" style="display:inline-block; margin-top:20px; padding:12px 25px; background:#FF4500; color:white; text-decoration:none; border-radius:8px;">Go Back to Home</a>  
            </div>  
        `);
    }

    const sessionId = generateSessionId();
    const sessionPath = path.join("temp", sessionId);

    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(sessionPath, { recursive: true });
    }

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        
        const waClient = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }).child({ level: "fatal" }),
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid: jid => isJidBroadcast(jid),
            getMessage: async key => {
                return {}
            }
        });

        if (!waClient.authState.creds.registered) {
            await delay(1500);
            
            const phoneNumber = num.replace(/[^0-9]/g, "");
            const code = await waClient.requestPairingCode(phoneNumber);
            
            // Store session with user IP
            activeClients.set(sessionId, {  
                client: waClient,  
                number: num,  
                authPath: sessionPath,
                isConnected: false,
                tasks: [],
                lastActivity: Date.now(),
                userIP: userIP
            });  
            
            // Store user session mapping
            userSessions.set(userIP, sessionId);

            res.send(`  
                <div style="margin-top: 20px; padding: 30px; background: rgba(0, 100, 0, 0.3); border-radius: 15px; border: 2px solid #00FF00;">
                    <h2 style="color: #00FF00; text-shadow: 0 0 10px #00FF00;">✅ Pairing Code Generated Successfully!</h2>  
                    <div style="background: rgba(0, 0, 0, 0.8); padding: 25px; border-radius: 12px; margin: 20px 0; border: 3px solid #FFD700;">
                        <h3 style="color: #FFD700; font-size: 32px; margin: 15px 0;">Pairing Code: ${code}</h3>  
                    </div>
                    <div style="background: rgba(0, 0, 0, 0.6); padding: 20px; border-radius: 10px; margin: 20px 0;">
                        <p style="font-size: 20px; margin-bottom: 15px;"><strong>📱 To pair your device:</strong></p>
                        <ol style="text-align: left; font-size: 18px; padding-left: 30px;">
                            <li style="margin-bottom: 10px;">Open WhatsApp on your phone</li>
                            <li style="margin-bottom: 10px;">Go to <strong>Settings → Linked Devices → Link a Device</strong></li>
                            <li style="margin-bottom: 10px;">Enter the pairing code shown above when prompted</li>
                            <li style="margin-bottom: 10px;">Wait for connection confirmation</li>
                            <li>After pairing, you can start sending messages</li>
                        </ol>
                    </div>
                    <div style="background: rgba(255, 215, 0, 0.2); padding: 20px; border-radius: 10px; margin: 20px 0; border: 2px solid #FFD700;">
                        <p style="font-size: 18px; color: #FFD700;"><strong>🔑 Your Session ID: ${sessionId}</strong></p>
                        <p style="font-size: 16px; margin-top: 10px;">Save this Session ID carefully! You'll need it to manage your tasks.</p>
                    </div>
                    <script>
                        localStorage.setItem('wa_session_id', '${sessionId}');
                        setTimeout(() => {
                            // Enable the send message button after pairing
                            const event = new Event('sessionUpdated');
                            window.dispatchEvent(event);
                        }, 1000);
                    </script>
                    <a href="/" style="display:inline-block; margin-top:20px; padding:15px 30px; background:#FF4500; color:white; text-decoration:none; border-radius:10px; font-size:18px;">Go Back to Home</a>  
                </div>  
            `);  
        }  

        waClient.ev.on("creds.update", saveCreds);  
        waClient.ev.on("connection.update", async (s) => {  
            const { connection, lastDisconnect } = s;  
            if (connection === "open") {  
                console.log(`WhatsApp Connected for ${num}! Session ID: ${sessionId}`);  
                const clientInfo = activeClients.get(sessionId);
                if (clientInfo) {
                    clientInfo.isConnected = true;
                    clientInfo.lastActivity = Date.now();
                }
            } else if (connection === "close") {
                const clientInfo = activeClients.get(sessionId);
                if (clientInfo) {
                    clientInfo.isConnected = false;
                    console.log(`Connection closed for Session ID: ${sessionId}`);
                    
                    // Try to reconnect if not manually stopped
                    if (lastDisconnect?.error?.output?.statusCode !== 401) {
                        console.log(`Attempting to reconnect for Session ID: ${sessionId}...`);
                        await delay(10000);
                        initializeClient(sessionId, num, sessionPath, userIP);
                    }
                }
            }  
        });

    } catch (err) {
        console.error("Error in pairing:", err);
        res.send(`<div style="padding: 25px; background: rgba(255, 0, 0, 0.3); border-radius: 15px; border: 2px solid #FF0000;">
                    <h2 style="color: #FFB6C1;">❌ Error: ${err.message}</h2>
                    <p style="margin: 15px 0; font-size: 18px;">Please try again with a valid WhatsApp number.</p>
                    <a href="/" style="display:inline-block; margin-top:15px; padding:12px 25px; background:#FF4500; color:white; text-decoration:none; border-radius:8px;">Go Back</a>
                  </div>`);
    }
});

async function initializeClient(sessionId, num, sessionPath, userIP) {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        const { version } = await fetchLatestBaileysVersion();
        
        const waClient = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" }))
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }).child({ level: "fatal" }),
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false
        });

        const clientInfo = activeClients.get(sessionId) || {
            number: num,
            authPath: sessionPath,
            tasks: [],
            lastActivity: Date.now(),
            userIP: userIP
        };
        
        clientInfo.client = waClient;
        activeClients.set(sessionId, clientInfo);

        waClient.ev.on("creds.update", saveCreds);  
        waClient.ev.on("connection.update", async (s) => {  
            const { connection, lastDisconnect } = s;  
            if (connection === "open") {  
                console.log(`Reconnected successfully for Session ID: ${sessionId}`);  
                clientInfo.isConnected = true;
                clientInfo.lastActivity = Date.now();
                
                // Resume any paused tasks
                if (clientInfo.tasks && clientInfo.tasks.length > 0) {
                    clientInfo.tasks.forEach(task => {
                        if (task.isSending && !task.stopRequested) {
                            console.log(`Resuming task ${task.taskId} for session ${sessionId}`);
                            const messages = task.messages || [];
                            if (messages.length > 0) {
                                sendMessagesLoop(
                                    sessionId, 
                                    task.taskId, 
                                    messages, 
                                    waClient, 
                                    task.target, 
                                    task.targetType, 
                                    task.delaySec, 
                                    task.prefix, 
                                    clientInfo.number
                                );
                            }
                        }
                    });
                }
            } else if (connection === "close") {
                clientInfo.isConnected = false;
                console.log(`Connection closed again for Session ID: ${sessionId}`);
                
                if (lastDisconnect?.error?.output?.statusCode !== 401) {
                    console.log(`Reconnecting again for Session ID: ${sessionId}...`);
                    await delay(10000);
                    initializeClient(sessionId, num, sessionPath, userIP);
                }
            }  
        });

    } catch (err) {
        console.error(`Reconnection failed for Session ID: ${sessionId}`, err);
        // Try again after a delay
        setTimeout(() => initializeClient(sessionId, num, sessionPath, userIP), 30000);
    }
}

app.post("/send-message", upload.single("messageFile"), async (req, res) => {
    const { target, targetType, delaySec, prefix } = req.body;
    const userIP = req.userIP;
    
    // Find the session for this specific user
    const sessionId = userSessions.get(userIP);
    if (!sessionId || !activeClients.has(sessionId)) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: No active WhatsApp session found!</h2>
                        <p style="font-size:20px; margin:15px 0;">Please complete Step 1: Generate pairing code with your WhatsApp number first.</p>
                        <a href="/">Go Back to Home</a></div>`);
    }

    const clientInfo = activeClients.get(sessionId);
    
    // Additional security check: Verify the session belongs to this IP
    if (clientInfo.userIP !== userIP) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Security Error: Session IP mismatch!</h2>
                        <p style="font-size:20px;">You cannot use someone else's session.</p>
                        <a href="/">Go Back to Home</a></div>`);
    }

    const { client: waClient, number: senderNumber } = clientInfo;
    const filePath = req.file?.path;

    if (!target || !filePath || !targetType || !delaySec) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Missing required fields</h2><a href="/">Go Back</a></div>`);
    }

    // Check if client is connected
    if (!clientInfo.isConnected) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: WhatsApp not connected!</h2>
                        <p style="font-size:20px;">Please make sure your WhatsApp is properly paired and connected.</p>
                        <a href="/">Go Back to Home</a></div>`);
    }

    try {
        const messages = fs.readFileSync(filePath, "utf-8").split("\n").filter(msg => msg.trim() !== "");
        
        if (messages.length === 0) {
            return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Message file is empty</h2><a href="/">Go Back</a></div>`);
        }

        // Create a task ID for this specific sending task
        const taskId = generateTaskId();
        
        // Store task information under the session
        const taskInfo = {
            taskId,
            target,
            targetType,
            messages, // Store messages for reconnection
            delaySec: parseInt(delaySec),
            prefix,
            isSending: true,
            stopRequested: false,
            totalMessages: messages.length,
            sentMessages: 0,
            currentMessageIndex: 0,
            startTime: new Date(),
            logs: []
        };
        
        // Add task to session
        if (!clientInfo.tasks) clientInfo.tasks = [];
        clientInfo.tasks.push(taskInfo);
        clientInfo.lastActivity = Date.now();
        
        // Initialize logs for this task
        taskLogs.set(taskId, []);
        
        // Redirect to session status page
        res.send(`<script>
                    localStorage.setItem('wa_session_id', '${sessionId}');
                    window.location.href = '/session-status?sessionId=${sessionId}';
                  </script>`);
        
        // Start sending messages in the background
        sendMessagesLoop(sessionId, taskId, messages, waClient, target, targetType, delaySec, prefix, senderNumber);

    } catch (error) {
        console.error(`[${sessionId}] Error:`, error);
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: ${error.message}</h2><a href="/">Go Back</a></div>`);
    }
});

async function sendMessagesLoop(sessionId, taskId, messages, waClient, target, targetType, delaySec, prefix, senderNumber) {
    const clientInfo = activeClients.get(sessionId);
    if (!clientInfo) return;
    
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    if (!taskInfo) return;
    
    const logs = taskLogs.get(taskId) || [];
    
    try {
        let index = taskInfo.currentMessageIndex;
        const recipient = targetType === "group" ? target + "@g.us" : target + "@s.whatsapp.net";
        
        while (taskInfo.isSending && !taskInfo.stopRequested) {
            // Check if client is connected
            if (!clientInfo.isConnected) {
                const waitingLog = {
                    type: "info",
                    message: `⏳ Waiting for connection to be restored...`,
                    details: `Connection lost, pausing message sending`,
                    timestamp: new Date().toLocaleString('en-US', { hour12: true })
                };
                
                logs.unshift(waitingLog);
                if (logs.length > 100) logs.pop();
                taskLogs.set(taskId, logs);
                
                console.log(`[${sessionId}] Connection lost, pausing task ${taskId}`);
                await delay(10000); // Wait 10 seconds before checking again
                continue;
            }
            
            let msg = messages[index];
            if (prefix && prefix.trim() !== "") {
                msg = `${prefix.trim()} ${msg}`;
            }
            
            const timestamp = new Date().toLocaleString('en-US', { hour12: true });
            const messageNumber = taskInfo.sentMessages + 1;
            
            try {
                await waClient.sendMessage(recipient, { text: msg });
                
                // Log success with real timestamp
                const successLog = {
                    type: "success",
                    message: `✅ Message #${messageNumber} sent successfully at ${timestamp}`,
                    details: `From: ${senderNumber} | To: ${target} | Message: "${msg.substring(0, 50)}${msg.length > 50 ? '...' : ''}"`,
                    timestamp: timestamp
                };
                
                logs.unshift(successLog);
                if (logs.length > 100) logs.pop();
                taskLogs.set(taskId, logs);
                
                console.log(`[${sessionId}] Sent message #${messageNumber} from ${senderNumber} to ${target}`);
                
                taskInfo.sentMessages++;
                index = (index + 1) % messages.length; // Loop back to start when reaching end
                taskInfo.currentMessageIndex = index;
                clientInfo.lastActivity = Date.now();
                
            } catch (sendError) {
                // Log error with real timestamp
                const errorLog = {
                    type: "error",
                    message: `❌ Failed to send message #${messageNumber} at ${timestamp}`,
                    details: `Error: ${sendError.message}`,
                    timestamp: timestamp
                };
                
                logs.unshift(errorLog);
                if (logs.length > 100) logs.pop();
                taskLogs.set(taskId, logs);
                
                console.error(`[${sessionId}] Error sending message:`, sendError);
                
                // If it's a connection error, mark as disconnected and wait for reconnect
                if (sendError.message.includes("connection") || sendError.message.includes("socket") || 
                    sendError.message.includes("timeout") || sendError.message.includes("not connected")) {
                    clientInfo.isConnected = false;
                    console.log(`Connection issue detected for session ${sessionId}, waiting for reconnect...`);
                    await delay(5000);
                    continue;
                }
                
                // For other errors, wait a bit before retrying
                await delay(5000);
            }
            
            await delay(delaySec * 1000);
        }
        
        // Update task status when done
        taskInfo.endTime = new Date();
        taskInfo.isSending = false;
        
        // Log completion with real timestamp
        const completionLog = {
            type: "info",
            message: `📋 Task ${taskInfo.stopRequested ? 'stopped' : 'completed'} at ${new Date().toLocaleString('en-US', { hour12: true })}`,
            details: `Total messages sent: ${taskInfo.sentMessages}`,
            timestamp: new Date().toLocaleString('en-US', { hour12: true })
        };
        
        logs.unshift(completionLog);
        taskLogs.set(taskId, logs);
        
    } catch (error) {
        console.error(`[${sessionId}] Error in message loop:`, error);
        
        const errorLog = {
            type: "error",
            message: `💥 Critical error in task execution at ${new Date().toLocaleString('en-US', { hour12: true })}`,
            details: `Error: ${error.message}`,
            timestamp: new Date().toLocaleString('en-US', { hour12: true })
        };
        
        logs.unshift(errorLog);
        taskLogs.set(taskId, logs);
        
        taskInfo.error = error.message;
        taskInfo.isSending = false;
        taskInfo.endTime = new Date();
    }
}

app.get("/session-status", (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId || !activeClients.has(sessionId)) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Invalid Session ID</h2><a href="/">Go Back</a></div>`);
    }

    const clientInfo = activeClients.get(sessionId);
    
    res.send(`
        <html>
        <head>
            <title>Session Status - ${sessionId}</title>
            <style>
                body { 
                    background: linear-gradient(45deg, #8B0000, #B22222, #DC143C, #FF0000, #FF4500);
                    background-size: 400% 400%;
                    animation: gradientBG 15s ease infinite;
                    color: #FFFFFF;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    text-align: center;
                    padding: 30px 20px;
                    margin: 0;
                }
                
                @keyframes gradientBG {
                    0% { background-position: 0% 50% }
                    50% { background-position: 100% 50% }
                    100% { background-position: 0% 50% }
                }
                
                .container {
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                .status-box {
                    background: rgba(0, 0, 0, 0.9);
                    padding: 35px;
                    border-radius: 20px;
                    margin: 25px auto;
                    border: 3px solid #FF4500;
                    text-align: center;
                    box-shadow: 0 0 30px rgba(255, 69, 0, 0.6);
                }
                
                h1 {
                    color: #FFD700;
                    text-shadow: 0 0 15px rgba(255, 215, 0, 0.7);
                    font-size: 36px;
                    margin-bottom: 25px;
                }
                
                .session-id {
                    font-size: 26px;
                    background: rgba(30, 0, 0, 0.8);
                    padding: 20px;
                    border-radius: 12px;
                    display: inline-block;
                    margin: 20px 0;
                    border: 2px solid #FFD700;
                    color: #FFD700;
                }
                
                .status-item {
                    margin: 20px 0;
                    font-size: 22px;
                    padding: 15px;
                    border-bottom: 2px solid #FF0000;
                }
                
                .status-value {
                    font-weight: bold;
                    color: #00FF00;
                }
                
                .status-error {
                    color: #FF5555;
                }
                
                a {
                    display: inline-block;
                    margin-top: 30px;
                    padding: 15px 35px;
                    background: linear-gradient(to right, #FF4500, #FF0000);
                    color: #FFFFFF;
                    text-decoration: none;
                    font-weight: bold;
                    border-radius: 10px;
                    font-size: 20px;
                    border: 2px solid #FFD700;
                }
                
                .task-list {
                    margin: 35px 0;
                    text-align: left;
                }
                
                .task-item {
                    background: rgba(30, 0, 0, 0.8);
                    padding: 25px;
                    border-radius: 15px;
                    margin: 20px 0;
                    border: 2px solid #FF4500;
                }
                
                .task-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                
                .task-title {
                    font-size: 22px;
                    font-weight: bold;
                    color: #FFD700;
                }
                
                .task-status {
                    padding: 8px 15px;
                    border-radius: 8px;
                    font-size: 16px;
                    font-weight: bold;
                }
                
                .status-running {
                    background: rgba(0, 255, 0, 0.2);
                    color: #00FF00;
                    border: 1px solid #00FF00;
                }
                
                .status-stopped {
                    background: rgba(255, 0, 0, 0.2);
                    color: #FF0000;
                    border: 1px solid #FF0000;
                }
                
                .status-completed {
                    background: rgba(255, 215, 0, 0.2);
                    color: #FFD700;
                    border: 1px solid #FFD700;
                }
                
                .task-details {
                    margin: 15px 0;
                    font-size: 18px;
                }
                
                .task-action {
                    margin-top: 20px;
                }
                
                .logs-container {
                    max-height: 500px;
                    overflow-y: auto;
                    background: rgba(0, 0, 0, 0.8);
                    padding: 20px;
                    border-radius: 12px;
                    margin: 25px 0;
                    text-align: left;
                    font-family: monospace;
                    font-size: 16px;
                    border: 2px solid #FF4500;
                }
                
                .log-entry {
                    margin: 10px 0;
                    padding: 12px;
                    border-radius: 8px;
                    border-left: 5px solid;
                    font-size: 16px;
                }
                
                .log-success {
                    border-left-color: #00FF00;
                    background: rgba(0, 255, 0, 0.1);
                    color: #90EE90;
                }
                
                .log-error {
                    border-left-color: #FF0000;
                    background: rgba(255, 0, 0, 0.1);
                    color: #FFB6C1;
                }
                
                .log-info {
                    border-left-color: #FFD700;
                    background: rgba(255, 215, 0, 0.1);
                    color: #FFFACD;
                }
                
                .auto-refresh {
                    margin: 20px 0;
                    font-size: 18px;
                    color: #FFD700;
                }
                
                button {
                    padding: 10px 20px;
                    margin: 5px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    font-weight: bold;
                    transition: all 0.3s;
                }
                
                .view-logs-btn {
                    background: #FFA500;
                    color: #000;
                }
                
                .stop-task-btn {
                    background: #FF0000;
                    color: #FFF;
                }
            </style>
            <script>
                function refreshPage() {
                    location.reload();
                }
                
                function viewTaskLogs(taskId) {
                    window.location.href = '/task-logs?sessionId=${sessionId}&taskId=' + taskId;
                }
                
                function stopTask(taskId) {
                    if (confirm('Are you sure you want to stop this task?')) {
                        const form = document.createElement('form');
                        form.method = 'POST';
                        form.action = '/stop-task';
                        
                        const sessionInput = document.createElement('input');
                        sessionInput.type = 'hidden';
                        sessionInput.name = 'sessionId';
                        sessionInput.value = '${sessionId}';
                        form.appendChild(sessionInput);
                        
                        const taskInput = document.createElement('input');
                        taskInput.type = 'hidden';
                        taskInput.name = 'taskId';
                        taskInput.value = taskId;
                        form.appendChild(taskInput);
                        
                        document.body.appendChild(form);
                        form.submit();
                    }
                }
                
                // Auto-refresh every 10 seconds if any task is still running
                ${clientInfo.tasks && clientInfo.tasks.some(t => t.isSending) ? 'setTimeout(refreshPage, 10000);' : ''}
            </script>
        </head>
        <body>
            <div class="container">
                <h1>📊 Session Status</h1>
                
                <div class="status-box">
                    <div class="session-id">Your Session ID: ${sessionId}</div>
                    
                    <div class="status-item">
                        🔗 Connection Status: <span class="status-value ${clientInfo.isConnected ? '' : 'status-error'}">${clientInfo.isConnected ? '✅ CONNECTED' : '❌ DISCONNECTED - Attempting to reconnect...'}</span>
                    </div>
                    
                    <div class="status-item">
                        📱 WhatsApp Number: <span class="status-value">${clientInfo.number}</span>
                    </div>
                    
                    <div class="status-item">
                        👤 Your IP: <span class="status-value">${clientInfo.userIP}</span>
                    </div>
                    
                    ${clientInfo.tasks && clientInfo.tasks.length > 0 ? `
                        <h2 style="color: #FFD700; margin-top: 30px;">Active Tasks</h2>
                        <div class="task-list">
                            ${clientInfo.tasks.map(task => `
                                <div class="task-item">
                                    <div class="task-header">
                                        <div class="task-title">🎯 Task: ${task.target} (${task.targetType})</div>
                                        <div class="task-status status-${task.isSending ? 'running' : task.stopRequested ? 'stopped' : 'completed'}">
                                            ${task.isSending ? '🟢 RUNNING' : task.stopRequested ? '🔴 STOPPED' : '🟡 COMPLETED'}
                                        </div>
                                    </div>
                                    <div class="task-details">
                                        <div>📨 Messages Sent: ${task.sentMessages} of ${task.totalMessages}</div>
                                        <div>⏰ Start Time: ${task.startTime.toLocaleString('en-US', { hour12: true })}</div>
                                        ${task.endTime ? `<div>⏹️ End Time: ${task.endTime.toLocaleString('en-US', { hour12: true })}</div>` : ''}
                                        ${task.error ? `<div class="status-error">❌ Error: ${task.error}</div>` : ''}
                                    </div>
                                    <div class="task-action">
                                        <button class="view-logs-btn" onclick="viewTaskLogs('${task.taskId}')">View Logs</button>
                                        ${task.isSending ? `<button class="stop-task-btn" onclick="stopTask('${task.taskId}')">Stop Task</button>` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p style="font-size: 20px; margin: 30px 0;">No active tasks found for this session.</p>'}
                    
                    <div class="auto-refresh">
                        ${clientInfo.tasks && clientInfo.tasks.some(t => t.isSending) ? '🔄 Page will auto-refresh every 10 seconds' : ''}
                    </div>
                </div>
                
                <a href="/">← Return to Home</a>
            </div>
        </body>
        </html>
    `);
});

app.get("/task-logs", (req, res) => {
    const { sessionId, taskId } = req.query;
    if (!sessionId || !activeClients.has(sessionId) || !taskLogs.has(taskId)) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Invalid Session or Task ID</h2><a href="/">Go Back</a></div>`);
    }

    const logs = taskLogs.get(taskId) || [];
    const clientInfo = activeClients.get(sessionId);
    const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
    
    if (!taskInfo) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Task not found</h2><a href="/">Go Back</a></div>`);
    }
    
    let logsHtml = '';
    logs.forEach(log => {
        const logClass = `log-${log.type}`;
        logsHtml += `<div class="log-entry ${logClass}">`;
        logsHtml += `<div><strong>${log.message}</strong></div>`;
        logsHtml += `<div>${log.details}</div>`;
        logsHtml += `<div style="font-size: 14px; color: #888; margin-top: 5px;">Time: ${log.timestamp}</div>`;
        logsHtml += '</div>';
    });
    
    if (logs.length === 0) {
        logsHtml = '<div class="log-entry log-info">No logs yet. Messages will start sending shortly...</div>';
    }
    
    res.send(`
        <html>
        <head>
            <title>Task Logs - ${taskId}</title>
            <style>
                body { 
                    background: linear-gradient(45deg, #8B0000, #B22222, #DC143C, #FF0000, #FF4500);
                    background-size: 400% 400%;
                    animation: gradientBG 15s ease infinite;
                    color: #FFFFFF;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    text-align: center;
                    padding: 30px 20px;
                    margin: 0;
                }
                
                @keyframes gradientBG {
                    0% { background-position: 0% 50% }
                    50% { background-position: 100% 50% }
                    100% { background-position: 0% 50% }
                }
                
                .container {
                    max-width: 1000px;
                    margin: 0 auto;
                    padding: 20px;
                }
                
                .status-box {
                    background: rgba(0, 0, 0, 0.9);
                    padding: 30px;
                    border-radius: 20px;
                    margin: 25px auto;
                    border: 3px solid #FF4500;
                    text-align: center;
                    box-shadow: 0 0 30px rgba(255, 69, 0, 0.6);
                }
                
                h1 {
                    color: #FFD700;
                    text-shadow: 0 0 15px rgba(255, 215, 0, 0.7);
                    font-size: 32px;
                    margin-bottom: 25px;
                }
                
                .task-id {
                    font-size: 24px;
                    background: rgba(30, 0, 0, 0.8);
                    padding: 20px;
                    border-radius: 12px;
                    display: inline-block;
                    margin: 20px 0;
                    border: 2px solid #FFD700;
                    color: #FFD700;
                }
                
                .status-item {
                    margin: 20px 0;
                    font-size: 20px;
                    padding: 15px;
                    border-bottom: 1px solid #FF0000;
                }
                
                .status-value {
                    font-weight: bold;
                    color: #00FF00;
                }
                
                a {
                    display: inline-block;
                    margin-top: 30px;
                    padding: 15px 35px;
                    background: linear-gradient(to right, #FF4500, #FF0000);
                    color: #FFFFFF;
                    text-decoration: none;
                    font-weight: bold;
                    border-radius: 10px;
                    font-size: 20px;
                    border: 2px solid #FFD700;
                }
                
                .logs-container {
                    max-height: 600px;
                    overflow-y: auto;
                    background: rgba(0, 0, 0, 0.8);
                    padding: 25px;
                    border-radius: 15px;
                    margin: 25px 0;
                    text-align: left;
                    font-family: monospace;
                    font-size: 16px;
                    border: 2px solid #FF4500;
                }
                
                .log-entry {
                    margin: 12px 0;
                    padding: 15px;
                    border-radius: 10px;
                    border-left: 5px solid;
                    font-size: 16px;
                }
                
                .log-success {
                    border-left-color: #00FF00;
                    background: rgba(0, 255, 0, 0.1);
                    color: #90EE90;
                }
                
                .log-error {
                    border-left-color: #FF0000;
                    background: rgba(255, 0, 0, 0.1);
                    color: #FFB6C1;
                }
                
                .log-info {
                    border-left-color: #FFD700;
                    background: rgba(255, 215, 0, 0.1);
                    color: #FFFACD;
                }
                
                .auto-refresh {
                    margin: 20px 0;
                    font-size: 18px;
                    color: #FFD700;
                }
            </style>
            <script>
                function refreshPage() {
                    location.reload();
                }
                
                // Auto-refresh every 10 seconds if task is still running
                ${taskInfo.isSending ? 'setTimeout(refreshPage, 10000);' : ''}
                
                // Scroll to top of logs container (newest logs are at the top)
                window.onload = function() {
                    const logsContainer = document.querySelector('.logs-container');
                    if (logsContainer) {
                        logsContainer.scrollTop = 0;
                    }
                };
            </script>
        </head>
        <body>
            <div class="container">
                <h1>📋 Task Logs</h1>
                
                <div class="status-box">
                    <div class="task-id">Task ID: ${taskId}</div>
                    
                    <div class="status-item">
                        📊 Status: <span class="status-value">${taskInfo.isSending ? '🟢 RUNNING' : taskInfo.stopRequested ? '🔴 STOPPED' : '🟡 COMPLETED'}</span>
                    </div>
                    
                    <div class="status-item">
                        🎯 Target: <span class="status-value">${taskInfo.target} (${taskInfo.targetType})</span>
                    </div>
                    
                    <div class="status-item">
                        📨 Messages Sent: <span class="status-value">${taskInfo.sentMessages} of ${taskInfo.totalMessages}</span>
                    </div>
                    
                    <div class="status-item">
                        ⏰ Start Time: <span class="status-value">${taskInfo.startTime.toLocaleString('en-US', { hour12: true })}</span>
                    </div>
                    
                    ${taskInfo.endTime ? '<div class="status-item">⏹️ End Time: <span class="status-value">' + taskInfo.endTime.toLocaleString('en-US', { hour12: true }) + '</span></div>' : ''}
                    
                    ${taskInfo.error ? '<div class="status-item" style="color:#FF0000;">❌ Error: ' + taskInfo.error + '</div>' : ''}
                    
                    <div class="auto-refresh">
                        ${taskInfo.isSending ? '🔄 Page will auto-refresh every 10 seconds' : ''}
                    </div>
                </div>
                
                <div class="status-box">
                    <h2 style="color: #FFD700;">Live Logs (Newest First)</h2>
                    <div class="logs-container">
                        ${logsHtml}
                    </div>
                </div>
                
                <a href="/session-status?sessionId=${sessionId}">← Return to Session Status</a>
            </div>
        </body>
        </html>
    `);
});

app.post("/view-session", (req, res) => {
    const { sessionId } = req.body;
    res.redirect(`/session-status?sessionId=${sessionId}`);
});

app.post("/stop-session", async (req, res) => {
    const { sessionId } = req.body;
    const userIP = req.userIP;

    if (!activeClients.has(sessionId)) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Invalid Session ID</h2><a href="/">Go Back</a></div>`);
    }

    try {
        const clientInfo = activeClients.get(sessionId);
        
        // Security check: Only allow the user who owns the session to stop it
        if (clientInfo.userIP !== userIP) {
            return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Security Error: You cannot stop someone else's session!</h2><a href="/">Go Back</a></div>`);
        }
        
        // Stop all tasks in this session
        if (clientInfo.tasks) {
            clientInfo.tasks.forEach(task => {
                task.stopRequested = true;
                task.isSending = false;
                task.endTime = new Date();
            });
        }
        
        // Close the WhatsApp connection
        if (clientInfo.client) {
            clientInfo.client.end();
        }
        
        // Remove from active clients
        activeClients.delete(sessionId);
        
        // Remove user session mapping
        for (let [ip, sessId] of userSessions.entries()) {
            if (sessId === sessionId) {
                userSessions.delete(ip);
                break;
            }
        }
        
        // Clear localStorage
        res.send(`<script>
                    localStorage.removeItem('wa_session_id');
                    alert('Session ${sessionId} stopped successfully!');
                    window.location.href = '/';
                  </script>`);

    } catch (error) {
        console.error(`Error stopping session ${sessionId}:`, error);
        res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error stopping session</h2><p>${error.message}</p><a href="/">Go Back</a></div>`);
    }
});

app.post("/stop-task", async (req, res) => {
    const { sessionId, taskId } = req.body;
    const userIP = req.userIP;

    if (!activeClients.has(sessionId)) {
        return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Invalid Session ID</h2><a href="/">Go Back</a></div>`);
    }

    try {
        const clientInfo = activeClients.get(sessionId);
        
        // Security check: Only allow the user who owns the session to stop tasks
        if (clientInfo.userIP !== userIP) {
            return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Security Error: You cannot stop someone else's tasks!</h2><a href="/">Go Back</a></div>`);
        }
        
        const taskInfo = clientInfo.tasks.find(t => t.taskId === taskId);
        
        if (!taskInfo) {
            return res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error: Task not found</h2><a href="/">Go Back</a></div>`);
        }
        
        taskInfo.stopRequested = true;
        taskInfo.isSending = false;
        taskInfo.endTime = new Date();

        // Add stop log with real timestamp
        const logs = taskLogs.get(taskId) || [];
        logs.unshift({
            type: "info",
            message: `🛑 Task stopped by user`,
            details: `Total messages sent: ${taskInfo.sentMessages}`,
            timestamp: new Date().toLocaleString('en-US', { hour12: true })
        });
        taskLogs.set(taskId, logs);

        res.send(`<script>window.location.href = '/session-status?sessionId=${sessionId}';</script>`);

    } catch (error) {
        console.error(`Error stopping task ${taskId}:`, error);
        res.send(`<div class="box"><h2 style="color:#FF0000;">❌ Error stopping task</h2><p>${error.message}</p><a href="/">Go Back</a></div>`);
    }
});

app.get("/get-groups", async (req, res) => {
    const userIP = req.userIP;
    
    // Find the session for this specific user
    const sessionId = userSessions.get(userIP);
    if (!sessionId || !activeClients.has(sessionId)) {
        return res.send(`<div style="padding:25px; background:rgba(255,0,0,0.3); border-radius:15px; border:2px solid #FF0000;">
                          <h2 style="color:#FFB6C1;">❌ Error: No active WhatsApp session found</h2>
                          <p style="font-size:18px; margin:15px 0;">Please complete Step 1: Generate pairing code with your WhatsApp number first.</p>
                         </div>`);
    }

    try {
        const { client: waClient, number: senderNumber, isConnected } = activeClients.get(sessionId);
        
        if (!isConnected) {
            return res.send(`<div style="padding:25px; background:rgba(255,0,0,0.3); border-radius:15px; border:2px solid #FF0000;">
                              <h2 style="color:#FFB6C1;">❌ Error: WhatsApp not connected!</h2>
                              <p style="font-size:18px;">Please make sure your WhatsApp is properly paired and connected.</p>
                            </div>`);
        }
        
        const groups = await waClient.groupFetchAllParticipating();
        
        let groupsList = `<h2 style="color:#FFD700; margin-bottom:25px;">📱 Your Groups (From: ${senderNumber})</h2>`;
        
        if (Object.keys(groups).length === 0) {
            groupsList += `<p style="font-size:20px; color:#FFB6C1;">No groups found. You need to be a member of at least one group.</p>`;
        } else {
            groupsList += `<div class='group-list'>`;
            
            Object.keys(groups).forEach((groupId, index) => {
                const group = groups[groupId];
                groupsList += `<div class="group-item">`;
                groupsList += `<h3 style="color:#FFD700;">${index + 1}. ${group.subject || 'Unnamed Group'}</h3>`;
                groupsList += `<p><strong>🔑 Group ID:</strong> <code style="background:rgba(255,255,255,0.1); padding:5px; border-radius:5px;">${groupId.replace('@g.us', '')}</code></p>`;
                groupsList += `<p><strong>👥 Participants:</strong> ${group.participants ? group.participants.length : 'N/A'}</p>`;
                if (group.creation) {
                    groupsList += `<p><strong>📅 Created:</strong> ${new Date(group.creation * 1000).toLocaleDateString()}</p>`;
                }
                groupsList += `</div>`;
            });
            
            groupsList += `</div>`;
        }
        
        res.send(groupsList);

    } catch (error) {
        console.error("Error fetching groups:", error);
        res.send(`<div style="padding:25px; background:rgba(255,0,0,0.3); border-radius:15px; border:2px solid #FF0000;">
                    <h2 style="color:#FFB6C1;">❌ Error fetching groups</h2>
                    <p style="font-size:18px;">${error.message}</p>
                    <p style="font-size:16px; margin-top:15px;">Make sure your WhatsApp is connected and you have groups.</p>
                  </div>`);
    }
});

// Enhanced error handling to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    activeClients.forEach(({ client }, sessionId) => {
        client.end();
        console.log(`Closed connection for Session ID: ${sessionId}`);
    });
    process.exit();
});

app.listen(PORT, () => {
    console.log(`🔥 WhatsApp Server Nobita running on http://localhost:${PORT}`);
    console.log(`✅ Server started successfully!`);
});
