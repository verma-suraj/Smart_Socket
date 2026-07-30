import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MqttPublisher } from '../../src/modules/mqtt-transport/publisher.js';
import type { MqttClient } from 'mqtt';
import type { RelayCommand } from '../../src/models/index.js';

function createMockClient(publishBehavior?: (topic: string, payload: string, opts: any, cb: (err?: Error | null) => void) => void): MqttClient {
  const mockPublish = vi.fn();
  if (publishBehavior) {
    mockPublish.mockImplementation(publishBehavior);
  }
  return {
    publish: mockPublish,
  } as unknown as MqttClient;
}

const sampleCommand: RelayCommand = {
  relay_state: 'on',
  timestamp: 1700000000,
  reason: 'user',
};

describe('MqttPublisher', () => {
  describe('publish - successful delivery', () => {
    it('should return delivered=true and attempts=1 on immediate ACK', async () => {
      const client = createMockClient((_topic, _payload, _opts, cb) => {
        cb(null); // Immediate ACK
      });
      const publisher = new MqttPublisher(client);

      const result = await publisher.publish('node-001', sampleCommand);

      expect(result.delivered).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.timestamp).toBeGreaterThan(0);
    });

    it('should publish to the correct topic', async () => {
      const client = createMockClient((_topic, _payload, _opts, cb) => {
        cb(null);
      });
      const publisher = new MqttPublisher(client);

      await publisher.publish('node-001', sampleCommand);

      expect(client.publish).toHaveBeenCalledWith(
        'alm/node/node-001/command',
        JSON.stringify(sampleCommand),
        { qos: 1 },
        expect.any(Function)
      );
    });

    it('should publish with QoS 1', async () => {
      const client = createMockClient((_topic, _payload, opts, cb) => {
        expect(opts.qos).toBe(1);
        cb(null);
      });
      const publisher = new MqttPublisher(client);

      await publisher.publish('node-001', sampleCommand);
    });
  });

  describe('publish - retry on timeout', () => {
    it('should retry up to 3 times on timeout and return delivered=false', async () => {
      vi.useFakeTimers();

      const client = createMockClient((_topic, _payload, _opts, _cb) => {
        // Never call callback — simulates timeout
      });
      const publisher = new MqttPublisher(client);

      const resultPromise = publisher.publish('node-001', sampleCommand);

      // Advance through all 4 attempts (1 initial + 3 retries) × 5000ms each
      for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(5000);
      }

      const result = await resultPromise;

      expect(result.delivered).toBe(false);
      expect(result.attempts).toBe(4); // 1 initial + 3 retries
      expect(client.publish).toHaveBeenCalledTimes(4);

      vi.useRealTimers();
    });

    it('should succeed on retry if ACK arrives on second attempt', async () => {
      let callCount = 0;
      vi.useFakeTimers();

      const client = createMockClient((_topic, _payload, _opts, cb) => {
        callCount++;
        if (callCount === 2) {
          cb(null); // ACK on second attempt
        }
        // First attempt: no callback (timeout)
      });
      const publisher = new MqttPublisher(client);

      const resultPromise = publisher.publish('node-001', sampleCommand);

      // First attempt times out
      await vi.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;

      expect(result.delivered).toBe(true);
      expect(result.attempts).toBe(2);

      vi.useRealTimers();
    });
  });

  describe('publish - error handling', () => {
    it('should treat publish error as failed attempt and retry', async () => {
      let callCount = 0;
      vi.useFakeTimers();

      const client = createMockClient((_topic, _payload, _opts, cb) => {
        callCount++;
        if (callCount === 1) {
          cb(new Error('Network error')); // First attempt fails
        } else if (callCount === 2) {
          cb(null); // Second attempt succeeds
        }
      });
      const publisher = new MqttPublisher(client);

      const resultPromise = publisher.publish('node-001', sampleCommand);
      const result = await resultPromise;

      expect(result.delivered).toBe(true);
      expect(result.attempts).toBe(2);

      vi.useRealTimers();
    });

    it('should return delivered=false if all attempts fail with errors', async () => {
      const client = createMockClient((_topic, _payload, _opts, cb) => {
        cb(new Error('Network error'));
      });
      const publisher = new MqttPublisher(client);

      const result = await publisher.publish('node-001', sampleCommand);

      expect(result.delivered).toBe(false);
      expect(result.attempts).toBe(4);
    });
  });
});
