import { WebSocketServer as WsServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { TelemetryPayload } from '../../models/telemetry.js';
import { Session } from '../../models/session.js';
import { NodeStatus, AlmEvent } from '../../interfaces/dashboard-api.interface.js';

/**
 * WebSocket server for real-time dashboard push notifications.
 *
 * Wraps the `ws` WebSocket.Server and provides typed broadcast methods
 * for telemetry updates, node status changes, ALM events, and session updates.
 *
 * Validates: Requirements 13.1, 13.2, 13.4, 13.5
 */
export class WebSocketServer {
  private wss: WsServer | null = null;
  private clients: Set<WebSocket> = new Set();

  /**
   * Attach the WebSocket server to an existing HTTP server.
   */
  attach(server: HttpServer): void {
    this.wss = new WsServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
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
    return this.clients.size;
  }

  /**
   * Close the WebSocket server and disconnect all clients.
   */
  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.wss?.close();
    this.wss = null;
  }

  /**
   * Broadcast a JSON message to all connected clients.
   */
  private broadcast(data: Record<string, unknown>): void {
    const message = JSON.stringify(data);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }
}
