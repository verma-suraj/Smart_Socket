import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MqttConnectionManager } from '../../src/modules/mqtt-transport/connection-manager.js';

/**
 * Property-based tests for reconnection exponential backoff.
 * Validates: Requirements 1.3
 *
 * Property 3: Reconnection Exponential Backoff
 * For any number of consecutive connection failures N (where N ≥ 1),
 * the computed reconnection delay SHALL equal min(2^N × baseDelay, maxDelay),
 * following an exponential backoff pattern with a defined ceiling.
 */

describe('Feature: smart-socket-backend, Property 3: Reconnection Exponential Backoff', () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any attempt N ≥ 1, the delay equals min(2^N × baseDelay, maxDelay).
   */
  it('computes delay as min(2^N × baseDelay, maxDelay) for any attempt N ≥ 1', () => {
    fc.assert(
      fc.property(
        // attempt: N ≥ 1
        fc.integer({ min: 1, max: 20 }),
        // baseDelay: positive integer in ms (100ms to 5000ms)
        fc.integer({ min: 100, max: 5000 }),
        // maxDelay: must be ≥ baseDelay (up to 120000ms)
        fc.integer({ min: 100, max: 120000 }),
        (attempt, baseDelay, maxDelayCandidate) => {
          // Ensure maxDelay >= baseDelay
          const maxDelay = Math.max(maxDelayCandidate, baseDelay);

          const manager = new MqttConnectionManager({
            brokerUrl: 'mqtt://localhost:1883',
            baseDelay,
            maxDelay,
          });

          const actual = manager.calculateBackoffDelay(attempt);
          const expected = Math.min(Math.pow(2, attempt) * baseDelay, maxDelay);

          expect(actual).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * The delay is always ≥ baseDelay for N ≥ 1 (since 2^N ≥ 2 for N ≥ 1,
   * and min(..., maxDelay) with maxDelay ≥ baseDelay guarantees this).
   */
  it('delay is always >= baseDelay for any attempt N >= 1 with baseDelay > 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 5000 }),
        fc.integer({ min: 1, max: 120000 }),
        (attempt, baseDelay, maxDelayCandidate) => {
          const maxDelay = Math.max(maxDelayCandidate, baseDelay);

          const manager = new MqttConnectionManager({
            brokerUrl: 'mqtt://localhost:1883',
            baseDelay,
            maxDelay,
          });

          const actual = manager.calculateBackoffDelay(attempt);

          // 2^N >= 2 for N >= 1, so 2^N * baseDelay >= 2 * baseDelay >= baseDelay
          // min(2^N * baseDelay, maxDelay) >= baseDelay since maxDelay >= baseDelay
          expect(actual).toBeGreaterThanOrEqual(baseDelay);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * The delay never exceeds maxDelay, providing the defined ceiling.
   */
  it('delay never exceeds maxDelay for any attempt', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 100, max: 120000 }),
        (attempt, baseDelay, maxDelayCandidate) => {
          const maxDelay = Math.max(maxDelayCandidate, baseDelay);

          const manager = new MqttConnectionManager({
            brokerUrl: 'mqtt://localhost:1883',
            baseDelay,
            maxDelay,
          });

          const actual = manager.calculateBackoffDelay(attempt);

          expect(actual).toBeLessThanOrEqual(maxDelay);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3**
   *
   * The delay is monotonically non-decreasing as N increases (until capped at maxDelay).
   * For any two attempts N1 < N2, delay(N2) >= delay(N1).
   */
  it('delay is monotonically non-decreasing as attempt number increases', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 19 }),
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 100, max: 120000 }),
        (attempt, baseDelay, maxDelayCandidate) => {
          const maxDelay = Math.max(maxDelayCandidate, baseDelay);
          const nextAttempt = attempt + 1;

          const manager = new MqttConnectionManager({
            brokerUrl: 'mqtt://localhost:1883',
            baseDelay,
            maxDelay,
          });

          const delayCurrent = manager.calculateBackoffDelay(attempt);
          const delayNext = manager.calculateBackoffDelay(nextAttempt);

          expect(delayNext).toBeGreaterThanOrEqual(delayCurrent);
        }
      ),
      { numRuns: 100 }
    );
  });
});
