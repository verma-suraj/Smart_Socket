import type { Server as HttpServer } from 'http';
import { TelemetryPayload } from '../../models/telemetry.js';
import { Session } from '../../models/session.js';
import { NodeStatus, AlmEvent } from '../../interfaces/dashboard-api.interface.js';
/**
 * Typed interface for incoming WebSocket messages from clients.
 */
export interface WSIncomingMessage {
    type: string;
    [key: string]: unknown;
}
/**
 * WebSocket server for real-time dashboard push notifications.
 *
 * Wraps the `ws` WebSocket.Server and provides typed broadcast methods
 * for telemetry updates, node status changes, ALM events, and session updates.
 * Supports per-client tracking via unique client IDs and targeted messaging.
 *
 * Validates: Requirements 1.2, 2.2, 4.1, 4.2, 13.1, 13.2, 13.4, 13.5
 */
export declare class WebSocketServer {
    private wss;
    private clients;
    private clientMap;
    private messageHandlers;
    private disconnectHandlers;
    /**
     * Attach the WebSocket server to an existing HTTP server.
     */
    attach(server: HttpServer): void;
    /**
     * Send a message to a specific client by ID.
     * Returns true if the message was sent, false if the client was not found or not open.
     */
    sendToClient(clientId: string, data: Record<string, unknown>): boolean;
    /**
     * Register a handler for incoming client messages.
     * The handler receives the clientId and the parsed message object.
     */
    onClientMessage(handler: (clientId: string, message: WSIncomingMessage) => void): void;
    /**
     * Register a handler that fires when a client disconnects.
     * The handler receives the clientId of the disconnecting client.
     */
    onClientDisconnect(handler: (clientId: string) => void): void;
    /**
     * Broadcast an rfid_tap event to all connected clients.
     */
    emitRfidTap(nodeId: string, rfidUid: string): void;
    /**
     * Broadcast a telemetry update for a specific node.
     */
    emitTelemetryUpdate(nodeId: string, payload: TelemetryPayload): void;
    /**
     * Broadcast a node status change (online, offline, override).
     */
    emitNodeStatusChange(nodeId: string, status: NodeStatus): void;
    /**
     * Broadcast an ALM shedding event.
     */
    emitAlmEvent(event: AlmEvent): void;
    /**
     * Broadcast a session update (start, end, energy progress).
     */
    emitSessionUpdate(session: Session): void;
    /**
     * Get the number of currently connected clients.
     */
    getClientCount(): number;
    /**
     * Close the WebSocket server and disconnect all clients.
     */
    close(): void;
    /**
     * Broadcast a JSON message to all connected clients.
     */
    private broadcast;
}
//# sourceMappingURL=websocket-server.d.ts.map