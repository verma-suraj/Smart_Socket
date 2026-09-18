/**
 * WebSocket service with automatic reconnection and message routing.
 *
 * Features:
 * - Exponential backoff reconnection (1s initial, doubling, max 30s, max 10 attempts)
 * - JSON message parsing with silent discard of invalid messages
 * - Message routing by type field via parseAndRoute
 * - Clean disconnect does NOT trigger reconnection
 * - Singleton export for app-wide use
 */

import { computeBackoffDelay } from '../utils/notification-logic';
import { parseAndRoute } from '../utils/ws-message-router';
import type { WSMessage } from '../types';

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';
type MessageHandler = (message: WSMessage) => void;
type RawMessageHandler = (message: Record<string, unknown>) => void;
type DisconnectHandler = () => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string = '';
  private status: ConnectionStatus = 'disconnected';
  private messageHandlers: MessageHandler[] = [];
  private rawMessageHandlers: RawMessageHandler[] = [];
  private disconnectHandlers: DisconnectHandler[] = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalDisconnect: boolean = false;

  /**
   * Establish a WebSocket connection to the given URL.
   */
  connect(url: string): void {
    this.url = url;
    this.intentionalDisconnect = false;
    this.createConnection();
  }

  /**
   * Close the connection with a close frame and release resources.
   * Does NOT trigger reconnection logic.
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.status = 'disconnected';
  }

  /**
   * Register a message handler to receive parsed WSMessage objects.
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Get the current connection status.
   */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /**
   * Send a JSON-serializable message through the WebSocket connection.
   * Returns true if the message was sent, false if not connected.
   */
  send(data: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Register a handler for raw parsed JSON messages (before type-based routing).
   * Useful for receiving message types not handled by the default router.
   */
  onRawMessage(handler: RawMessageHandler): void {
    this.rawMessageHandlers.push(handler);
  }

  /**
   * Unregister a raw message handler.
   */
  offRawMessage(handler: RawMessageHandler): void {
    this.rawMessageHandlers = this.rawMessageHandlers.filter((h) => h !== handler);
  }

  /**
   * Register a handler that fires when the WebSocket connection is lost unexpectedly.
   */
  onDisconnect(handler: DisconnectHandler): void {
    this.disconnectHandlers.push(handler);
  }

  /**
   * Unregister a disconnect handler.
   */
  offDisconnect(handler: DisconnectHandler): void {
    this.disconnectHandlers = this.disconnectHandlers.filter((h) => h !== handler);
  }

  /**
   * Create the WebSocket connection and attach event handlers.
   */
  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.handleConnectionFailure();
      return;
    }

    this.ws.onopen = () => {
      this.status = 'connected';
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      if (!this.intentionalDisconnect) {
        this.handleConnectionFailure();
      }
    };

    this.ws.onerror = () => {
      // The onerror event is always followed by onclose,
      // so reconnection is handled in onclose.
    };
  }

  /**
   * Handle incoming raw message data.
   * Parse JSON and route to handlers. Invalid messages are silently discarded.
   */
  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      return;
    }

    // Try to parse as JSON first for raw handlers
    let parsed: Record<string, unknown> | null = null;
    try {
      const result = JSON.parse(data);
      if (result !== null && typeof result === 'object') {
        parsed = result as Record<string, unknown>;
      }
    } catch {
      // Not valid JSON — skip raw handlers
    }

    // Dispatch to raw message handlers (all message types)
    if (parsed) {
      for (const handler of this.rawMessageHandlers) {
        handler(parsed);
      }
    }

    const handlers = {
      telemetry: (msg: unknown) => this.dispatchToHandlers(msg as WSMessage),
      node_status: (msg: unknown) => this.dispatchToHandlers(msg as WSMessage),
      alm_event: (msg: unknown) => this.dispatchToHandlers(msg as WSMessage),
      session_update: (msg: unknown) => this.dispatchToHandlers(msg as WSMessage),
    };

    // parseAndRoute returns false for invalid/unrecognized messages (silent discard)
    parseAndRoute(data, handlers);
  }

  /**
   * Dispatch a parsed message to all registered handlers.
   */
  private dispatchToHandlers(message: WSMessage): void {
    for (const handler of this.messageHandlers) {
      handler(message);
    }
  }

  /**
   * Handle connection failure: attempt reconnection with exponential backoff.
   */
  private handleConnectionFailure(): void {
    if (this.intentionalDisconnect) {
      return;
    }

    // Notify disconnect handlers
    for (const handler of this.disconnectHandlers) {
      handler();
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.status = 'disconnected';
      return;
    }

    this.status = 'reconnecting';
    this.reconnectAttempts++;

    const delay = computeBackoffDelay(this.reconnectAttempts);

    this.reconnectTimer = setTimeout(() => {
      if (!this.intentionalDisconnect) {
        this.createConnection();
      }
    }, delay);
  }

  /**
   * Clear any pending reconnection timer.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

/** Singleton instance of the WebSocket service. */
export const webSocketService = new WebSocketService();
export type { ConnectionStatus, MessageHandler, RawMessageHandler, DisconnectHandler };
