import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { WebSocket } from 'ws';
import { WebSocketServer } from '../../src/modules/dashboard-api/websocket-server.js';
import { ScanModeManager } from '../../src/modules/scan-mode/scan-mode-manager.js';
import { RfidHandler } from '../../src/modules/auth/rfid-handler.js';

/**
 * Scan Mode End-to-End Integration Tests
 *
 * Validates Requirements 1.2, 4.2, 4.3, 4.7:
 * - Req 1.2: Backend listens for next RFID tap and forwards captured UID to requesting client
 * - Req 4.2: RFID MQTT message while scan requester registered → forward rfid_scanned
 * - Req 4.3: After scan result delivered → auto-exit scan mode, resume normal auth
 * - Req 4.7: 30s timeout → exit scan mode, send scan_mode_timeout to requester
 *
 * Tests the full WebSocket → ScanModeManager → RfidHandler → WebSocket delivery pipeline.
 */

/**
 * Creates a mock Firestore that returns empty results for RFID lookups.
 */
function createMockFirestore() {
  const mockGet = vi.fn(async () => ({ empty: true, docs: [] }));
  const mockLimit = vi.fn(() => ({ get: mockGet }));
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockCollection = vi.fn(() => ({
    where: mockWhere,
    limit: mockLimit,
    get: mockGet,
  }));

  return { collection: mockCollection } as any;
}

/**
 * Helper: Connect a WebSocket client and wait for it to open.
 */
function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/**
 * Helper: Wait for the next JSON message from a WebSocket client.
 */
function waitForMessage(ws: WebSocket, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

/**
 * Helper: Send a JSON message from a WebSocket client.
 */
function sendMessage(ws: WebSocket, message: Record<string, unknown>): void {
  ws.send(JSON.stringify(message));
}

/**
 * Helper: Wait for a small delay to allow async message processing.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sets up the full integration test environment (HTTP server + WS server + ScanModeManager + RfidHandler).
 */
function createTestEnv() {
  const httpServer = createServer();
  const wsServer = new WebSocketServer();
  wsServer.attach(httpServer);

  const scanModeManager = new ScanModeManager();

  // Wire scan mode message handlers (same logic as app.ts)
  wsServer.onClientMessage((clientId, message) => {
    if (message.type === 'enter_scan_mode') {
      const entered = scanModeManager.enterScanMode(clientId);
      if (entered) {
        wsServer.sendToClient(clientId, { type: 'scan_mode_entered' });
      } else {
        wsServer.sendToClient(clientId, { type: 'scan_in_progress', error: 'Another scan is already in progress' });
      }
    }
    if (message.type === 'cancel_scan_mode') {
      scanModeManager.exitScanMode();
    }
  });

  wsServer.onClientDisconnect((clientId) => {
    if (scanModeManager.getRequesterId() === clientId) {
      scanModeManager.exitScanMode();
    }
  });

  scanModeManager.setOnTimeout((requesterId) => {
    wsServer.sendToClient(requesterId, { type: 'scan_mode_timeout' });
  });

  const mockFirestore = createMockFirestore();
  const rfidHandler = new RfidHandler(mockFirestore, scanModeManager, wsServer);

  return { httpServer, wsServer, scanModeManager, rfidHandler };
}

describe('Scan Mode End-to-End Flow', () => {
  let httpServer: HttpServer;
  let wsServer: WebSocketServer;
  let scanModeManager: ScanModeManager;
  let rfidHandler: RfidHandler;
  let port: number;

  beforeEach(async () => {
    const env = createTestEnv();
    httpServer = env.httpServer;
    wsServer = env.wsServer;
    scanModeManager = env.scanModeManager;
    rfidHandler = env.rfidHandler;

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    port = (httpServer.address() as any).port;
  });

  afterEach(async () => {
    wsServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  describe('Happy path: enter_scan_mode → RFID event → rfid_scanned delivery (Req 1.2, 4.2)', () => {
    it('should deliver rfid_scanned to the requesting client when an RFID event arrives', async () => {
      const client = await connectClient(port);

      try {
        // Client enters scan mode
        sendMessage(client, { type: 'enter_scan_mode' });

        // Wait for scan_mode_entered confirmation
        const confirmation = await waitForMessage(client);
        expect(confirmation.type).toBe('scan_mode_entered');

        // Simulate an RFID event arriving (as if from MQTT → RfidHandler)
        const nodeId = 'node-42';
        const rfidUid = 'AABB1122';
        await rfidHandler.authenticate(nodeId, rfidUid);

        // Client should receive rfid_scanned with UID and nodeId
        const scanResult = await waitForMessage(client);
        expect(scanResult.type).toBe('rfid_scanned');
        expect(scanResult.rfidUid).toBe('AABB1122');
        expect(scanResult.nodeId).toBe('node-42');
      } finally {
        client.close();
      }
    });
  });

  describe('Auto-exit after result delivery (Req 4.3)', () => {
    it('should exit scan mode after delivering the scan result', async () => {
      const client = await connectClient(port);

      try {
        // Enter scan mode
        sendMessage(client, { type: 'enter_scan_mode' });
        await waitForMessage(client); // scan_mode_entered

        // Simulate RFID event
        await rfidHandler.authenticate('node-1', 'DEADBEEF');
        await waitForMessage(client); // rfid_scanned

        // Scan mode should now be inactive
        expect(scanModeManager.isActive()).toBe(false);
        expect(scanModeManager.getRequesterId()).toBeNull();

        // A second enter_scan_mode should succeed (not blocked)
        sendMessage(client, { type: 'enter_scan_mode' });
        const secondConfirmation = await waitForMessage(client);
        expect(secondConfirmation.type).toBe('scan_mode_entered');
      } finally {
        client.close();
      }
    });
  });

  describe('Cancel scenario (Req 4.6)', () => {
    it('should exit scan mode when client sends cancel_scan_mode', async () => {
      const client = await connectClient(port);

      try {
        // Enter scan mode
        sendMessage(client, { type: 'enter_scan_mode' });
        const confirmation = await waitForMessage(client);
        expect(confirmation.type).toBe('scan_mode_entered');

        expect(scanModeManager.isActive()).toBe(true);

        // Cancel scan mode
        sendMessage(client, { type: 'cancel_scan_mode' });

        // Give time for the cancel message to be processed
        await delay(100);

        // Scan mode should now be inactive
        expect(scanModeManager.isActive()).toBe(false);
        expect(scanModeManager.getRequesterId()).toBeNull();

        // RFID event should now pass through to normal auth (not intercepted)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await rfidHandler.authenticate('node-5', 'CAFE1234');
        expect(result.intercepted).toBeUndefined();
        warnSpy.mockRestore();
      } finally {
        client.close();
      }
    });
  });

  describe('Disconnect scenario (Req 4.4)', () => {
    it('should auto-exit scan mode when the scan requester disconnects', async () => {
      const client = await connectClient(port);

      // Enter scan mode
      sendMessage(client, { type: 'enter_scan_mode' });
      const confirmation = await waitForMessage(client);
      expect(confirmation.type).toBe('scan_mode_entered');

      expect(scanModeManager.isActive()).toBe(true);

      // Disconnect the client
      client.close();

      // Wait for the disconnect to be processed by the server
      await delay(200);

      // Scan mode should be auto-exited
      expect(scanModeManager.isActive()).toBe(false);
      expect(scanModeManager.getRequesterId()).toBeNull();
    });
  });

  describe('Mutual exclusion: scan_in_progress rejection (Req 4.5)', () => {
    it('should reject a second client entering scan mode while first is active', async () => {
      const client1 = await connectClient(port);
      const client2 = await connectClient(port);

      try {
        // First client enters scan mode
        sendMessage(client1, { type: 'enter_scan_mode' });
        const confirmation1 = await waitForMessage(client1);
        expect(confirmation1.type).toBe('scan_mode_entered');

        // Second client tries to enter scan mode
        sendMessage(client2, { type: 'enter_scan_mode' });
        const rejection = await waitForMessage(client2);
        expect(rejection.type).toBe('scan_in_progress');
        expect(rejection.error).toBe('Another scan is already in progress');
      } finally {
        client1.close();
        client2.close();
      }
    });
  });

  describe('Normal auth resumes after scan mode exit (Req 4.3)', () => {
    it('should not intercept RFID events after scan mode has exited', async () => {
      const client = await connectClient(port);

      try {
        // Enter and then cancel scan mode
        sendMessage(client, { type: 'enter_scan_mode' });
        await waitForMessage(client); // scan_mode_entered

        sendMessage(client, { type: 'cancel_scan_mode' });
        await delay(100);

        // Suppress console output for the auth flow
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        // RFID event should go through normal auth (not intercepted)
        const authResult = await rfidHandler.authenticate('node-7', 'UNKNOWN_UID');

        // The result should NOT be intercepted — it goes through normal auth
        // (which returns access_denied since the mock Firestore has no users)
        expect(authResult.intercepted).toBeUndefined();
        expect(authResult.success).toBe(false);
        expect(authResult.error).toBe('access_denied');

        warnSpy.mockRestore();
      } finally {
        client.close();
      }
    });
  });
});

describe('Scan Mode Timeout (Req 4.7)', () => {
  it('should send scan_mode_timeout after 30 seconds and exit scan mode', async () => {
    const httpServer = createServer();
    const wsServer = new WebSocketServer();
    wsServer.attach(httpServer);

    // Create a ScanModeManager and override the private TIMEOUT_MS to 200ms for fast testing.
    // TypeScript's `private` is compile-time only; we can set it at runtime.
    const scanModeManager = new ScanModeManager();
    (scanModeManager as any).TIMEOUT_MS = 200;

    wsServer.onClientMessage((clientId, message) => {
      if (message.type === 'enter_scan_mode') {
        const entered = scanModeManager.enterScanMode(clientId);
        if (entered) {
          wsServer.sendToClient(clientId, { type: 'scan_mode_entered' });
        } else {
          wsServer.sendToClient(clientId, { type: 'scan_in_progress', error: 'Another scan is already in progress' });
        }
      }
      if (message.type === 'cancel_scan_mode') {
        scanModeManager.exitScanMode();
      }
    });

    scanModeManager.setOnTimeout((requesterId) => {
      wsServer.sendToClient(requesterId, { type: 'scan_mode_timeout' });
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const port = (httpServer.address() as any).port;

    const client = await connectClient(port);

    try {
      // Enter scan mode
      sendMessage(client, { type: 'enter_scan_mode' });

      const confirmation = await waitForMessage(client);
      expect(confirmation.type).toBe('scan_mode_entered');
      expect(scanModeManager.isActive()).toBe(true);

      // Wait for the short timeout (200ms) to fire
      const timeoutMsg = await waitForMessage(client, 2000);
      expect(timeoutMsg.type).toBe('scan_mode_timeout');

      // Scan mode should be inactive
      expect(scanModeManager.isActive()).toBe(false);
    } finally {
      client.close();
      wsServer.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });
});
