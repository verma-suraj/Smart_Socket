import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { MqttPublisher } from '../../src/modules/mqtt-transport/publisher.js';
import type { MqttClient } from 'mqtt';
import type { RelayCommand } from '../../src/models/index.js';

/**
 * Property-based tests for command message format and retry logic.
 * Validates: Requirements 10.1, 10.2, 10.3
 *
 * Property 19: Command Message Format and Retry
 * For any relay command issued to a node, the published MQTT message SHALL use
 * topic `alm/node/{node_id}/command` with QoS 1, and if not acknowledged within
 * 5 seconds, SHALL retry up to 3 times before logging failure. The total attempts
 * SHALL never exceed 4 (1 initial + 3 retries).
 */

// Arbitrary for valid node IDs (alphanumeric + hyphens, 1-50 chars)
const nodeIdArb = fc.stringOf(
  fc.oneof(fc.char().filter((c) => /[a-zA-Z0-9\-_]/.test(c))),
  { minLength: 1, maxLength: 50 }
);

// Arbitrary for relay state
const relayStateArb = fc.oneof(
  fc.constant('on' as const),
  fc.constant('off' as const)
);

// Arbitrary for command reason
const reasonArb = fc.oneof(
  fc.constant('alm' as const),
  fc.constant('safety' as const),
  fc.constant('user' as const),
  fc.constant('auth' as const)
);

// Arbitrary for a valid RelayCommand
const relayCommandArb = fc.record({
  relay_state: relayStateArb,
  timestamp: fc.integer({ min: 1_000_000_000, max: 2_000_000_000 }),
  reason: reasonArb,
});

/**
 * Helper: creates a mock MqttClient that captures publish calls.
 * publishBehavior controls whether each attempt succeeds or times out.
 */
function createCapturingMockClient(
  publishBehavior: (callIndex: number, cb: (err?: Error | null) => void) => void
): { client: MqttClient; calls: Array<{ topic: string; payload: string; opts: { qos: number } }> } {
  const calls: Array<{ topic: string; payload: string; opts: { qos: number } }> = [];
  let callIndex = 0;

  const mockPublish = vi.fn((topic: string, payload: string, opts: any, cb: (err?: Error | null) => void) => {
    calls.push({ topic, payload, opts: { qos: opts.qos } });
    publishBehavior(callIndex++, cb);
  });

  const client = { publish: mockPublish } as unknown as MqttClient;
  return { client, calls };
}

describe('Feature: smart-socket-backend, Property 19: Command Message Format and Retry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any valid node_id, the published message uses topic `alm/node/{node_id}/command`.
   */
  it('publishes to correct topic format alm/node/{node_id}/command for any node_id', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        relayCommandArb,
        (nodeId, command) => {
          const { client, calls } = createCapturingMockClient((_idx, cb) => {
            cb(null); // Immediate success
          });
          const publisher = new MqttPublisher(client);

          // Fire and forget — synchronous callback resolves immediately
          publisher.publish(nodeId, command);

          expect(calls.length).toBeGreaterThanOrEqual(1);
          expect(calls[0].topic).toBe(`alm/node/${nodeId}/command`);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.2**
   *
   * All command publishes use QoS level 1.
   */
  it('all publish calls use QoS level 1', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        relayCommandArb,
        (nodeId, command) => {
          const { client, calls } = createCapturingMockClient((_idx, cb) => {
            cb(null); // Immediate success
          });
          const publisher = new MqttPublisher(client);

          publisher.publish(nodeId, command);

          for (const call of calls) {
            expect(call.opts.qos).toBe(1);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * The published payload is valid JSON containing relay_state ("on"|"off"),
   * timestamp (number), and reason ("alm"|"safety"|"user"|"auth").
   */
  it('published payload is valid JSON with correct RelayCommand structure', () => {
    fc.assert(
      fc.property(
        nodeIdArb,
        relayCommandArb,
        (nodeId, command) => {
          const { client, calls } = createCapturingMockClient((_idx, cb) => {
            cb(null);
          });
          const publisher = new MqttPublisher(client);

          publisher.publish(nodeId, command);

          expect(calls.length).toBeGreaterThanOrEqual(1);

          const parsed = JSON.parse(calls[0].payload);
          expect(parsed.relay_state).toBe(command.relay_state);
          expect(['on', 'off']).toContain(parsed.relay_state);
          expect(parsed.timestamp).toBe(command.timestamp);
          expect(typeof parsed.timestamp).toBe('number');
          expect(parsed.reason).toBe(command.reason);
          expect(['alm', 'safety', 'user', 'auth']).toContain(parsed.reason);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.3**
   *
   * For any sequence of failures, the total attempts SHALL never exceed 4
   * (1 initial + 3 retries).
   */
  it('total attempts never exceed 4 regardless of failure pattern', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        relayCommandArb,
        // Generate a random failure pattern (true=timeout, false=error callback)
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        async (nodeId, command, failureTypes) => {
          const { client, calls } = createCapturingMockClient((idx, cb) => {
            // All attempts fail — either via timeout or error
            if (failureTypes[idx]) {
              // Timeout: don't call cb
            } else {
              cb(new Error('Network error'));
            }
          });
          const publisher = new MqttPublisher(client);

          const resultPromise = publisher.publish(nodeId, command);

          // Advance timers enough for all potential timeout attempts
          for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(5000);
          }

          const result = await resultPromise;

          expect(result.attempts).toBeLessThanOrEqual(4);
          expect(result.delivered).toBe(false);
          expect(calls.length).toBeLessThanOrEqual(4);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.3**
   *
   * If any attempt succeeds, no further retries are made and delivered=true is returned.
   */
  it('successful delivery stops retries immediately', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        relayCommandArb,
        // Which attempt succeeds (0-indexed): 0=first, 1=second, 2=third, 3=fourth
        fc.integer({ min: 0, max: 3 }),
        async (nodeId, command, successAttemptIdx) => {
          const { client, calls } = createCapturingMockClient((idx, cb) => {
            if (idx === successAttemptIdx) {
              cb(null); // Success on this attempt
            }
            // Otherwise: timeout (don't call cb)
          });
          const publisher = new MqttPublisher(client);

          const resultPromise = publisher.publish(nodeId, command);

          // Advance timers for each attempt that times out before success
          for (let i = 0; i < successAttemptIdx; i++) {
            await vi.advanceTimersByTimeAsync(5000);
          }

          const result = await resultPromise;

          expect(result.delivered).toBe(true);
          expect(result.attempts).toBe(successAttemptIdx + 1);
          // No more publishes after success
          expect(calls.length).toBe(successAttemptIdx + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.3**
   *
   * If all attempts fail, delivered=false and attempts=4 is returned.
   */
  it('returns delivered=false with attempts=4 when all attempts fail', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodeIdArb,
        relayCommandArb,
        async (nodeId, command) => {
          const { client, calls } = createCapturingMockClient((_idx, _cb) => {
            // Never call cb — all attempts timeout
          });
          const publisher = new MqttPublisher(client);

          const resultPromise = publisher.publish(nodeId, command);

          // Advance timers for all 4 attempts × 5000ms
          for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(5000);
          }

          const result = await resultPromise;

          expect(result.delivered).toBe(false);
          expect(result.attempts).toBe(4);
          expect(calls.length).toBe(4);
        }
      ),
      { numRuns: 100 }
    );
  });
});
