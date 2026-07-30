import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { TemperatureMonitor } from '../../src/modules/temperature-monitor/index.js';

/**
 * Property-based tests for temperature safety monitor.
 * Validates: Requirements 3.1, 3.2, 3.4
 */

/** Minimal mock Firestore that satisfies fire-and-forget persistence calls. */
function createMockFirestore() {
  return {
    collection: () => ({
      doc: () => ({
        set: () => Promise.resolve(),
      }),
      where: () => ({
        get: () => Promise.resolve({ docs: [], size: 0 }),
      }),
    }),
  } as any;
}

describe('Feature: smart-socket-backend, Property 4: Temperature Safety Override Trigger', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   *
   * For any ESP32_Node and any temperature value T where T > 40°C,
   * the temperature monitor SHALL produce a "shutdown" action, regardless
   * of the node's priority score, ALM state, or any other system condition.
   */
  it('any temperature > 40°C always produces a shutdown action', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary node IDs
        fc.string({ minLength: 1, maxLength: 50 }),
        // Generate temperatures strictly above 40°C
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (nodeId, temperature) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          const result = monitor.checkTemperature(nodeId, temperature);

          expect(result.action).toBe('shutdown');
          if (result.action === 'shutdown') {
            expect(result.reason).toBe('temperature_exceeded');
            expect(result.temperature).toBe(temperature);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('shutdown action is produced regardless of prior state (not in override)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        // A safe temperature first to ensure node is NOT in override
        fc.double({ min: -50, max: 37.99, noNaN: true, noDefaultInfinity: true }),
        // Then a dangerous temperature
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (nodeId, safeTemp, dangerousTemp) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // First call with safe temp — node should not be in override
          monitor.checkTemperature(nodeId, safeTemp);
          expect(monitor.isInOverrideState(nodeId)).toBe(false);

          // Then dangerous temp — must trigger shutdown
          const result = monitor.checkTemperature(nodeId, dangerousTemp);
          expect(result.action).toBe('shutdown');
          if (result.action === 'shutdown') {
            expect(result.reason).toBe('temperature_exceeded');
            expect(result.temperature).toBe(dangerousTemp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('shutdown action is produced regardless of prior state (already in override)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        // First dangerous temp to enter override
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        // Second dangerous temp while in override
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (nodeId, firstDangerous, secondDangerous) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // Enter override
          monitor.checkTemperature(nodeId, firstDangerous);
          expect(monitor.isInOverrideState(nodeId)).toBe(true);

          // Still produces shutdown while already in override
          const result = monitor.checkTemperature(nodeId, secondDangerous);
          expect(result.action).toBe('shutdown');
          if (result.action === 'shutdown') {
            expect(result.reason).toBe('temperature_exceeded');
            expect(result.temperature).toBe(secondDangerous);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-backend, Property 5: Temperature Hysteresis State Machine', () => {
  /**
   * **Validates: Requirements 3.4**
   *
   * For any sequence of temperature readings for a node:
   * (a) a reading > 40°C transitions the node INTO override state,
   * (b) readings between 38°C and 40°C (inclusive) keep the node IN override state,
   * (c) a reading < 38°C transitions the node OUT OF override state.
   * Relay-on commands SHALL be rejected while in override state.
   */
  it('(a) temperature > 40°C transitions node INTO override state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (nodeId, temperature) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // Initially not in override
          expect(monitor.isInOverrideState(nodeId)).toBe(false);

          monitor.checkTemperature(nodeId, temperature);

          // Now in override
          expect(monitor.isInOverrideState(nodeId)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('(b) readings in hysteresis band [38, 40] keep node IN override state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        // Temperature to enter override (> 40)
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        // Temperature in hysteresis band [38, 40]
        fc.double({ min: 38, max: 40, noNaN: true, noDefaultInfinity: true }),
        (nodeId, triggerTemp, hysteresisTemp) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // Enter override
          monitor.checkTemperature(nodeId, triggerTemp);
          expect(monitor.isInOverrideState(nodeId)).toBe(true);

          // Apply hysteresis-band temperature
          const result = monitor.checkTemperature(nodeId, hysteresisTemp);

          // Must remain in override
          expect(monitor.isInOverrideState(nodeId)).toBe(true);
          // Must return block_reactivation
          expect(result.action).toBe('block_reactivation');
          if (result.action === 'block_reactivation') {
            expect(result.reason).toBe('hysteresis_active');
            expect(result.temperature).toBe(hysteresisTemp);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('(c) temperature < 38°C transitions node OUT OF override state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        // Temperature to enter override (> 40)
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        // Temperature below reactivation threshold (< 38)
        fc.double({ min: -50, max: 37.9999, noNaN: true, noDefaultInfinity: true }),
        (nodeId, triggerTemp, coolTemp) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // Enter override
          monitor.checkTemperature(nodeId, triggerTemp);
          expect(monitor.isInOverrideState(nodeId)).toBe(true);

          // Cool down below threshold
          const result = monitor.checkTemperature(nodeId, coolTemp);

          // Must exit override
          expect(monitor.isInOverrideState(nodeId)).toBe(false);
          expect(result.action).toBe('none');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('canReactivate returns false while in override and temp >= 38°C', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        // Temperature to enter override
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        // Temperature >= 38 (should NOT allow reactivation)
        fc.double({ min: 38, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (nodeId, triggerTemp, warmTemp) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // Enter override
          monitor.checkTemperature(nodeId, triggerTemp);
          expect(monitor.isInOverrideState(nodeId)).toBe(true);

          // Cannot reactivate while in override with temp >= 38
          expect(monitor.canReactivate(nodeId, warmTemp)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('canReactivate returns true when temp < 38°C (even while in override)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        // Temperature to enter override
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        // Temperature < 38 (should allow reactivation)
        fc.double({ min: -50, max: 37.9999, noNaN: true, noDefaultInfinity: true }),
        (nodeId, triggerTemp, coolTemp) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // Enter override
          monitor.checkTemperature(nodeId, triggerTemp);
          expect(monitor.isInOverrideState(nodeId)).toBe(true);

          // Can reactivate when temp drops below 38
          expect(monitor.canReactivate(nodeId, coolTemp)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('full state machine cycle: override → hysteresis → exit', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        // Dangerous temp > 40
        fc.double({ min: 40.0001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        // Hysteresis temps in [38, 40] (sequence of 1-3 readings)
        fc.array(
          fc.double({ min: 38, max: 40, noNaN: true, noDefaultInfinity: true }),
          { minLength: 1, maxLength: 3 }
        ),
        // Cool temp < 38
        fc.double({ min: -50, max: 37.9999, noNaN: true, noDefaultInfinity: true }),
        (nodeId, dangerousTemp, hysteresisTemps, coolTemp) => {
          const monitor = new TemperatureMonitor(createMockFirestore());

          // Phase 1: Enter override
          const shutdownResult = monitor.checkTemperature(nodeId, dangerousTemp);
          expect(shutdownResult.action).toBe('shutdown');
          expect(monitor.isInOverrideState(nodeId)).toBe(true);

          // Phase 2: Stay in override during hysteresis band
          for (const hTemp of hysteresisTemps) {
            const hResult = monitor.checkTemperature(nodeId, hTemp);
            expect(hResult.action).toBe('block_reactivation');
            expect(monitor.isInOverrideState(nodeId)).toBe(true);
            expect(monitor.canReactivate(nodeId, hTemp)).toBe(false);
          }

          // Phase 3: Exit override when cool
          const exitResult = monitor.checkTemperature(nodeId, coolTemp);
          expect(exitResult.action).toBe('none');
          expect(monitor.isInOverrideState(nodeId)).toBe(false);
          expect(monitor.canReactivate(nodeId, coolTemp)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
