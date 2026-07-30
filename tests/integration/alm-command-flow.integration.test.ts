import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * ALM → MQTT Command Flow Integration Test
 *
 * Validates Requirements 4.2, 4.3, 10.1:
 * - Req 4.2: When total load exceeds threshold, identify lowest-priority active socket and publish relay-off
 * - Req 4.3: Repeat shedding until load falls at or below threshold
 * - Req 10.1: Commands published to correct MQTT topic with QoS 1 and proper payload format
 *
 * The test wires the telemetry handler manually (same logic as app.ts),
 * simulates high-power telemetry, and verifies relay-off commands are published.
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
 * Creates a mock Firestore that supports:
 * - collection('config').doc('alm').get()/set() — for threshold persistence
 * - collection('x').where(...).limit(1).get() — for general lookups
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

  return { firestore, mockCollection, mockWhere, mockLimit, mockGet, mockDoc, mockDocGet, mockDocSet };
}

// Import modules after mocks are established
import { MqttTransport } from '../../src/modules/mqtt-transport/index.js';
import { TemperatureMonitor } from '../../src/modules/temperature-monitor/index.js';
import { AlmEngine } from '../../src/modules/alm-engine/index.js';
import { SessionManager } from '../../src/modules/session-manager/index.js';
import { getActiveSessionsMap } from '../../src/modules/session-manager/session-lifecycle.js';
import type { TelemetryPayload, RelayCommand } from '../../src/models/index.js';

describe('ALM → MQTT Command Flow Integration', () => {
  let mqttTransport: MqttTransport;
  let temperatureMonitor: TemperatureMonitor;
  let almEngine: AlmEngine;
  let sessionManager: SessionManager;
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
    sessionManager = new SessionManager();

    // Wire the telemetry handler (same logic as app.ts onTelemetry)
    mqttTransport.onTelemetry(async (nodeId: string, payload: TelemetryPayload) => {
      // (1) Temperature safety check
      const safetyAction = temperatureMonitor.checkTemperature(nodeId, payload.temperature);

      if (safetyAction.action === 'shutdown') {
        const shutdownCommand: RelayCommand = {
          relay_state: 'off',
          timestamp: Date.now(),
          reason: 'safety',
        };
        await mqttTransport.publishCommand(nodeId, shutdownCommand);
        return;
      }

      // (2) Update ALM load and evaluate shedding
      almEngine.updateLoad(nodeId, payload.power);

      const shedResults = await almEngine.evaluateAndShed();
      for (const shed of shedResults) {
        const shedCommand: RelayCommand = {
          relay_state: 'off',
          timestamp: Date.now(),
          reason: 'alm',
        };
        await mqttTransport.publishCommand(shed.nodeId, shedCommand);

        // Finalize the shed session if one exists
        const shedSession = sessionManager.getActiveSession(shed.nodeId);
        if (shedSession) {
          await sessionManager.finalizeSession(shed.nodeId, 'alm_override');
          almEngine.removeNodePriority(shed.nodeId);
        }
      }
    });

    // Connect the transport (uses the mocked mqtt client)
    await mqttTransport.connect();

    // Subscribe to test node topics
    mqttTransport.subscribe('node-A');
    mqttTransport.subscribe('node-B');
    mqttTransport.subscribe('node-C');
  });

  afterEach(async () => {
    await mqttTransport.disconnect();
  });

  describe('Single node shedding (Requirement 4.2)', () => {
    it('should publish relay-off command to lowest-priority node when load exceeds threshold', async () => {
      // Setup: 3 nodes with different priorities (lower score = lower priority = shed first)
      // node-A: priority 2 (lowest — should be shed first)
      // node-B: priority 5
      // node-C: priority 8 (highest — shed last)
      almEngine.setNodePriority('node-A', 2, Date.now() - 3000);
      almEngine.setNodePriority('node-B', 5, Date.now() - 2000);
      almEngine.setNodePriority('node-C', 8, Date.now() - 1000);

      // Set threshold low: 5000W
      await almEngine.setThreshold(5000);

      // Register initial loads for all nodes (total = 4500W, below threshold)
      almEngine.updateLoad('node-A', 1500);
      almEngine.updateLoad('node-B', 1500);
      almEngine.updateLoad('node-C', 1500);

      // Simulate telemetry from node-C that pushes total above threshold
      // New total: 1500 + 1500 + 3000 = 6000W > 5000W threshold
      const telemetryData = {
        v: 230.5,
        i: 13.0,
        p: 3000,
        f: 50.0,
        pf: 0.98,
        t: 35.0,
        ts: Date.now(),
      };
      const topic = 'alm/node/node-C/telemetry';
      const payload = Buffer.from(JSON.stringify(telemetryData));

      mockClient.emit('message', topic, payload);

      // Allow async handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // VERIFY: relay-off command was published to the lowest-priority node (node-A)
      expect(mockClient.publish).toHaveBeenCalled();

      const publishCall = mockClient.publish.mock.calls[0];
      expect(publishCall[0]).toBe('alm/node/node-A/command');

      const publishedCommand = JSON.parse(publishCall[1]);
      expect(publishedCommand.relay_state).toBe('off');
      expect(publishedCommand.reason).toBe('alm');
      expect(publishedCommand.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Multiple nodes shed until below threshold (Requirement 4.3)', () => {
    it('should shed multiple nodes in priority order until load falls below threshold', async () => {
      // Setup: 3 nodes with different priorities
      // node-A: priority 2 (lowest — shed first)
      // node-B: priority 5 (shed second)
      // node-C: priority 8 (highest)
      almEngine.setNodePriority('node-A', 2, Date.now() - 3000);
      almEngine.setNodePriority('node-B', 5, Date.now() - 2000);
      almEngine.setNodePriority('node-C', 8, Date.now() - 1000);

      // Set threshold very low: 2000W so that multiple nodes need to be shed
      await almEngine.setThreshold(2000);

      // Register initial loads for all nodes (total = 4500W, already above threshold)
      almEngine.updateLoad('node-A', 1500);
      almEngine.updateLoad('node-B', 1500);
      almEngine.updateLoad('node-C', 1500);

      // Simulate telemetry from node-C that keeps total high
      // After update: node-A=1500, node-B=1500, node-C=2500 → total = 5500W >> 2000W
      // Shedding node-A (1500W) → remaining 4000W, still > 2000W
      // Shedding node-B (1500W) → remaining 2500W, still > 2000W
      // Shedding node-C (2500W) → remaining 0W, ≤ 2000W — but node-C was updated in this telemetry
      // Actually: after shedding node-A → total = 4000, after shedding node-B → total = 2500, still > 2000
      // Need to shed node-C as well... Let's use a better threshold that demonstrates multi-shed

      // Better scenario: threshold = 3000W, total after update = 5500W
      // Shed node-A (1500W) → total = 4000W, still > 3000W
      // Shed node-B (1500W) → total = 2500W, ≤ 3000W → done
      await almEngine.setThreshold(3000);

      const telemetryData = {
        v: 230.5,
        i: 10.87,
        p: 2500,
        f: 50.0,
        pf: 0.98,
        t: 34.0,
        ts: Date.now(),
      };
      const topic = 'alm/node/node-C/telemetry';
      const payload = Buffer.from(JSON.stringify(telemetryData));

      mockClient.emit('message', topic, payload);

      // Allow async handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // VERIFY: relay-off commands published to node-A first, then node-B
      expect(mockClient.publish).toHaveBeenCalledTimes(2);

      // First shed: node-A (lowest priority = 2)
      const firstCall = mockClient.publish.mock.calls[0];
      expect(firstCall[0]).toBe('alm/node/node-A/command');
      const firstCommand = JSON.parse(firstCall[1]);
      expect(firstCommand.relay_state).toBe('off');
      expect(firstCommand.reason).toBe('alm');

      // Second shed: node-B (next lowest priority = 5)
      const secondCall = mockClient.publish.mock.calls[1];
      expect(secondCall[0]).toBe('alm/node/node-B/command');
      const secondCommand = JSON.parse(secondCall[1]);
      expect(secondCommand.relay_state).toBe('off');
      expect(secondCommand.reason).toBe('alm');
    });
  });

  describe('Correct MQTT topic and QoS (Requirement 10.1)', () => {
    it('should publish commands with correct topic format and QoS 1', async () => {
      // Setup: single node that will be shed
      almEngine.setNodePriority('node-A', 2, Date.now() - 1000);

      // Set threshold low
      await almEngine.setThreshold(1000);

      // Initial load below threshold
      almEngine.updateLoad('node-A', 800);

      // Simulate telemetry that pushes above threshold
      // Total after update: 2000W > 1000W
      const telemetryData = {
        v: 230.5,
        i: 8.7,
        p: 2000,
        f: 50.0,
        pf: 0.98,
        t: 30.0,
        ts: Date.now(),
      };
      const topic = 'alm/node/node-A/telemetry';
      const payload = Buffer.from(JSON.stringify(telemetryData));

      mockClient.emit('message', topic, payload);

      // Allow async handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // VERIFY: publish was called
      expect(mockClient.publish).toHaveBeenCalled();

      const publishCall = mockClient.publish.mock.calls[0];

      // VERIFY: topic format is alm/node/{node_id}/command
      expect(publishCall[0]).toBe('alm/node/node-A/command');

      // VERIFY: QoS 1 is used
      expect(publishCall[2]).toEqual({ qos: 1 });

      // VERIFY: command payload format
      const publishedCommand = JSON.parse(publishCall[1]);
      expect(publishedCommand).toMatchObject({
        relay_state: 'off',
        reason: 'alm',
      });
      expect(publishedCommand.timestamp).toBeTypeOf('number');
      expect(publishedCommand.timestamp).toBeGreaterThan(0);
    });
  });

  describe('No shedding when load is below threshold', () => {
    it('should NOT publish relay-off commands when total load stays below threshold', async () => {
      // Setup: 3 nodes with priorities
      almEngine.setNodePriority('node-A', 2, Date.now() - 3000);
      almEngine.setNodePriority('node-B', 5, Date.now() - 2000);
      almEngine.setNodePriority('node-C', 8, Date.now() - 1000);

      // Set threshold HIGH: 20000W (well above any telemetry)
      await almEngine.setThreshold(20000);

      // Register initial loads
      almEngine.updateLoad('node-A', 1500);
      almEngine.updateLoad('node-B', 1500);
      almEngine.updateLoad('node-C', 1500);

      // Simulate moderate telemetry — total will be 1500 + 1500 + 2000 = 5000W < 20000W
      const telemetryData = {
        v: 230.5,
        i: 8.7,
        p: 2000,
        f: 50.0,
        pf: 0.98,
        t: 32.0,
        ts: Date.now(),
      };
      const topic = 'alm/node/node-C/telemetry';
      const payload = Buffer.from(JSON.stringify(telemetryData));

      mockClient.emit('message', topic, payload);

      // Allow async handlers to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // VERIFY: No relay-off commands were published
      expect(mockClient.publish).not.toHaveBeenCalled();
    });
  });
});
