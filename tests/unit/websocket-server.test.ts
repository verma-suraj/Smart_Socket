import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import WebSocket from 'ws';
import { WebSocketServer } from '../../src/modules/dashboard-api/websocket-server.js';

/**
 * Helper: create an HTTP server + WebSocketServer, return url and cleanup fn.
 */
function createTestServer(): {
  httpServer: HttpServer;
  wsServer: WebSocketServer;
  getUrl: () => string;
  cleanup: () => Promise<void>;
} {
  const httpServer = createServer();
  const wsServer = new WebSocketServer();
  wsServer.attach(httpServer);

  const getUrl = () => {
    const addr = httpServer.address() as AddressInfo;
    return `ws://127.0.0.1:${addr.port}`;
  };

  const cleanup = () =>
    new Promise<void>((resolve) => {
      wsServer.close();
      httpServer.close(() => resolve());
    });

  return { httpServer, wsServer, getUrl, cleanup };
}

/**
 * Helper: connect a WebSocket client and wait for it to open.
 */
function connectClient(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/**
 * Helper: wait for a JSON message on a WebSocket client.
 */
function waitForMessage(ws: WebSocket, timeout = 2000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeout);
    ws.once('message', (raw) => {
      clearTimeout(timer);
      resolve(JSON.parse(raw.toString()));
    });
  });
}

/**
 * Helper: wait for a WebSocket to close.
 */
function waitForClose(ws: WebSocket, timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    const timer = setTimeout(() => reject(new Error('Timed out waiting for close')), timeout);
    ws.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe('WebSocketServer', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let getUrl: () => string;
  let cleanup: () => Promise<void>;
  let clients: WebSocket[];

  beforeEach(async () => {
    ({ httpServer, wsServer, getUrl, cleanup } = createTestServer());
    clients = [];

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
  });

  afterEach(async () => {
    // Close all test clients first
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close();
      }
    }
    await cleanup();
  });

  describe('Client tracking', () => {
    it('should assign a unique clientId on connect (verified via onClientMessage)', async () => {
      const receivedIds: string[] = [];
      wsServer.onClientMessage((clientId) => {
        receivedIds.push(clientId);
      });

      const client1 = await connectClient(getUrl());
      const client2 = await connectClient(getUrl());
      clients.push(client1, client2);

      // Each client sends a message so we can capture its assigned clientId
      client1.send(JSON.stringify({ type: 'ping' }));
      client2.send(JSON.stringify({ type: 'ping' }));

      // Wait briefly for messages to arrive
      await new Promise((r) => setTimeout(r, 100));

      expect(receivedIds).toHaveLength(2);
      expect(receivedIds[0]).toBeTruthy();
      expect(receivedIds[1]).toBeTruthy();
      expect(receivedIds[0]).not.toBe(receivedIds[1]);
    });

    it('should increment client count on connect', async () => {
      expect(wsServer.getClientCount()).toBe(0);

      const client1 = await connectClient(getUrl());
      clients.push(client1);

      // Small delay for server to process
      await new Promise((r) => setTimeout(r, 50));
      expect(wsServer.getClientCount()).toBe(1);

      const client2 = await connectClient(getUrl());
      clients.push(client2);

      await new Promise((r) => setTimeout(r, 50));
      expect(wsServer.getClientCount()).toBe(2);
    });

    it('should decrement client count on disconnect', async () => {
      const client1 = await connectClient(getUrl());
      const client2 = await connectClient(getUrl());
      clients.push(client1, client2);

      await new Promise((r) => setTimeout(r, 50));
      expect(wsServer.getClientCount()).toBe(2);

      client1.close();
      await waitForClose(client1);
      // Give server time to process the close event
      await new Promise((r) => setTimeout(r, 50));

      expect(wsServer.getClientCount()).toBe(1);
    });

    it('should fire onClientDisconnect handler with correct clientId on disconnect', async () => {
      const disconnectedIds: string[] = [];
      const messageIds: string[] = [];

      wsServer.onClientMessage((clientId) => {
        messageIds.push(clientId);
      });
      wsServer.onClientDisconnect((clientId) => {
        disconnectedIds.push(clientId);
      });

      const client1 = await connectClient(getUrl());
      clients.push(client1);

      // Send a message to capture the clientId
      client1.send(JSON.stringify({ type: 'identify' }));
      await new Promise((r) => setTimeout(r, 50));

      const assignedId = messageIds[0];
      expect(assignedId).toBeTruthy();

      // Disconnect the client
      client1.close();
      await waitForClose(client1);
      await new Promise((r) => setTimeout(r, 50));

      expect(disconnectedIds).toContain(assignedId);
    });
  });

  describe('sendToClient', () => {
    it('should deliver a message to the correct client', async () => {
      const clientIdMap: Map<WebSocket, string> = new Map();

      wsServer.onClientMessage((clientId, msg) => {
        if (msg.type === 'register') {
          // We need to find which client sent this so we store it by order
          // Instead, we'll use a trick: message includes a marker
          clientIdMap.set(clients[Number(msg.index)], clientId);
        }
      });

      const client1 = await connectClient(getUrl());
      const client2 = await connectClient(getUrl());
      clients.push(client1, client2);

      // Register so we can get their clientIds
      client1.send(JSON.stringify({ type: 'register', index: 0 }));
      client2.send(JSON.stringify({ type: 'register', index: 1 }));
      await new Promise((r) => setTimeout(r, 100));

      const client1Id = clientIdMap.get(client1)!;
      const client2Id = clientIdMap.get(client2)!;
      expect(client1Id).toBeTruthy();
      expect(client2Id).toBeTruthy();

      // Send a targeted message to client2
      const messagePromise = waitForMessage(client2);
      const sent = wsServer.sendToClient(client2Id, { type: 'hello', target: 'client2' });

      expect(sent).toBe(true);
      const received = await messagePromise;
      expect(received).toEqual({ type: 'hello', target: 'client2' });
    });

    it('should not deliver a message to other clients', async () => {
      const clientIds: string[] = [];

      wsServer.onClientMessage((clientId) => {
        clientIds.push(clientId);
      });

      const client1 = await connectClient(getUrl());
      const client2 = await connectClient(getUrl());
      clients.push(client1, client2);

      // Identify both clients
      client1.send(JSON.stringify({ type: 'id' }));
      client2.send(JSON.stringify({ type: 'id' }));
      await new Promise((r) => setTimeout(r, 100));

      const targetId = clientIds[1]; // client2's id

      // Set up a listener on client1 to check it doesn't receive the message
      let client1Received = false;
      client1.on('message', () => {
        client1Received = true;
      });

      // Send only to client2
      wsServer.sendToClient(targetId, { type: 'targeted' });
      await new Promise((r) => setTimeout(r, 100));

      expect(client1Received).toBe(false);
    });

    it('should return false for a non-existent clientId', () => {
      const result = wsServer.sendToClient('non-existent-id', { type: 'test' });
      expect(result).toBe(false);
    });

    it('should return false for a disconnected client', async () => {
      const clientIds: string[] = [];

      wsServer.onClientMessage((clientId) => {
        clientIds.push(clientId);
      });

      const client1 = await connectClient(getUrl());
      clients.push(client1);

      client1.send(JSON.stringify({ type: 'id' }));
      await new Promise((r) => setTimeout(r, 50));

      const clientId = clientIds[0];

      // Disconnect client
      client1.close();
      await waitForClose(client1);
      await new Promise((r) => setTimeout(r, 50));

      const result = wsServer.sendToClient(clientId, { type: 'test' });
      expect(result).toBe(false);
    });
  });

  describe('emitRfidTap', () => {
    it('should broadcast rfid_tap to all connected clients', async () => {
      const client1 = await connectClient(getUrl());
      const client2 = await connectClient(getUrl());
      const client3 = await connectClient(getUrl());
      clients.push(client1, client2, client3);

      await new Promise((r) => setTimeout(r, 50));

      const msg1Promise = waitForMessage(client1);
      const msg2Promise = waitForMessage(client2);
      const msg3Promise = waitForMessage(client3);

      wsServer.emitRfidTap('node-42', 'AABB1122');

      const [msg1, msg2, msg3] = await Promise.all([msg1Promise, msg2Promise, msg3Promise]);

      const expected = { type: 'rfid_tap', nodeId: 'node-42', rfidUid: 'AABB1122' };
      expect(msg1).toEqual(expected);
      expect(msg2).toEqual(expected);
      expect(msg3).toEqual(expected);
    });

    it('should not throw when no clients are connected', () => {
      expect(() => wsServer.emitRfidTap('node-1', 'UID123')).not.toThrow();
    });
  });

  describe('onClientMessage', () => {
    it('should fire handler with parsed JSON message', async () => {
      const messages: Array<{ clientId: string; message: Record<string, unknown> }> = [];

      wsServer.onClientMessage((clientId, message) => {
        messages.push({ clientId, message });
      });

      const client = await connectClient(getUrl());
      clients.push(client);

      client.send(JSON.stringify({ type: 'enter_scan_mode', data: 'test' }));
      await new Promise((r) => setTimeout(r, 100));

      expect(messages).toHaveLength(1);
      expect(messages[0].clientId).toBeTruthy();
      expect(messages[0].message).toEqual({ type: 'enter_scan_mode', data: 'test' });
    });

    it('should support multiple handlers', async () => {
      let handler1Called = false;
      let handler2Called = false;

      wsServer.onClientMessage(() => {
        handler1Called = true;
      });
      wsServer.onClientMessage(() => {
        handler2Called = true;
      });

      const client = await connectClient(getUrl());
      clients.push(client);

      client.send(JSON.stringify({ type: 'test' }));
      await new Promise((r) => setTimeout(r, 100));

      expect(handler1Called).toBe(true);
      expect(handler2Called).toBe(true);
    });

    it('should ignore malformed (non-JSON) messages', async () => {
      const messages: unknown[] = [];

      wsServer.onClientMessage((_clientId, message) => {
        messages.push(message);
      });

      const client = await connectClient(getUrl());
      clients.push(client);

      client.send('not valid json {{{');
      await new Promise((r) => setTimeout(r, 100));

      expect(messages).toHaveLength(0);
    });
  });

  describe('Scan mode message handling', () => {
    it('should handle enter_scan_mode message through onClientMessage', async () => {
      const receivedMessages: Array<{ clientId: string; type: string }> = [];

      wsServer.onClientMessage((clientId, message) => {
        receivedMessages.push({ clientId, type: message.type as string });
      });

      const client = await connectClient(getUrl());
      clients.push(client);

      client.send(JSON.stringify({ type: 'enter_scan_mode' }));
      await new Promise((r) => setTimeout(r, 100));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].type).toBe('enter_scan_mode');
    });

    it('should handle cancel_scan_mode message through onClientMessage', async () => {
      const receivedMessages: Array<{ clientId: string; type: string }> = [];

      wsServer.onClientMessage((clientId, message) => {
        receivedMessages.push({ clientId, type: message.type as string });
      });

      const client = await connectClient(getUrl());
      clients.push(client);

      client.send(JSON.stringify({ type: 'cancel_scan_mode' }));
      await new Promise((r) => setTimeout(r, 100));

      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0].type).toBe('cancel_scan_mode');
    });

    it('should reject duplicate scan mode entry via integrated handler', async () => {
      // This tests that the message handler infrastructure correctly routes
      // scan mode messages to ScanModeManager. We simulate a handler that
      // rejects the second request by checking scan mode state.
      const responses: Array<{ clientId: string; type: string }> = [];

      // Simulate the scan mode integration: first enter succeeds, second is rejected
      let scanRequester: string | null = null;

      wsServer.onClientMessage((clientId, message) => {
        if (message.type === 'enter_scan_mode') {
          if (scanRequester === null) {
            scanRequester = clientId;
            wsServer.sendToClient(clientId, { type: 'scan_mode_entered' });
          } else {
            wsServer.sendToClient(clientId, {
              type: 'scan_in_progress',
              error: 'Another scan is already in progress',
            });
          }
        }
      });

      const client1 = await connectClient(getUrl());
      const client2 = await connectClient(getUrl());
      clients.push(client1, client2);

      await new Promise((r) => setTimeout(r, 50));

      // Client 1 enters scan mode
      const msg1Promise = waitForMessage(client1);
      client1.send(JSON.stringify({ type: 'enter_scan_mode' }));
      const response1 = await msg1Promise;
      expect(response1.type).toBe('scan_mode_entered');

      // Client 2 tries to enter — should be rejected
      const msg2Promise = waitForMessage(client2);
      client2.send(JSON.stringify({ type: 'enter_scan_mode' }));
      const response2 = await msg2Promise;
      expect(response2.type).toBe('scan_in_progress');
      expect(response2.error).toBe('Another scan is already in progress');
    });
  });

  describe('close', () => {
    it('should disconnect all clients and reset state', async () => {
      const client1 = await connectClient(getUrl());
      const client2 = await connectClient(getUrl());
      clients.push(client1, client2);

      await new Promise((r) => setTimeout(r, 50));
      expect(wsServer.getClientCount()).toBe(2);

      const close1 = waitForClose(client1);
      const close2 = waitForClose(client2);

      wsServer.close();

      await Promise.all([close1, close2]);
      expect(wsServer.getClientCount()).toBe(0);
    });
  });
});
