import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  updateSessionEnergy,
  finalizeSession,
  getActiveSession,
  getActiveSessionsMap,
} from '../../src/modules/session-manager/session-lifecycle.js';
import type { CreateSessionParams } from '../../src/interfaces/session-manager.interface.js';

describe('Session Lifecycle', () => {
  beforeEach(() => {
    // Clear active sessions before each test
    getActiveSessionsMap().clear();
  });

  describe('createSession', () => {
    it('should create a session with all required fields', () => {
      const params: CreateSessionParams = {
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
        initialSOC: 0.3,
      };

      const session = createSession(params);

      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.nodeId).toBe('node-1');
      expect(session.sessionType).toBe('owner');
      expect(session.startTimestamp).toBeGreaterThan(0);
      expect(session.endTimestamp).toBeNull();
      expect(session.initialSOC).toBe(0.3);
      expect(session.batteryCapacity).toBe(60);
      expect(session.chargerPowerRating).toBe(7.2);
      expect(session.totalEnergyConsumed).toBe(0);
      expect(session.totalTime).toBe(0);
      expect(session.billAmount).toBeNull();
      expect(session.endReason).toBeNull();
      expect(session.active).toBe(true);
      expect(session.guestSpecs).toBeNull();
    });

    it('should use default SOC (0.20) when initialSOC is not provided', () => {
      const params: CreateSessionParams = {
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      };

      const session = createSession(params);

      expect(session.initialSOC).toBe(0.20);
    });

    it('should calculate priority score using formula: (batteryCapacity * (1 - initialSOC)) / chargerPowerRating', () => {
      const params: CreateSessionParams = {
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
        initialSOC: 0.3,
      };

      const session = createSession(params);
      const expectedPriority = (60 * (1 - 0.3)) / 7.2;

      expect(session.priorityScore).toBeCloseTo(expectedPriority, 5);
    });

    it('should assign priority 0 for guest without guestSpecs', () => {
      const params: CreateSessionParams = {
        userId: 'user-2',
        nodeId: 'node-2',
        sessionType: 'guest',
        batteryCapacity: 40,
        chargerPowerRating: 3.3,
      };

      const session = createSession(params);

      expect(session.priorityScore).toBe(0);
    });

    it('should calculate priority normally for guest WITH guestSpecs', () => {
      const params: CreateSessionParams = {
        userId: 'user-2',
        nodeId: 'node-2',
        sessionType: 'guest',
        batteryCapacity: 40,
        chargerPowerRating: 3.3,
        initialSOC: 0.5,
        guestSpecs: {
          batteryCapacity: 40,
          batteryType: 'Li-ion',
          chargerType: 'Type2',
          chargerPowerRating: 3.3,
        },
      };

      const session = createSession(params);
      const expectedPriority = (40 * (1 - 0.5)) / 3.3;

      expect(session.priorityScore).toBeCloseTo(expectedPriority, 5);
      expect(session.guestSpecs).toEqual({
        batteryCapacity: 40,
        batteryType: 'Li-ion',
        chargerType: 'Type2',
        chargerPowerRating: 3.3,
      });
    });

    it('should store the session in active sessions map keyed by nodeId', () => {
      const params: CreateSessionParams = {
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      };

      createSession(params);

      const active = getActiveSession('node-1');
      expect(active).not.toBeNull();
      expect(active!.nodeId).toBe('node-1');
    });

    it('should generate unique session IDs', () => {
      const params1: CreateSessionParams = {
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      };
      const params2: CreateSessionParams = {
        userId: 'user-2',
        nodeId: 'node-2',
        sessionType: 'owner',
        batteryCapacity: 50,
        chargerPowerRating: 11,
      };

      const session1 = createSession(params1);
      const session2 = createSession(params2);

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });
  });

  describe('updateSessionEnergy', () => {
    it('should accumulate energy using formula: kWh += (powerWatts * durationMs) / 3,600,000', () => {
      createSession({
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      });

      // 7200W for 1 hour (3,600,000ms): 7200 * 3,600,000 / 3,600,000 = 7200
      updateSessionEnergy('node-1', 7200, 3_600_000);

      const session = getActiveSession('node-1');
      const expected = (7200 * 3_600_000) / 3_600_000;
      expect(session!.totalEnergyConsumed).toBeCloseTo(expected, 5);
    });

    it('should accumulate energy over multiple updates', () => {
      createSession({
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      });

      // First update: 3600W for 30 minutes (1,800,000ms)
      updateSessionEnergy('node-1', 3600, 1_800_000);
      // Second update: 7200W for 15 minutes (900,000ms)
      updateSessionEnergy('node-1', 7200, 900_000);

      const session = getActiveSession('node-1');
      const expected = (3600 * 1_800_000) / 3_600_000 + (7200 * 900_000) / 3_600_000;
      expect(session!.totalEnergyConsumed).toBeCloseTo(expected, 5);
    });

    it('should be a no-op if no active session exists for nodeId', () => {
      // Should not throw
      updateSessionEnergy('non-existent-node', 7200, 3_600_000);
    });
  });

  describe('finalizeSession', () => {
    it('should set end_timestamp, total_time, total_energy, and calculate bill', () => {
      const session = createSession({
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      });

      // Simulate energy consumption: 7200W for 1 hour (3,600,000ms)
      updateSessionEnergy('node-1', 7200, 3_600_000);

      const finalized = finalizeSession('node-1', 'user_ended');

      const expectedEnergy = (7200 * 3_600_000) / 3_600_000; // = 7200
      const expectedBill = expectedEnergy * 8.0; // perUnitRate

      expect(finalized.sessionId).toBe(session.sessionId);
      expect(finalized.totalTime).toBeGreaterThanOrEqual(0);
      expect(finalized.totalEnergy).toBeCloseTo(expectedEnergy, 5);
      expect(finalized.billAmount).toBeCloseTo(expectedBill, 5);
      expect(finalized.endReason).toBe('user_ended');
    });

    it('should mark session as inactive and remove from active map', () => {
      createSession({
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      });

      finalizeSession('node-1', 'admin_action');

      const active = getActiveSession('node-1');
      expect(active).toBeNull();
    });

    it('should throw if no active session exists for the nodeId', () => {
      expect(() => finalizeSession('non-existent-node', 'user_ended'))
        .toThrow('No active session found for node: non-existent-node');
    });

    it('should correctly handle different end reasons', () => {
      createSession({
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      });

      const finalized = finalizeSession('node-1', 'alm_override');
      expect(finalized.endReason).toBe('alm_override');
    });

    it('should calculate bill as totalEnergy * perUnitRate (8.0)', () => {
      createSession({
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      });

      // 1000W for 1 hour (3,600,000ms): energy = 1000 * 3,600,000 / 3,600,000 = 1000
      updateSessionEnergy('node-1', 1000, 3_600_000);

      const finalized = finalizeSession('node-1', 'user_ended');
      const expectedEnergy = (1000 * 3_600_000) / 3_600_000; // = 1000
      const expectedBill = expectedEnergy * 8.0; // = 8000
      expect(finalized.billAmount).toBeCloseTo(expectedBill, 5);
    });
  });

  describe('getActiveSession', () => {
    it('should return the active session for a node', () => {
      createSession({
        userId: 'user-1',
        nodeId: 'node-1',
        sessionType: 'owner',
        batteryCapacity: 60,
        chargerPowerRating: 7.2,
      });

      const session = getActiveSession('node-1');
      expect(session).not.toBeNull();
      expect(session!.nodeId).toBe('node-1');
      expect(session!.active).toBe(true);
    });

    it('should return null if no session exists for the nodeId', () => {
      const session = getActiveSession('non-existent');
      expect(session).toBeNull();
    });
  });
});
