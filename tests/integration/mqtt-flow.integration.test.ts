import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

/**
 * MQTT End-to-End Integration Test
 *
 * Validates Requirements 1.1, 1.2:
 * - MqttTransport connects, subscribes, routes telemetry/RFID messages, and publishes commands
 * - Malformed payloads are discarded without invoking handlers
 *
 * The mqtt library is mocked at the module level to simulate broker behavior.
 */

// --- Mock MQTT client that simulates broker behavior ---
class MockMqttClient extends EventEmitter {
  public subscribe = vi.fn();
  public unsubscribe = vi.fn();
  public publish = vi.fn((_topic: string, _payload: string, _opts: any, cb?: (err?: Error) => void) => {
    // Simulate successful ACK by default
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
        // Simulate successful connection on next tick
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

// Import after mock is set up
import { MqttTransport } from '../../src/modules/mqtt-transport/index.js';

describe('MQTT End-to-End Integration', () => {
  let transport: MqttTransport;
  let telemetryHandler: ReturnType<typeof vi.fn>;
  let rfidHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new MqttTransport();
    telemetryHandler = vi.fn();
    rfidHandler = vi.fn();
  });

  afterEach(async () => {
    await transport.disconnect();
  });

  describe('Connection', () => {
    it('should connect to the MQTT broker successfully', async () => {
      await transport.connect();
      // If connect resolves without throwing, connection was successful
      expect(mockClient).toBeDefined();
    });
  });

  describe('Telemetry message processing', () => {
    it('should parse telemetry messages and invoke the telemetry handler with correct nodeId and payload', async () => {
      transport.onTelemetry(telemetryHandler);
      await transport.connect();
      transport.subscribe('node-001');

      // Simulate a valid telemetry message arriving from the broker
      const telemetryData = {
        v: 230.5,
        i: 16.2,
        p: 3734.1,
        f: 50.0,
        pf: 0.98,
        t: 35.2,
        ts: 1700000000,
      };
      const topic = 'alm/node/node-001/telemetry';
      const payload = Buffer.from(JSON.stringify(telemetryData));

      mockClient.emit('message', topic, payload);

      expect(telemetryHandler).toHaveBeenCalledTimes(1);
      expect(telemetryHandler).toHaveBeenCalledWith('node-001', {
        voltage: 230.5,
        current: 16.2,
        power: 3734.1,
        frequency: 50.0,
        powerFactor: 0.98,
        temperature: 35.2,
        timestamp: 1700000000,
      });
    });
  });

  describe('RFID message processing', () => {
    it('should parse RFID messages and invoke the rfid handler with correct nodeId and uid', async () => {
      transport.onRfidScan(rfidHandler);
      await transport.connect();
      transport.subscribe('node-002');

      // Simulate an RFID scan event arriving from the broker
      const rfidData = { uid: 'ABCD1234EF56' };
      const topic = 'alm/node/node-002/rfid';
      const payload = Buffer.from(JSON.stringify(rfidData));

      mockClient.emit('message', topic, payload);

      expect(rfidHandler).toHaveBeenCalledTimes(1);
      expect(rfidHandler).toHaveBeenCalledWith('node-002', 'ABCD1234EF56');
    });
  });

  describe('Command publishing', () => {
    it('should publish commands to the correct topic with QoS 1', async () => {
      await transport.connect();

      const command = {
        relay_state: 'on' as const,
        timestamp: 1700000000,
        reason: 'user' as const,
      };

      const result = await transport.publishCommand('node-003', command);

      expect(result.delivered).toBe(true);
      expect(result.attempts).toBe(1);

      // Verify the publish was called with correct topic and QoS
      expect(mockClient.publish).toHaveBeenCalledWith(
        'alm/node/node-003/command',
        JSON.stringify(command),
        { qos: 1 },
        expect.any(Function),
      );
    });
  });

  describe('Malformed payload handling', () => {
    it('should discard malformed telemetry payloads without calling the handler', async () => {
      transport.onTelemetry(telemetryHandler);
      await transport.connect();
      transport.subscribe('node-004');

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Send invalid JSON
      mockClient.emit('message', 'alm/node/node-004/telemetry', Buffer.from('not-json'));
      expect(telemetryHandler).not.toHaveBeenCalled();

      // Send JSON missing required fields
      mockClient.emit(
        'message',
        'alm/node/node-004/telemetry',
        Buffer.from(JSON.stringify({ v: 230 })),
      );
      expect(telemetryHandler).not.toHaveBeenCalled();

      // Send JSON with non-numeric fields
      mockClient.emit(
        'message',
        'alm/node/node-004/telemetry',
        Buffer.from(JSON.stringify({ v: 'abc', i: 1, p: 1, f: 1, pf: 1, t: 1, ts: 1 })),
      );
      expect(telemetryHandler).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
