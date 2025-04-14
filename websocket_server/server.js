const WebSocket = require('ws');

// Use the PORT provided by Render or local 8080
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Set();
console.log(`WebSocket server started on port ${PORT}`);

wss.on('connection', (ws) => {
    console.log(`Client connected. Total clients: ${clients.size}`);
    clients.add(ws);

    ws.on('message', (message) => {
        // console.log('Server Received:', message.toString()); // <-- Check this log
        // Broadcast to all *other* connected clients
        clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message.toString());
                } catch (e) {
                    console.error('Error sending message:', e);
                }
            }
        });
    });

    ws.on('close', () => {
        console.log(`Client disconnected. Total clients: ${clients.size}`);
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});