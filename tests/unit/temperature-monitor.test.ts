import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TemperatureMonitor } from '../../src/modules/temperature-monitor/index.js';

/**
 * Creates a minimal Firestore mock for testing.
 */
function createFirestoreMock() {
  const setMock = vi.fn().mockResolvedValue(undefined);
  const docMock = vi.fn().mockReturnValue({ set: setMock });
  const whereMock = vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue({ docs: [], size: 0 }),
  });
  const collectionMock = vi.fn().mockReturnValue({
    doc: docMock,
    where: whereMock,
  });

  return {
    firestore: { collection: collectionMock } as any,
    setMock,
    docMock,
    collectionMock,
  };
}

describe('TemperatureMonitor', () => {
  let monitor: TemperatureMonitor;
  let mocks: ReturnType<typeof createFirestoreMock>;

  beforeEach(() => {
    mocks = createFirestoreMock();
    monitor = new TemperatureMonitor(mocks.firestore);
  });

  describe('checkTemperature', () => {
    it('should return shutdown action when temperature exceeds 40°C', () => {
      const result = monitor.checkTemperature('node-1', 41);
      expect(result).toEqual({
        action: 'shutdown',
        reason: 'temperature_exceeded',
        temperature: 41,
      });
    });

    it('should return none when temperature is at or below 40°C and node is not in override', () => {
      expect(monitor.checkTemperature('node-1', 40)).toEqual({ action: 'none' });
      expect(monitor.checkTemperature('node-1', 35)).toEqual({ action: 'none' });
      expect(monitor.checkTemperature('node-1', 0)).toEqual({ action: 'none' });
    });

    it('should return block_reactivation when node is in override and T is in hysteresis band', () => {
      // First trigger override
      monitor.checkTemperature('node-1', 41);

      // Now check with temperature in hysteresis band (38 <= T <= 40)
      const result = monitor.checkTemperature('node-1', 39);
      expect(result).toEqual({
        action: 'block_reactivation',
        reason: 'hysteresis_active',
        temperature: 39,
      });
    });

    it('should return none when node exits override (T < 38°C)', () => {
      // First trigger override
      monitor.checkTemperature('node-1', 41);

      // Temperature drops below 38
      const result = monitor.checkTemperature('node-1', 37.5);
      expect(result).toEqual({ action: 'none' });
    });

    it('should keep returning shutdown for repeated high readings', () => {
      monitor.checkTemperature('node-1', 42);
      const result = monitor.checkTemperature('node-1', 45);
      expect(result).toEqual({
        action: 'shutdown',
        reason: 'temperature_exceeded',
        temperature: 45,
      });
    });

    it('should handle exactly 40°C as NOT triggering override (strict greater than)', () => {
      const result = monitor.checkTemperature('node-1', 40);
      expect(result).toEqual({ action: 'none' });
      expect(monitor.isInOverrideState('node-1')).toBe(false);
    });

    it('should handle exactly 38°C as NOT allowing reactivation (strict less than)', () => {
      // Enter override
      monitor.checkTemperature('node-1', 41);

      // Exactly 38 should still block
      const result = monitor.checkTemperature('node-1', 38);
      expect(result).toEqual({
        action: 'block_reactivation',
        reason: 'hysteresis_active',
        temperature: 38,
      });
      expect(monitor.isInOverrideState('node-1')).toBe(true);
    });

    it('should track override states independently per node', () => {
      monitor.checkTemperature('node-1', 41); // override
      monitor.checkTemperature('node-2', 35); // safe

      expect(monitor.isInOverrideState('node-1')).toBe(true);
      expect(monitor.isInOverrideState('node-2')).toBe(false);
    });
  });

  describe('isInOverrideState', () => {
    it('should return false for unknown node', () => {
      expect(monitor.isInOverrideState('unknown')).toBe(false);
    });

    it('should return true after override is triggered', () => {
      monitor.checkTemperature('node-1', 41);
      expect(monitor.isInOverrideState('node-1')).toBe(true);
    });

    it('should return false after override is cleared', () => {
      monitor.checkTemperature('node-1', 41);
      monitor.checkTemperature('node-1', 37); // below 38, clears override
      expect(monitor.isInOverrideState('node-1')).toBe(false);
    });
  });

  describe('canReactivate', () => {
    it('should return true for a node not in override state', () => {
      expect(monitor.canReactivate('node-1', 30)).toBe(true);
    });

    it('should return true when temperature drops below 38°C for overridden node', () => {
      monitor.checkTemperature('node-1', 41); // enter override
      expect(monitor.canReactivate('node-1', 37.99)).toBe(true);
    });

    it('should return false when temperature is at 38°C for overridden node', () => {
      monitor.checkTemperature('node-1', 41);
      expect(monitor.canReactivate('node-1', 38)).toBe(false);
    });

    it('should return false when temperature is above 38°C for overridden node', () => {
      monitor.checkTemperature('node-1', 41);
      expect(monitor.canReactivate('node-1', 39)).toBe(false);
    });
  });

  describe('Firestore persistence', () => {
    it('should persist override state to Firestore when entering override', async () => {
      monitor.checkTemperature('node-1', 41);

      // Allow async persistence to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(mocks.collectionMock).toHaveBeenCalledWith('nodes');
      expect(mocks.docMock).toHaveBeenCalledWith('node-1');
      expect(mocks.setMock).toHaveBeenCalledWith(
        {
          inTemperatureOverride: true,
          temperatureOverrideSince: expect.any(Number),
        },
        { merge: true }
      );
    });

    it('should persist override exit to Firestore when exiting override', async () => {
      monitor.checkTemperature('node-1', 41);
      await new Promise((r) => setTimeout(r, 10));

      // Clear mock calls
      mocks.setMock.mockClear();

      monitor.checkTemperature('node-1', 37);
      await new Promise((r) => setTimeout(r, 10));

      expect(mocks.setMock).toHaveBeenCalledWith(
        {
          inTemperatureOverride: false,
          temperatureOverrideSince: null,
        },
        { merge: true }
      );
    });

    it('should NOT persist again if already in override state', async () => {
      monitor.checkTemperature('node-1', 41);
      await new Promise((r) => setTimeout(r, 10));
      mocks.setMock.mockClear();

      // Second high reading — should not create a new persistence call
      monitor.checkTemperature('node-1', 42);
      await new Promise((r) => setTimeout(r, 10));

      expect(mocks.setMock).not.toHaveBeenCalled();
    });
  });
});


/**
 * Task 4.3: Boundary condition tests for temperature monitor
 * Validates: Requirements 3.1, 3.4
 */
describe('TemperatureMonitor - Boundary Conditions', () => {
  let monitor: TemperatureMonitor;

  beforeEach(() => {
    const mocks = createFirestoreMock();
    monitor = new TemperatureMonitor(mocks.firestore);
  });

  describe('Shutdown threshold boundaries (Requirement 3.1: T > 40°C)', () => {
    it('40.0°C should NOT trigger shutdown (threshold is strict >)', () => {
      const result = monitor.checkTemperature('node-1', 40.0);
      expect(result).toEqual({ action: 'none' });
      expect(monitor.isInOverrideState('node-1')).toBe(false);
    });

    it('40.01°C should trigger shutdown', () => {
      const result = monitor.checkTemperature('node-1', 40.01);
      expect(result).toEqual({
        action: 'shutdown',
        reason: 'temperature_exceeded',
        temperature: 40.01,
      });
      expect(monitor.isInOverrideState('node-1')).toBe(true);
    });

    it('39.99°C should NOT trigger shutdown and should not enter override', () => {
      const result = monitor.checkTemperature('node-1', 39.99);
      expect(result).toEqual({ action: 'none' });
      expect(monitor.isInOverrideState('node-1')).toBe(false);
    });
  });

  describe('Reactivation threshold boundaries (Requirement 3.4: T < 38°C to exit override)', () => {
    it('38.0°C while in override should block reactivation (threshold is strict <)', () => {
      // Enter override
      monitor.checkTemperature('node-1', 41);

      const result = monitor.checkTemperature('node-1', 38.0);
      expect(result).toEqual({
        action: 'block_reactivation',
        reason: 'hysteresis_active',
        temperature: 38.0,
      });
      expect(monitor.isInOverrideState('node-1')).toBe(true);
    });

    it('37.99°C while in override should allow exit from override', () => {
      // Enter override
      monitor.checkTemperature('node-1', 41);

      const result = monitor.checkTemperature('node-1', 37.99);
      expect(result).toEqual({ action: 'none' });
      expect(monitor.isInOverrideState('node-1')).toBe(false);
    });
  });

  describe('State transitions across multiple readings', () => {
    it('safe → override → hysteresis → safe full cycle', () => {
      // Phase 1: Safe state — temperature below threshold
      const r1 = monitor.checkTemperature('node-1', 35);
      expect(r1).toEqual({ action: 'none' });
      expect(monitor.isInOverrideState('node-1')).toBe(false);

      // Phase 2: Enter override — temperature exceeds 40°C
      const r2 = monitor.checkTemperature('node-1', 40.5);
      expect(r2).toEqual({
        action: 'shutdown',
        reason: 'temperature_exceeded',
        temperature: 40.5,
      });
      expect(monitor.isInOverrideState('node-1')).toBe(true);

      // Phase 3: Hysteresis band — temperature between 38 and 40 (inclusive)
      const r3 = monitor.checkTemperature('node-1', 39.0);
      expect(r3).toEqual({
        action: 'block_reactivation',
        reason: 'hysteresis_active',
        temperature: 39.0,
      });
      expect(monitor.isInOverrideState('node-1')).toBe(true);

      // Phase 4: Exit override — temperature drops below 38°C
      const r4 = monitor.checkTemperature('node-1', 37.5);
      expect(r4).toEqual({ action: 'none' });
      expect(monitor.isInOverrideState('node-1')).toBe(false);
    });

    it('multiple readings in override state remain in override', () => {
      // Enter override
      monitor.checkTemperature('node-1', 41);
      expect(monitor.isInOverrideState('node-1')).toBe(true);

      // Multiple readings within hysteresis band — should stay in override
      const readings = [40.0, 39.5, 38.5, 38.0, 39.0];
      for (const temp of readings) {
        const result = monitor.checkTemperature('node-1', temp);
        expect(result).toEqual({
          action: 'block_reactivation',
          reason: 'hysteresis_active',
          temperature: temp,
        });
        expect(monitor.isInOverrideState('node-1')).toBe(true);
      }
    });
  });

  describe('canReactivate boundary conditions', () => {
    it('canReactivate at exactly 38.0°C while in override should return false', () => {
      monitor.checkTemperature('node-1', 41); // enter override
      expect(monitor.canReactivate('node-1', 38.0)).toBe(false);
    });

    it('canReactivate at 37.99°C while in override should return true', () => {
      monitor.checkTemperature('node-1', 41); // enter override
      expect(monitor.canReactivate('node-1', 37.99)).toBe(true);
    });
  });

  describe('Multiple nodes tracked independently', () => {
    it('override state of one node does not affect another', () => {
      // node-1 enters override
      monitor.checkTemperature('node-1', 42);
      // node-2 stays safe
      monitor.checkTemperature('node-2', 35);
      // node-3 also enters override
      monitor.checkTemperature('node-3', 40.5);

      expect(monitor.isInOverrideState('node-1')).toBe(true);
      expect(monitor.isInOverrideState('node-2')).toBe(false);
      expect(monitor.isInOverrideState('node-3')).toBe(true);

      // node-1 drops to hysteresis — still in override
      const r1 = monitor.checkTemperature('node-1', 39);
      expect(r1.action).toBe('block_reactivation');
      expect(monitor.isInOverrideState('node-1')).toBe(true);

      // node-3 drops below 38 — exits override
      const r3 = monitor.checkTemperature('node-3', 37.5);
      expect(r3.action).toBe('none');
      expect(monitor.isInOverrideState('node-3')).toBe(false);

      // node-1 is still in override, unaffected by node-3's exit
      expect(monitor.isInOverrideState('node-1')).toBe(true);

      // node-2 can reactivate (never was in override)
      expect(monitor.canReactivate('node-2', 39)).toBe(true);

      // node-1 cannot reactivate (still in override at T=39)
      expect(monitor.canReactivate('node-1', 39)).toBe(false);
    });
  });
});
