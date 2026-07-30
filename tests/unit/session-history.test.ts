import { describe, it, expect, beforeEach } from 'vitest';
import {
  addToHistory,
  getSessionHistory,
  deleteSession,
  clearHistory,
  getHistoryMap,
} from '../../src/modules/session-manager/session-history.js';
import { SessionManager } from '../../src/modules/session-manager/index.js';
import { getActiveSessionsMap } from '../../src/modules/session-manager/session-lifecycle.js';
import type { Session } from '../../src/models/index.js';
import type { CreateSessionParams } from '../../src/interfaces/session-manager.interface.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: `session-${Math.random().toString(36).slice(2, 8)}`,
    userId: 'user-1',
    nodeId: 'node-1',
    sessionType: 'owner',
    startTimestamp: Date.now() - 3600000,
    endTimestamp: Date.now(),
    initialSOC: 0.2,
    batteryCapacity: 60,
    chargerPowerRating: 7.2,
    priorityScore: 5.83,
    totalEnergyConsumed: 7.2,
    totalTime: 3600,
    billAmount: 57.6,
    endReason: 'user_ended',
    active: false,
    guestSpecs: null,
    ...overrides,
  };
}

describe('Session History', () => {
  beforeEach(() => {
    getHistoryMap().clear();
  });

  describe('addToHistory', () => {
    it('should add a session to the history store', () => {
      const session = makeSession({ sessionId: 'sess-1' });
      addToHistory(session);

      expect(getHistoryMap().has('sess-1')).toBe(true);
    });
  });

  describe('getSessionHistory', () => {
    it('should return all sessions for a given userId', () => {
      addToHistory(makeSession({ sessionId: 'a', userId: 'user-1' }));
      addToHistory(makeSession({ sessionId: 'b', userId: 'user-1' }));
      addToHistory(makeSession({ sessionId: 'c', userId: 'user-2' }));

      const results = getSessionHistory('user-1');
      expect(results).toHaveLength(2);
      expect(results.map(s => s.sessionId).sort()).toEqual(['a', 'b']);
    });

    it('should return empty array if no sessions exist for userId', () => {
      addToHistory(makeSession({ userId: 'user-2' }));
      const results = getSessionHistory('user-1');
      expect(results).toHaveLength(0);
    });

    it('should filter by startDate (inclusive lower bound)', () => {
      addToHistory(makeSession({ sessionId: 'old', userId: 'user-1', startTimestamp: 1000 }));
      addToHistory(makeSession({ sessionId: 'new', userId: 'user-1', startTimestamp: 5000 }));

      const results = getSessionHistory('user-1', { startDate: 3000 });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('new');
    });

    it('should filter by endDate (inclusive upper bound)', () => {
      addToHistory(makeSession({ sessionId: 'old', userId: 'user-1', startTimestamp: 1000 }));
      addToHistory(makeSession({ sessionId: 'new', userId: 'user-1', startTimestamp: 5000 }));

      const results = getSessionHistory('user-1', { endDate: 3000 });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('old');
    });

    it('should filter by sessionType', () => {
      addToHistory(makeSession({ sessionId: 'owner', userId: 'user-1', sessionType: 'owner' }));
      addToHistory(makeSession({ sessionId: 'guest', userId: 'user-1', sessionType: 'guest' }));

      const results = getSessionHistory('user-1', { sessionType: 'guest' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('guest');
    });

    it('should filter by nodeId', () => {
      addToHistory(makeSession({ sessionId: 'n1', userId: 'user-1', nodeId: 'node-1' }));
      addToHistory(makeSession({ sessionId: 'n2', userId: 'user-1', nodeId: 'node-2' }));

      const results = getSessionHistory('user-1', { nodeId: 'node-2' });
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('n2');
    });

    it('should apply multiple filters with AND logic', () => {
      addToHistory(makeSession({ sessionId: 'a', userId: 'user-1', sessionType: 'owner', nodeId: 'node-1', startTimestamp: 2000 }));
      addToHistory(makeSession({ sessionId: 'b', userId: 'user-1', sessionType: 'guest', nodeId: 'node-1', startTimestamp: 3000 }));
      addToHistory(makeSession({ sessionId: 'c', userId: 'user-1', sessionType: 'owner', nodeId: 'node-2', startTimestamp: 4000 }));
      addToHistory(makeSession({ sessionId: 'd', userId: 'user-1', sessionType: 'owner', nodeId: 'node-1', startTimestamp: 5000 }));

      const results = getSessionHistory('user-1', {
        sessionType: 'owner',
        nodeId: 'node-1',
        startDate: 1500,
        endDate: 4500,
      });

      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('a');
    });
  });

  describe('deleteSession', () => {
    it('should remove a session from history by sessionId', () => {
      addToHistory(makeSession({ sessionId: 'to-delete', userId: 'user-1' }));
      addToHistory(makeSession({ sessionId: 'keep', userId: 'user-1' }));

      deleteSession('to-delete');

      const results = getSessionHistory('user-1');
      expect(results).toHaveLength(1);
      expect(results[0].sessionId).toBe('keep');
    });

    it('should not throw when deleting non-existent session', () => {
      expect(() => deleteSession('non-existent')).not.toThrow();
    });
  });

  describe('clearHistory', () => {
    it('should remove all sessions for a given userId', () => {
      addToHistory(makeSession({ sessionId: 'a', userId: 'user-1' }));
      addToHistory(makeSession({ sessionId: 'b', userId: 'user-1' }));
      addToHistory(makeSession({ sessionId: 'c', userId: 'user-2' }));

      clearHistory('user-1');

      const user1Results = getSessionHistory('user-1');
      const user2Results = getSessionHistory('user-2');
      expect(user1Results).toHaveLength(0);
      expect(user2Results).toHaveLength(1);
    });

    it('should be a no-op if user has no history', () => {
      addToHistory(makeSession({ userId: 'user-2' }));
      expect(() => clearHistory('user-1')).not.toThrow();
      expect(getSessionHistory('user-2')).toHaveLength(1);
    });
  });
});

describe('SessionManager (composed)', () => {
  let manager: SessionManager;

  beforeEach(() => {
    getHistoryMap().clear();
    getActiveSessionsMap().clear();
    manager = new SessionManager();
  });

  it('should create a session via lifecycle', async () => {
    const params: CreateSessionParams = {
      userId: 'user-1',
      nodeId: 'node-1',
      sessionType: 'owner',
      batteryCapacity: 60,
      chargerPowerRating: 7.2,
      initialSOC: 0.3,
    };

    const session = await manager.createSession(params);
    expect(session.sessionId).toBeDefined();
    expect(session.active).toBe(true);
  });

  it('should get active session via lifecycle', async () => {
    await manager.createSession({
      userId: 'user-1',
      nodeId: 'node-1',
      sessionType: 'owner',
      batteryCapacity: 60,
      chargerPowerRating: 7.2,
    });

    const active = manager.getActiveSession('node-1');
    expect(active).not.toBeNull();
    expect(active!.nodeId).toBe('node-1');
  });

  it('should finalize session and store in history', async () => {
    await manager.createSession({
      userId: 'user-1',
      nodeId: 'node-1',
      sessionType: 'owner',
      batteryCapacity: 60,
      chargerPowerRating: 7.2,
    });

    manager.updateSessionEnergy('node-1', 7200, 1_800_000);

    const finalized = await manager.finalizeSession('node-1', 'user_ended');
    expect(finalized.endReason).toBe('user_ended');
    expect(finalized.totalEnergy).toBeGreaterThan(0);

    // Should be in history
    const historyResults = await manager.getSessionHistory('user-1');
    expect(historyResults).toHaveLength(1);
    expect(historyResults[0].active).toBe(false);
    expect(historyResults[0].endReason).toBe('user_ended');
  });

  it('should delete a session from history', async () => {
    await manager.createSession({
      userId: 'user-1',
      nodeId: 'node-1',
      sessionType: 'owner',
      batteryCapacity: 60,
      chargerPowerRating: 7.2,
    });
    const finalized = await manager.finalizeSession('node-1', 'user_ended');

    await manager.deleteSession(finalized.sessionId);

    const historyResults = await manager.getSessionHistory('user-1');
    expect(historyResults).toHaveLength(0);
  });

  it('should clear all history for a user', async () => {
    // Create and finalize two sessions
    await manager.createSession({
      userId: 'user-1',
      nodeId: 'node-1',
      sessionType: 'owner',
      batteryCapacity: 60,
      chargerPowerRating: 7.2,
    });
    await manager.finalizeSession('node-1', 'user_ended');

    await manager.createSession({
      userId: 'user-1',
      nodeId: 'node-2',
      sessionType: 'guest',
      batteryCapacity: 40,
      chargerPowerRating: 3.3,
    });
    await manager.finalizeSession('node-2', 'admin_action');

    await manager.clearHistory('user-1');

    const historyResults = await manager.getSessionHistory('user-1');
    expect(historyResults).toHaveLength(0);
  });

  it('should support filtering in getSessionHistory', async () => {
    // Create/finalize an owner session on node-1
    await manager.createSession({
      userId: 'user-1',
      nodeId: 'node-1',
      sessionType: 'owner',
      batteryCapacity: 60,
      chargerPowerRating: 7.2,
    });
    await manager.finalizeSession('node-1', 'user_ended');

    // Create/finalize a guest session on node-2
    await manager.createSession({
      userId: 'user-1',
      nodeId: 'node-2',
      sessionType: 'guest',
      batteryCapacity: 40,
      chargerPowerRating: 3.3,
    });
    await manager.finalizeSession('node-2', 'user_ended');

    const ownerOnly = await manager.getSessionHistory('user-1', { sessionType: 'owner' });
    expect(ownerOnly).toHaveLength(1);
    expect(ownerOnly[0].nodeId).toBe('node-1');

    const node2Only = await manager.getSessionHistory('user-1', { nodeId: 'node-2' });
    expect(node2Only).toHaveLength(1);
    expect(node2Only[0].sessionType).toBe('guest');
  });

  it('should throw when finalizing a non-existent session', async () => {
    await expect(manager.finalizeSession('non-existent', 'user_ended'))
      .rejects.toThrow('No active session found for node: non-existent');
  });
});
