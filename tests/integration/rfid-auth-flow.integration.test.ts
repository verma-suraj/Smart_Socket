import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * RFID → Session Flow Integration Test
 *
 * Validates Requirements 6.2, 8.1:
 * - Req 6.2: If RFID_UID matches registered user → assign socket, publish relay-on, create session
 * - Req 8.1: Session record captures user_id, node_id, start_timestamp, session_type, initial parameters
 *
 * Also validates the failure case:
 * - Unregistered RFID UID should NOT trigger relay-on or session creation
 *
 * The test mocks the `mqtt` module and `firebase-admin` Firestore to simulate
 * the full RFID authentication flow through the app's wiring logic.
 */

// --- Mock MQTT client that simulates broker behavior ---
class MockMqttClient extends EventEmitter {
  public subscribe = vi.fn();
  public unsubscribe = vi.fn();
  public publish = vi.fn((_topic: string, _payload: string, _opts: any, cb?: (err?: Error) => void) => {
    if (cb) cb();
  });
  public end = vi.fn((_force: boolean, _opts: any, cb?: () => void) => {
    if (cb) cb();
  });
  public reconnect = vi.fn();
}

let mockClient: MockMqttClient;

// Mock the mqtt module
vi.mock('mqtt', () => {
  return {
    default: {
      connect: vi.fn(() => {
        mockClient = new MockMqttClient();
        setTimeout(() => mockClient.emit('connect'), 0);
        return mockClient;
      }),
    },
    connect: vi.fn(() => {
      mockClient = new MockMqttClient();
      setTimeout(() => mockClient.emit('connect'), 0);
      return mockClient;
    }),
  };
});

/**
 * Creates a mock Firestore that supports both:
 * - collection('users').where(...).limit(1).get() — for RFID auth lookup
 * - collection('x').doc('y').get()/set() — for temperature monitor persistence
 */
function createMockFirestore() {
  const mockDocGet = vi.fn(async () => ({ exists: false, data: () => undefined }));
  const mockDocSet = vi.fn(async () => {});
  const mockDoc = vi.fn(() => ({ get: mockDocGet, set: mockDocSet }));
  const mockGet = vi.fn(async () => ({ empty: true, docs: [] }));
  const mockLimit = vi.fn(() => ({ get: mockGet }));
  const mockWhere = vi.fn(() => ({ limit: mockLimit }));
  const mockCollection = vi.fn((_name: string) => ({
    where: mockWhere,
    limit: mockLimit,
    get: mockGet,
    doc: mockDoc,
  }));

  const firestore: any = {
    collection: mockCollection,
  };

  return { firestore, mockCollection, mockWhere, mockLimit, mockGet, mockDoc };
}

// Import modules after mocks are established
import { MqttTransport } from '../../src/modules/mqtt-transport/index.js';
import { AuthModule } from '../../src/modules/auth/index.js';
import { SessionManager } from '../../src/modules/session-manager/index.js';
import { PriorityCalculator } from '../../src/modules/priority-calculator/index.js';
import { TemperatureMonitor } from '../../src/modules/temperature-monitor/index.js';
import { AlmEngine } from '../../src/modules/alm-engine/index.js';
import { getActiveSessionsMap } from '../../src/modules/session-manager/session-lifecycle.js';
import type { RelayCommand } from '../../src/models/index.js';

describe('RFID → Session Flow Integration', () => {
  let mqttTransport: MqttTransport;
  let authModule: AuthModule;
  let sessionManager: SessionManager;
  let priorityCalculator: PriorityCalculator;
  let temperatureMonitor: TemperatureMonitor;
  let almEngine: AlmEngine;
  let mockFirestore: ReturnType<typeof createMockFirestore>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Clear shared in-memory session state between tests
    getActiveSessionsMap().clear();

    // Create a fresh mock Firestore for each test
    mockFirestore = createMockFirestore();

    // Instantiate modules (mimics app.ts wiring)
    mqttTransport = new MqttTransport();
    temperatureMonitor = new TemperatureMonitor(mockFirestore.firestore);
    almEngine = new AlmEngine(mockFirestore.firestore, temperatureMonitor);
    priorityCalculator = new PriorityCalculator();
    sessionManager = new SessionManager();
    authModule = new AuthModule(mockFirestore.firestore);

    // Wire the RFID handler (same logic as app.ts onRfidScan)
    mqttTransport.onRfidScan(async (nodeId: string, rfidUid: string) => {
      const authResult = await authModule.authenticateRfid(nodeId, rfidUid);

      if (authResult.success && authResult.userId) {
        // Check temperature override before activating
        if (temperatureMonitor.isInOverrideState(nodeId)) {
          return;
        }

        // Publish relay-on command
        const relayOnCommand: RelayCommand = {
          relay_state: 'on',
          timestamp: Date.now(),
          reason: 'auth',
        };
        await mqttTransport.publishCommand(nodeId, relayOnCommand);

        // Look up user profile for session parameters
        const userProfile = await authModule.getUserByRfid(rfidUid);

        const batteryCapacity = userProfile?.batteryCapacity ?? 0;
        const chargerPowerRating = userProfile?.chargerPowerRating ?? 0;
        const initialSOC = 0.20; // config.session.defaultSOC

        // Create a new session
        const session = await sessionManager.createSession({
          userId: authResult.userId,
          nodeId,
          sessionType: 'owner',
          batteryCapacity,
          chargerPowerRating,
          initialSOC,
          guestSpecs: null,
        });

        // Calculate and set priority for ALM
        const priorityScore = priorityCalculator.calculatePriority({
          batteryCapacity,
          initialSOC,
          chargerPowerRating,
          isGuest: false,
          guestSpecsProvided: false,
        });
        almEngine.setNodePriority(nodeId, priorityScore, session.startTimestamp);
      }
    });

    // Connect the transport (uses the mocked mqtt client)
    await mqttTransport.connect();
    mqttTransport.subscribe('node-100');
  });

  afterEach(async () => {
    await mqttTransport.disconnect();
  });

  describe('Registered RFID UID (Requirement 6.2)', () => {
    it('should authenticate, publish relay-on, and create session for a registered user', async () => {
      const testUserId = 'user-abc-123';
      const testRfidUid = 'A1B2C3D4';
      const testNodeId = 'node-100';

      // Configure the mock Firestore to find the user
      const mockUserDoc = {
        id: testUserId,
        data: () => ({
          name: 'Test User',
          evType: '4-wheeler',
          brand: 'Tesla',
          batteryCapacity: 60,
          batteryType: 'Li-ion',
          chargerType: 'Type 2',
          chargerPowerRating: 7.4,
          rfidUids: [testRfidUid],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        exists: true,
      };

      const mockQuerySnapshot = {
        empty: false,
        docs: [mockUserDoc],
      };

      mockFirestore.mockGet.mockResolvedValue(mockQuerySnapshot);

      // Simulate RFID scan message arriving on the MQTT topic
      const rfidPayload = { uid: testRfidUid, ts: Date.now() };
      const topic = `alm/node/${testNodeId}/rfid`;
      const payload = Buffer.from(JSON.stringify(rfidPayload));

      // Emit the message through the mock MQTT client
      mockClient.emit('message', topic, payload);

      // Allow async handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // VERIFY: relay-on command was published
      expect(mockClient.publish).toHaveBeenCalled();
      const publishCall = mockClient.publish.mock.calls[0];
      expect(publishCall[0]).toBe(`alm/node/${testNodeId}/command`);

      const publishedCommand = JSON.parse(publishCall[1]);
      expect(publishedCommand.relay_state).toBe('on');
      expect(publishedCommand.reason).toBe('auth');
      expect(publishedCommand.timestamp).toBeGreaterThan(0);

      // VERIFY: session was created with correct attributes (Requirement 8.1)
      const activeSession = sessionManager.getActiveSession(testNodeId);
      expect(activeSession).not.toBeNull();
      expect(activeSession!.userId).toBe(testUserId);
      expect(activeSession!.nodeId).toBe(testNodeId);
      expect(activeSession!.sessionType).toBe('owner');
      expect(activeSession!.startTimestamp).toBeGreaterThan(0);
      expect(activeSession!.batteryCapacity).toBe(60);
      expect(activeSession!.chargerPowerRating).toBe(7.4);
      expect(activeSession!.initialSOC).toBe(0.20);
      expect(activeSession!.active).toBe(true);

      // VERIFY: priority was set in ALM engine
      const priority = almEngine.getNodePriority(testNodeId);
      // Expected: (60 * (1 - 0.20)) / 7.4 = 48 / 7.4 ≈ 6.486
      expect(priority).toBeCloseTo((60 * 0.80) / 7.4, 2);
    });
  });

  describe('Unregistered RFID UID (Requirement 6.3)', () => {
    it('should NOT publish relay-on or create a session for an unregistered RFID UID', async () => {
      const unknownRfidUid = 'FFFFFFFF';
      const testNodeId = 'node-100';

      // Configure Firestore to return empty results (user not found)
      const mockQuerySnapshot = {
        empty: true,
        docs: [],
      };

      mockFirestore.mockGet.mockResolvedValue(mockQuerySnapshot);

      // Suppress console output for denied access log
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Simulate RFID scan message with an unregistered UID
      const rfidPayload = { uid: unknownRfidUid, ts: Date.now() };
      const topic = `alm/node/${testNodeId}/rfid`;
      const payload = Buffer.from(JSON.stringify(rfidPayload));

      mockClient.emit('message', topic, payload);

      // Allow async handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // VERIFY: No relay-on command was published
      expect(mockClient.publish).not.toHaveBeenCalled();

      // VERIFY: No session was created
      const activeSession = sessionManager.getActiveSession(testNodeId);
      expect(activeSession).toBeNull();

      // VERIFY: No priority was set in ALM engine
      const priority = almEngine.getNodePriority(testNodeId);
      expect(priority).toBe(0);

      warnSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('Temperature override blocks activation', () => {
    it('should NOT activate relay even for a registered user if node is in temperature override', async () => {
      const testUserId = 'user-xyz-789';
      const testRfidUid = 'DEAD1234';
      const testNodeId = 'node-100';

      // Put the node in temperature override state by simulating a high temp reading
      temperatureMonitor.checkTemperature(testNodeId, 45);

      // Configure Firestore to find the user
      const mockUserDoc = {
        id: testUserId,
        data: () => ({
          name: 'Hot Node User',
          evType: '2-wheeler',
          brand: 'Ola',
          batteryCapacity: 3,
          batteryType: 'Li-ion',
          chargerType: 'Type 1',
          chargerPowerRating: 1.5,
          rfidUids: [testRfidUid],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        exists: true,
      };

      const mockQuerySnapshot = {
        empty: false,
        docs: [mockUserDoc],
      };

      mockFirestore.mockGet.mockResolvedValue(mockQuerySnapshot);

      // Suppress console output
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Simulate RFID scan
      const rfidPayload = { uid: testRfidUid, ts: Date.now() };
      const topic = `alm/node/${testNodeId}/rfid`;
      const payload = Buffer.from(JSON.stringify(rfidPayload));

      mockClient.emit('message', topic, payload);

      // Allow async handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // VERIFY: No relay-on command published (temperature override blocks it)
      expect(mockClient.publish).not.toHaveBeenCalled();

      // VERIFY: No session created
      const activeSession = sessionManager.getActiveSession(testNodeId);
      expect(activeSession).toBeNull();

      logSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});
