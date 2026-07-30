import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { WebSocket } from 'ws';
import { WebSocketServer } from '../../src/modules/dashboard-api/websocket-server.js';

/**
 * Dashboard WebSocket Integration Test
 *
 * Validates Requirement 13.2:
 * - WHEN a new Telemetry_Payload is processed by the Backend,
 *   THE Dashboard SHALL update the displayed values for the corresponding node within 2 seconds.
 *
 * Tests real HTTP server + WebSocket server + ws client communication.
 */

describe('Dashboard WebSocket Integration', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let client: WebSocket;
  let serverPort: number;

  beforeEach(async () => {
    wsServer = new WebSocketServer();
    httpServer = createServer();
    wsServer.attach(httpServer);

    // Start HTTP server on a random available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        if (address && typeof address === 'object') {
          serverPort = address.port;
        }
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Close client if open
    if (client && client.readyState === WebSocket.OPEN) {
      client.close();
      await new Promise<void>((resolve) => {
        client.once('close', () => resolve());
        setTimeout(resolve, 500);
      });
    }

    // Close WebSocket server and HTTP server
    wsServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  /**
   * Helper: connect a WebSocket client and wait for the connection to open.
   */
  async function connectClient(): Promise<WebSocket> {
    client = new WebSocket(`ws://localhost:${serverPort}`);
    await new Promise<void>((resolve, reject) => {
      client.once('open', () => resolve());
      client.once('error', (err) => reject(err));
    });
    return client;
  }

  /**
   * Helper: wait for the next message from the client within a timeout.
   */
  function waitForMessage(ws: WebSocket, timeoutMs: number = 2000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`No message received within ${timeoutMs}ms`));
      }, timeoutMs);

      ws.once('message', (data) => {
        clearTimeout(timer);
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  describe('Telemetry broadcast', () => {
    it('should deliver telemetry update to connected client within 2 seconds', async () => {
      await connectClient();

      const payload = {
        voltage: 230.5,
        current: 16.2,
        power: 3734.1,
        frequency: 50.0,
        powerFactor: 0.98,
        temperature: 35.2,
        timestamp: 1700000000,
      };

      const messagePromise = waitForMessage(client, 2000);
      wsServer.emitTelemetryUpdate('node-001', payload);

      const received = await messagePromise;

      expect(received).toEqual({
        type: 'telemetry',
        nodeId: 'node-001',
        payload,
      });
    });

    it('should include correct message format with type, nodeId, and payload fields', async () => {
      await connectClient();

      const payload = {
        voltage: 120.0,
        current: 10.0,
        power: 1200.0,
        frequency: 60.0,
        powerFactor: 1.0,
        temperature: 25.0,
        timestamp: 1700001000,
      };

      const messagePromise = waitForMessage(client, 2000);
      wsServer.emitTelemetryUpdate('node-abc', payload);

      const msg = await messagePromise as Record<string, unknown>;

      expect(msg).toHaveProperty('type', 'telemetry');
      expect(msg).toHaveProperty('nodeId', 'node-abc');
      expect(msg).toHaveProperty('payload');
      const msgPayload = msg.payload as Record<string, unknown>;
      expect(msgPayload).toHaveProperty('voltage', 120.0);
      expect(msgPayload).toHaveProperty('current', 10.0);
      expect(msgPayload).toHaveProperty('power', 1200.0);
      expect(msgPayload).toHaveProperty('frequency', 60.0);
      expect(msgPayload).toHaveProperty('powerFactor', 1.0);
      expect(msgPayload).toHaveProperty('temperature', 25.0);
      expect(msgPayload).toHaveProperty('timestamp', 1700001000);
    });
  });

  describe('Node status broadcast', () => {
    it('should broadcast node status changes to connected client', async () => {
      await connectClient();

      const messagePromise = waitForMessage(client, 2000);
      wsServer.emitNodeStatusChange('node-002', 'offline');

      const received = await messagePromise;

      expect(received).toEqual({
        type: 'node_status',
        nodeId: 'node-002',
        status: 'offline',
      });
    });
  });

  describe('ALM event broadcast', () => {
    it('should broadcast ALM shedding events to connected client', async () => {
      await connectClient();

      const almEvent = {
        type: 'shedding' as const,
        nodeId: 'node-003',
        reason: 'Load exceeded threshold',
        timestamp: 1700002000,
      };

      const messagePromise = waitForMessage(client, 2000);
      wsServer.emitAlmEvent(almEvent);

      const received = await messagePromise;

      expect(received).toEqual({
        type: 'alm_event',
        event: almEvent,
      });
    });
  });

  describe('Session update broadcast', () => {
    it('should broadcast session updates to connected client', async () => {
      await connectClient();

      const session = {
        sessionId: 'session-001',
        userId: 'user-abc',
        nodeId: 'node-004',
        sessionType: 'owner' as const,
        startTimestamp: 1700000000,
        endTimestamp: null,
        initialSOC: 0.2,
        batteryCapacity: 60,
        chargerPowerRating: 7.4,
        priorityScore: 6.486,
        totalEnergyConsumed: 5.2,
        totalTime: 3600,
        billAmount: null,
        endReason: null,
        active: true,
        guestSpecs: null,
      };

      const messagePromise = waitForMessage(client, 2000);
      wsServer.emitSessionUpdate(session);

      const received = await messagePromise;

      expect(received).toEqual({
        type: 'session_update',
        session,
      });
    });
  });

  describe('Multiple clients', () => {
    it('should broadcast telemetry to all connected clients', async () => {
      // Connect first client
      await connectClient();
      const client1 = client;

      // Connect second client
      const client2 = new WebSocket(`ws://localhost:${serverPort}`);
      await new Promise<void>((resolve, reject) => {
        client2.once('open', () => resolve());
        client2.once('error', (err) => reject(err));
      });

      const payload = {
        voltage: 230.0,
        current: 15.0,
        power: 3450.0,
        frequency: 50.0,
        powerFactor: 0.99,
        temperature: 30.0,
        timestamp: 1700003000,
      };

      const msg1Promise = waitForMessage(client1, 2000);
      const msg2Promise = waitForMessage(client2, 2000);

      wsServer.emitTelemetryUpdate('node-005', payload);

      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);

      const expected = {
        type: 'telemetry',
        nodeId: 'node-005',
        payload,
      };

      expect(msg1).toEqual(expected);
      expect(msg2).toEqual(expected);

      // Clean up second client
      client2.close();
      await new Promise<void>((resolve) => {
        client2.once('close', () => resolve());
        setTimeout(resolve, 500);
      });
    });
  });
});
