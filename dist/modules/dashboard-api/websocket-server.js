import { WebSocketServer as WsServer, WebSocket } from 'ws';
import { randomUUID } from 'crypto';
/**
 * WebSocket server for real-time dashboard push notifications.
 *
 * Wraps the `ws` WebSocket.Server and provides typed broadcast methods
 * for telemetry updates, node status changes, ALM events, and session updates.
 * Supports per-client tracking via unique client IDs and targeted messaging.
 *
 * Validates: Requirements 1.2, 2.2, 4.1, 4.2, 13.1, 13.2, 13.4, 13.5
 */
export class WebSocketServer {
    constructor() {
        this.wss = null;
        this.clients = new Set();
        this.clientMap = new Map();
        this.messageHandlers = [];
        this.disconnectHandlers = [];
    }
    /**
     * Attach the WebSocket server to an existing HTTP server.
     */
    attach(server) {
        this.wss = new WsServer({ server });
        this.wss.on('connection', (ws) => {
            const clientId = randomUUID();
            this.clients.add(ws);
            this.clientMap.set(clientId, ws);
            ws.on('message', (raw) => {
                try {
                    const message = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
                    for (const handler of this.messageHandlers) {
                        handler(clientId, message);
                    }
                }
                catch {
                    // Ignore malformed JSON messages
                }
            });
            ws.on('close', () => {
                this.clients.delete(ws);
                this.clientMap.delete(clientId);
                for (const handler of this.disconnectHandlers) {
                    handler(clientId);
                }
            });
            ws.on('error', () => {
                this.clients.delete(ws);
                this.clientMap.delete(clientId);
                for (const handler of this.disconnectHandlers) {
                    handler(clientId);
                }
            });
        });
    }
    /**
     * Send a message to a specific client by ID.
     * Returns true if the message was sent, false if the client was not found or not open.
     */
    sendToClient(clientId, data) {
        const ws = this.clientMap.get(clientId);
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return false;
        }
        ws.send(JSON.stringify(data));
        return true;
    }
    /**
     * Register a handler for incoming client messages.
     * The handler receives the clientId and the parsed message object.
     */
    onClientMessage(handler) {
        this.messageHandlers.push(handler);
    }
    /**
     * Register a handler that fires when a client disconnects.
     * The handler receives the clientId of the disconnecting client.
     */
    onClientDisconnect(handler) {
        this.disconnectHandlers.push(handler);
    }
    /**
     * Broadcast an rfid_tap event to all connected clients.
     */
    emitRfidTap(nodeId, rfidUid) {
        this.broadcast({
            type: 'rfid_tap',
            nodeId,
            rfidUid,
        });
    }
    /**
     * Broadcast a telemetry update for a specific node.
     */
    emitTelemetryUpdate(nodeId, payload) {
        this.broadcast({
            type: 'telemetry',
            nodeId,
            payload,
        });
    }
    /**
     * Broadcast a node status change (online, offline, override).
     */
    emitNodeStatusChange(nodeId, status) {
        this.broadcast({
            type: 'node_status',
            nodeId,
            status,
        });
    }
    /**
     * Broadcast an ALM shedding event.
     */
    emitAlmEvent(event) {
        this.broadcast({
            type: 'alm_event',
            event,
        });
    }
    /**
     * Broadcast a session update (start, end, energy progress).
     */
    emitSessionUpdate(session) {
        this.broadcast({
            type: 'session_update',
            session,
        });
    }
    /**
     * Get the number of currently connected clients.
     */
    getClientCount() {
        return this.clientMap.size;
    }
    /**
     * Close the WebSocket server and disconnect all clients.
     */
    close() {
        for (const client of this.clients) {
            client.close();
        }
        this.clients.clear();
        this.clientMap.clear();
        this.messageHandlers = [];
        this.disconnectHandlers = [];
        this.wss?.close();
        this.wss = null;
    }
    /**
     * Broadcast a JSON message to all connected clients.
     */
    broadcast(data) {
        const message = JSON.stringify(data);
        for (const client of this.clientMap.values()) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        }
    }
}
//# sourceMappingURL=websocket-server.js.map