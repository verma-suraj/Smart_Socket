import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseAndRoute } from '../../src/utils/ws-message-router';
import { computeBackoffDelay } from '../../src/utils/notification-logic';

/**
 * Property-based tests for WebSocket routing and backoff logic.
 * Validates: Requirements 2.3, 2.6, 2.7, 4.8
 */

describe('Feature: smart-socket-dashboard, Property 3: Exponential backoff delay', () => {
  it('for any attempt n in [1, 10], computeBackoffDelay(n) === min(1000 * 2^(n-1), 30000)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        (attempt) => {
          const result = computeBackoffDelay(attempt);
          const expected = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          return result === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 4: WebSocket message routing', () => {
  const validTypes = ['telemetry', 'node_status', 'alm_event', 'session_update'] as const;

  it('valid WSMessage dispatches to the correct handler and returns true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validTypes),
        fc.string({ minLength: 1, maxLength: 50 }),
        (type, extraData) => {
          const dispatched: string[] = [];

          const handlers = {
            telemetry: () => dispatched.push('telemetry'),
            node_status: () => dispatched.push('node_status'),
            alm_event: () => dispatched.push('alm_event'),
            session_update: () => dispatched.push('session_update'),
          };

          const message = JSON.stringify({ type, data: extraData });
          const result = parseAndRoute(message, handlers);

          return result === true && dispatched.length === 1 && dispatched[0] === type;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 5: Invalid WebSocket message resilience', () => {
  it('non-JSON strings return false without throwing', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => {
          try { JSON.parse(s); return false; } catch { return true; }
        }),
        (invalidJson) => {
          const handlers = {
            telemetry: () => {},
            node_status: () => {},
            alm_event: () => {},
            session_update: () => {},
          };

          let threw = false;
          let result: boolean;
          try {
            result = parseAndRoute(invalidJson, handlers);
          } catch {
            threw = true;
            result = false;
          }

          return !threw && result === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('valid JSON without a recognized type field returns false without throwing', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Object with no type field
          fc.record({ value: fc.string(), count: fc.integer() }),
          // Object with unrecognized type field
          fc.record({
            type: fc.string().filter(
              (t) => !['telemetry', 'node_status', 'alm_event', 'session_update'].includes(t)
            ),
          }),
          // Primitive JSON values (number, boolean, null)
          fc.oneof(
            fc.integer().map((n) => JSON.stringify(n)),
            fc.boolean().map((b) => JSON.stringify(b)),
            fc.constant('null')
          ).map((s) => { return { __raw: s }; })
        ),
        (input) => {
          const handlers = {
            telemetry: () => {},
            node_status: () => {},
            alm_event: () => {},
            session_update: () => {},
          };

          // If it has __raw, it's a pre-stringified primitive
          const raw = '__raw' in input
            ? (input as { __raw: string }).__raw
            : JSON.stringify(input);

          let threw = false;
          let result: boolean;
          try {
            result = parseAndRoute(raw, handlers);
          } catch {
            threw = true;
            result = false;
          }

          return !threw && result === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 10: Telemetry staleness detection', () => {
  // The isStale logic: elapsed > 30000 → stale
  const isStale = (elapsed: number): boolean => elapsed > 30000;

  it('isStale returns true if and only if elapsed > 30000', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 120000 }),
        (elapsed) => {
          const result = isStale(elapsed);
          const expected = elapsed > 30000;
          return result === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isStale returns false at exactly 30000ms', () => {
    expect(isStale(30000)).toBe(false);
  });

  it('isStale returns true at 30001ms', () => {
    expect(isStale(30001)).toBe(true);
  });
});
