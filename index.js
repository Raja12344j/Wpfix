app.get("/code", async (req, res) => {
    const num = req.query.number.replace(/[^0-9]/g, "");
    const userIP = req.userIP;

    // Check if user already has an active session and if it's truly connected
    if (userSessions.has(userIP)) {
        const existingSessionId = userSessions.get(userIP);
        const existingClientInfo = activeClients.get(existingSessionId);

        // If client exists and is connected, show session active message
        if (existingClientInfo && existingClientInfo.isConnected) {
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

        // If client exists but is disconnected/inactive, clean the session to allow new pairing
        if (existingClientInfo) {
            try {
                if (existingClientInfo.client) {
                    existingClientInfo.client.end();
                }
            } catch (e) {
                // ignore errors during cleanup
            }
            activeClients.delete(existingSessionId);
            userSessions.delete(userIP);

            // Delete session files to clear old auth state
            const fs = require("fs");
            const sessionPath = path.join("temp", existingSessionId);
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }
    }

    // Create a new session and generate pairing code
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
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
            },
            printQRInTerminal: false,
            logger: pino({ level: "fatal" }).child({ level: "fatal" }),
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            shouldIgnoreJid: jid => isJidBroadcast(jid),
            getMessage: async () => ({})
        });

        if (!waClient.authState.creds.registered) {
            await delay(1500);
            const code = await waClient.requestPairingCode(num);
            
            // Store active client and session mapping
            activeClients.set(sessionId, {
                client: waClient,
                number: num,
                authPath: sessionPath,
                isConnected: false,
                tasks: [],
                lastActivity: Date.now(),
                userIP: userIP
            });
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
                            const event = new Event('sessionUpdated');
                            window.dispatchEvent(event);
                        }, 1000);
                    </script>
                    <a href="/" style="display:inline-block; margin-top:20px; padding:15px 30px; background:#FF4500; color:white; text-decoration:none; border-radius:10px; font-size:18px;">Go Back to Home</a>
                </div>
            `);
        }

        waClient.ev.on("creds.update", saveCreds);
        waClient.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
            if (connection === "open") {
                const clientInfo = activeClients.get(sessionId);
                if (clientInfo) {
                    clientInfo.isConnected = true;
                    clientInfo.lastActivity = Date.now();
                }
                console.log(`WhatsApp Connected for ${num}! Session ID: ${sessionId}`);
            } else if (connection === "close") {
                const clientInfo = activeClients.get(sessionId);
                if (clientInfo) {
                    clientInfo.isConnected = false;
                    console.log(`Connection closed for Session ID: ${sessionId}`);
                    // Try reconnect unless unauthorized (401)
                    if (lastDisconnect?.error?.output?.statusCode !== 401) {
                        await delay(10000);
                        initializeClient(sessionId, num, sessionPath, userIP);
                    }
                }
            }
        });

    } catch (err) {
        console.error("Error in pairing:", err);
        res.send(`
            <div style="padding: 25px; background: rgba(255, 0, 0, 0.3); border-radius: 15px; border: 2px solid #FF0000;">
                <h2 style="color: #FFB6C1;">❌ Error: ${err.message}</h2>
                <p style="margin: 15px 0; font-size: 18px;">Please try again with a valid WhatsApp number.</p>
                <a href="/" style="display:inline-block; margin-top:15px; padding:12px 25px; background:#FF4500; color:white; text-decoration:none; border-radius:8px;">Go Back</a>
            </div>`);
    }
});
