import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseTelemetryPayload } from '../../src/modules/mqtt-transport/payload-parser.js';

/**
 * Property-based tests for the telemetry payload parser.
 * Validates: Requirements 1.1, 1.4, 1.5
 */

describe('Feature: smart-socket-backend, Property 1: Telemetry Parsing Round-Trip', () => {
  /**
   * **Validates: Requirements 1.1, 1.5**
   *
   * For any valid telemetry JSON payload with fields (v, i, p, f, pf, t, ts),
   * parsing the payload SHALL produce a structured TelemetryPayload object where
   * each field matches the original JSON value exactly — including using the
   * measured power `p` directly rather than computing V×I.
   */
  it('parsing a valid telemetry payload produces a TelemetryPayload with exact field values', () => {
    // Use a generator that avoids -0 since JSON.stringify(-0) === "0" and JSON.parse("0") === +0.
    // This is a JSON limitation, not a parser bug.
    const numArb = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
      .map((n) => (Object.is(n, -0) ? 0 : n));

    fc.assert(
      fc.property(
        fc.record({
          v: numArb,
          i: numArb,
          p: numArb,
          f: numArb,
          pf: numArb,
          t: numArb,
          ts: numArb,
        }),
        (input) => {
          const jsonStr = JSON.stringify(input);
          const result = parseTelemetryPayload(jsonStr);

          // Must succeed
          expect(result.success).toBe(true);
          if (!result.success) return;

          // Each field maps correctly
          expect(result.payload.voltage).toBe(input.v);
          expect(result.payload.current).toBe(input.i);
          expect(result.payload.power).toBe(input.p);
          expect(result.payload.frequency).toBe(input.f);
          expect(result.payload.powerFactor).toBe(input.pf);
          expect(result.payload.temperature).toBe(input.t);
          expect(result.payload.timestamp).toBe(input.ts);

          // Power is used directly from payload, NOT computed as V×I
          expect(result.payload.power).toBe(input.p);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('parsing a valid telemetry payload as Buffer produces same result as string', () => {
    const numArb = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })
      .map((n) => (Object.is(n, -0) ? 0 : n));

    fc.assert(
      fc.property(
        fc.record({
          v: numArb,
          i: numArb,
          p: numArb,
          f: numArb,
          pf: numArb,
          t: numArb,
          ts: numArb,
        }),
        (input) => {
          const jsonStr = JSON.stringify(input);
          const resultStr = parseTelemetryPayload(jsonStr);
          const resultBuf = parseTelemetryPayload(Buffer.from(jsonStr, 'utf-8'));

          expect(resultStr).toEqual(resultBuf);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-backend, Property 2: Malformed Payload Rejection', () => {
  /**
   * **Validates: Requirements 1.4**
   *
   * For any JSON payload that is missing one or more required telemetry fields
   * (v, i, p, f, pf, t, ts) or contains non-numeric values for those fields,
   * the parser SHALL reject the payload and return an error indicator without
   * storing any data.
   */

  const REQUIRED_FIELDS = ['v', 'i', 'p', 'f', 'pf', 't', 'ts'] as const;

  it('rejects payloads with one or more missing required fields', () => {
    fc.assert(
      fc.property(
        // Generate a subset of fields to REMOVE (at least 1)
        fc.subarray(REQUIRED_FIELDS as unknown as string[], { minLength: 1 }),
        fc.record({
          v: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          i: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          p: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          f: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          pf: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          t: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          ts: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        }),
        (fieldsToRemove, fullPayload) => {
          // Create a copy and remove selected fields
          const malformed: Record<string, unknown> = { ...fullPayload };
          for (const field of fieldsToRemove) {
            delete malformed[field];
          }

          const result = parseTelemetryPayload(JSON.stringify(malformed));

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBeTruthy();
            expect(typeof result.error).toBe('string');
            expect(result.error.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects payloads with non-numeric values in required fields', () => {
    // Arbitrary for non-numeric JSON values
    const nonNumericArb = fc.oneof(
      fc.string(),
      fc.boolean(),
      fc.constant(null),
      fc.array(fc.integer()),
      fc.dictionary(fc.string(), fc.integer())
    );

    fc.assert(
      fc.property(
        // Pick at least one field to corrupt
        fc.subarray(REQUIRED_FIELDS as unknown as string[], { minLength: 1 }),
        nonNumericArb,
        fc.record({
          v: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          i: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          p: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          f: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          pf: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          t: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
          ts: fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        }),
        (fieldsToCorrupt, badValue, fullPayload) => {
          const malformed: Record<string, unknown> = { ...fullPayload };
          for (const field of fieldsToCorrupt) {
            malformed[field] = badValue;
          }

          const result = parseTelemetryPayload(JSON.stringify(malformed));

          expect(result.success).toBe(false);
          if (!result.success) {
            expect(result.error).toBeTruthy();
            expect(typeof result.error).toBe('string');
            expect(result.error.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
