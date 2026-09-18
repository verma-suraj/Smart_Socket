import { WebSocketServer as WsServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { randomUUID } from 'crypto';
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
export class WebSocketServer {
  private wss: WsServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private clientMap: Map<string, WebSocket> = new Map();
  private messageHandlers: Array<(clientId: string, message: WSIncomingMessage) => void> = [];
  private disconnectHandlers: Array<(clientId: string) => void> = [];

  /**
   * Attach the WebSocket server to an existing HTTP server.
   */
  attach(server: HttpServer): void {
    this.wss = new WsServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = randomUUID();

      this.clients.add(ws);
      this.clientMap.set(clientId, ws);

      ws.on('message', (raw: Buffer | string) => {
        try {
          const message: WSIncomingMessage = JSON.parse(
            typeof raw === 'string' ? raw : raw.toString()
          );
          for (const handler of this.messageHandlers) {
            handler(clientId, message);
          }
        } catch {
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
  sendToClient(clientId: string, data: Record<string, unknown>): boolean {
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
  onClientMessage(handler: (clientId: string, message: WSIncomingMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register a handler that fires when a client disconnects.
   * The handler receives the clientId of the disconnecting client.
   */
  onClientDisconnect(handler: (clientId: string) => void): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Broadcast an rfid_tap event to all connected clients.
   */
  emitRfidTap(nodeId: string, rfidUid: string): void {
    this.broadcast({
      type: 'rfid_tap',
      nodeId,
      rfidUid,
    });
  }

  /**
   * Broadcast a telemetry update for a specific node.
   */
  emitTelemetryUpdate(nodeId: string, payload: TelemetryPayload): void {
    this.broadcast({
      type: 'telemetry',
      nodeId,
      payload,
    });
  }

  /**
   * Broadcast a node status change (online, offline, override).
   */
  emitNodeStatusChange(nodeId: string, status: NodeStatus): void {
    this.broadcast({
      type: 'node_status',
      nodeId,
      status,
    });
  }

  /**
   * Broadcast an ALM shedding event.
   */
  emitAlmEvent(event: AlmEvent): void {
    this.broadcast({
      type: 'alm_event',
      event,
    });
  }

  /**
   * Broadcast a session update (start, end, energy progress).
   */
  emitSessionUpdate(session: Session): void {
    this.broadcast({
      type: 'session_update',
      session,
    });
  }

  /**
   * Get the number of currently connected clients.
   */
  getClientCount(): number {
    return this.clientMap.size;
  }

  /**
   * Close the WebSocket server and disconnect all clients.
   */
  close(): void {
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
  private broadcast(data: Record<string, unknown>): void {
    const message = JSON.stringify(data);

    for (const client of this.clientMap.values()) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
