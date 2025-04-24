const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const clients = new Set();
console.log(`WebSocket server started on port ${PORT}`);

// Heartbeat settings
const HEARTBEAT_INTERVAL = 30000; // ms

function noop() { }

function heartbeat() {
    this.isAlive = true;
}

wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', heartbeat);

    clients.add(ws);
    console.log(`Client connected. Total clients: ${clients.size}`);

    ws.on('message', (message) => {
        // Broadcast to all other connected clients
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
        clients.delete(ws);
        console.log(`Client disconnected. Total clients: ${clients.size}`);
    });

    ws.on('error', (error) => {
        clients.delete(ws);
        console.error('WebSocket error:', error);
    });
});

// Heartbeat interval to clean up dead clients
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            clients.delete(ws);
            return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping(noop);
    });
}, HEARTBEAT_INTERVAL);

wss.on('close', function close() {
    clearInterval(interval);
});