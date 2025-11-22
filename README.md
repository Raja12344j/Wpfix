Fixed WhatsApp Panel (Render/Bot-Hosting ready)
Instructions:
1. npm install
2. npm start
Notes:
- Sessions are identified by sessionId stored in browser localStorage (wa_session_id).
- When pairing, the server returns a sessionId which the client stores locally. All subsequent actions (send-message, get-groups) send sessionId to server.
- IP-based session mapping removed to work on reverse-proxied hosts like Render.
