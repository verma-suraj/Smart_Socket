import { describe, it, expect, beforeEach } from 'vitest';
import { GuestHandler, createGuestHandler } from '../../src/modules/session-manager/guest-handler.js';
import { getActiveSessionsMap } from '../../src/modules/session-manager/session-lifecycle.js';

describe('GuestHandler', () => {
  let handler: GuestHandler;

  beforeEach(() => {
    handler = createGuestHandler();
    // Clear active sessions before each test
    getActiveSessionsMap().clear();
  });

  describe('validateInput', () => {
    it('should pass validation with valid userId and nodeId', () => {
      const result = handler.validateInput({ userId: 'user-1', nodeId: 'node-1' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when userId is missing', () => {
      const result = handler.validateInput({ userId: '', nodeId: 'node-1' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('userId is required');
    });

    it('should fail validation when nodeId is missing', () => {
      const result = handler.validateInput({ userId: 'user-1', nodeId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('nodeId is required');
    });

    it('should fail validation when both userId and nodeId are missing', () => {
      const result = handler.validateInput({ userId: '', nodeId: '' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });

    it('should pass validation with valid guestSpecs', () => {
      const result = handler.validateInput({
        userId: 'user-1',
        nodeId: 'node-1',
        guestSpecs: {
          batteryCapacity: 60,
          batteryType: 'Li-ion',
          chargerType: 'Type2',
          chargerPowerRating: 7.2,
        },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation when guestSpecs has invalid batteryCapacity', () => {
      const result = handler.validateInput({
        userId: 'user-1',
        nodeId: 'node-1',
        guestSpecs: {
          batteryCapacity: 0,
          batteryType: 'Li-ion',
          chargerType: 'Type2',
          chargerPowerRating: 7.2,
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('guestSpecs.batteryCapacity must be a positive number');
    });

    it('should fail validation when guestSpecs has empty batteryType', () => {
      const result = handler.validateInput({
        userId: 'user-1',
        nodeId: 'node-1',
        guestSpecs: {
          batteryCapacity: 60,
          batteryType: '',
          chargerType: 'Type2',
          chargerPowerRating: 7.2,
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('guestSpecs.batteryType is required when providing guest specs');
    });

    it('should fail validation when guestSpecs has invalid chargerPowerRating', () => {
      const result = handler.validateInput({
        userId: 'user-1',
        nodeId: 'node-1',
        guestSpecs: {
          batteryCapacity: 60,
          batteryType: 'Li-ion',
          chargerType: 'Type2',
          chargerPowerRating: -1,
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('guestSpecs.chargerPowerRating must be a positive number');
    });

    it('should fail validation when initialSOC is out of range', () => {
      const result = handler.validateInput({
        userId: 'user-1',
        nodeId: 'node-1',
        initialSOC: 1.5,
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('initialSOC must be a number between 0 and 1');
    });

    it('should pass validation when initialSOC is 0', () => {
      const result = handler.validateInput({
        userId: 'user-1',
        nodeId: 'node-1',
        initialSOC: 0,
      });
      expect(result.valid).toBe(true);
    });

    it('should pass validation when initialSOC is 1', () => {
      const result = handler.validateInput({
        userId: 'user-1',
        nodeId: 'node-1',
        initialSOC: 1,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('initiateGuestSession', () => {
    it('should create a guest session without specs and assign priority 0', () => {
      const session = handler.initiateGuestSession({
        userId: 'user-1',
        nodeId: 'node-1',
      });

      expect(session.sessionId).toBeDefined();
      expect(session.userId).toBe('user-1');
      expect(session.nodeId).toBe('node-1');
      expect(session.sessionType).toBe('guest');
      expect(session.priorityScore).toBe(0);
      expect(session.guestSpecs).toBeNull();
      expect(session.active).toBe(true);
    });

    it('should create a guest session with specs and calculate priority', () => {
      const session = handler.initiateGuestSession({
        userId: 'user-1',
        nodeId: 'node-1',
        guestSpecs: {
          batteryCapacity: 60,
          batteryType: 'Li-ion',
          chargerType: 'Type2',
          chargerPowerRating: 7.2,
        },
        initialSOC: 0.3,
      });

      const expectedPriority = (60 * (1 - 0.3)) / 7.2;

      expect(session.sessionType).toBe('guest');
      expect(session.priorityScore).toBeCloseTo(expectedPriority, 5);
      expect(session.guestSpecs).toEqual({
        batteryCapacity: 60,
        batteryType: 'Li-ion',
        chargerType: 'Type2',
        chargerPowerRating: 7.2,
      });
    });

    it('should associate session with user profile (userId stored)', () => {
      const session = handler.initiateGuestSession({
        userId: 'user-billing-123',
        nodeId: 'node-1',
      });

      expect(session.userId).toBe('user-billing-123');
    });

    it('should use default SOC when not provided with guest specs', () => {
      const session = handler.initiateGuestSession({
        userId: 'user-1',
        nodeId: 'node-1',
        guestSpecs: {
          batteryCapacity: 40,
          batteryType: 'LiFePO4',
          chargerType: 'CCS',
          chargerPowerRating: 50,
        },
      });

      // Default SOC is 0.20
      const expectedPriority = (40 * (1 - 0.20)) / 50;
      expect(session.priorityScore).toBeCloseTo(expectedPriority, 5);
    });

    it('should throw error if userId is missing', () => {
      expect(() => handler.initiateGuestSession({ userId: '', nodeId: 'node-1' }))
        .toThrow('Guest session validation failed');
    });

    it('should throw error if nodeId is missing', () => {
      expect(() => handler.initiateGuestSession({ userId: 'user-1', nodeId: '' }))
        .toThrow('Guest session validation failed');
    });

    it('should throw error if guestSpecs has invalid values', () => {
      expect(() => handler.initiateGuestSession({
        userId: 'user-1',
        nodeId: 'node-1',
        guestSpecs: {
          batteryCapacity: -10,
          batteryType: 'Li-ion',
          chargerType: 'Type2',
          chargerPowerRating: 7.2,
        },
      })).toThrow('Guest session validation failed');
    });

    it('should store session in active sessions map', () => {
      handler.initiateGuestSession({
        userId: 'user-1',
        nodeId: 'node-guest-1',
      });

      const activeMap = getActiveSessionsMap();
      expect(activeMap.has('node-guest-1')).toBe(true);
      expect(activeMap.get('node-guest-1')!.sessionType).toBe('guest');
    });
  });
});
