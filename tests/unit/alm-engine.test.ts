import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AlmEngine } from '../../src/modules/alm-engine/index.js';
import type { ITemperatureMonitor } from '../../src/interfaces/temperature-monitor.interface.js';

/**
 * Creates a minimal temperature monitor mock for testing.
 */
function createTemperatureMonitorMock(): ITemperatureMonitor & {
  _setOverride: (nodeId: string) => void;
  _clearOverride: (nodeId: string) => void;
} {
  const overrideNodes = new Set<string>();

  return {
    checkTemperature: vi.fn().mockReturnValue({ action: 'none' }),
    isInOverrideState: vi.fn((nodeId: string) => overrideNodes.has(nodeId)),
    canReactivate: vi.fn().mockReturnValue(true),
    _setOverride: (nodeId: string) => overrideNodes.add(nodeId),
    _clearOverride: (nodeId: string) => overrideNodes.delete(nodeId),
  } as any;
}

/**
 * Creates a mock Firestore instance with set/get operations.
 */
function createFirestoreMock() {
  const store: Record<string, any> = {};

  const docRef = {
    set: vi.fn(async (data: any, _opts?: any) => {
      Object.assign(store, data);
    }),
    get: vi.fn(async () => ({
      exists: Object.keys(store).length > 0,
      data: () => ({ ...store }),
    })),
  };

  const collectionRef = {
    doc: vi.fn(() => docRef),
  };

  const firestore = {
    collection: vi.fn(() => collectionRef),
  };

  return { firestore, docRef, store };
}

describe('AlmEngine – Edge Cases', () => {
  let engine: AlmEngine;
  let tempMonitor: ReturnType<typeof createTemperatureMonitorMock>;
  let firestoreMock: ReturnType<typeof createFirestoreMock>;

  beforeEach(() => {
    tempMonitor = createTemperatureMonitorMock();
    firestoreMock = createFirestoreMock();
    engine = new AlmEngine(firestoreMock.firestore as any, tempMonitor);
  });

  describe('Zero active nodes scenario (Requirement 4.1, 4.2)', () => {
    it('should return empty ShedResult array when no nodes are registered', async () => {
      // Threshold is 10000W by default, total load is 0
      const results = await engine.evaluateAndShed();
      expect(results).toEqual([]);
    });

    it('should return empty ShedResult array when load exceeds threshold but no active node sessions exist', async () => {
      // Set threshold low so we exceed it
      await engine.setThreshold(1000);

      // Add load without registering node priorities (no sessions)
      engine.updateLoad('node-1', 2000);
      engine.updateLoad('node-2', 3000);

      // Total load (5000) > threshold (1000), but no node sessions registered
      const results = await engine.evaluateAndShed();
      expect(results).toEqual([]);
    });

    it('should return empty ShedResult array when all nodes are in temperature override', async () => {
      await engine.setThreshold(1000);

      engine.updateLoad('node-1', 2000);
      engine.setNodePriority('node-1', 5, Date.now() - 60000);

      // Put node in override — it won't be a contributing node
      tempMonitor._setOverride('node-1');

      // Total load is 0 (node-1 excluded by override), so no shedding needed
      const results = await engine.evaluateAndShed();
      expect(results).toEqual([]);
    });
  });

  describe('All nodes same priority – tie-breaker (Requirement 4.2)', () => {
    it('should shed the longest running node first when priorities are equal', async () => {
      await engine.setThreshold(3000);

      // Three nodes, each drawing 2000W. Total = 6000W > 3000W threshold.
      engine.updateLoad('node-A', 2000);
      engine.updateLoad('node-B', 2000);
      engine.updateLoad('node-C', 2000);

      // All have priority 5, but different start times
      // node-A started earliest (longest running) → shed first
      const now = Date.now();
      engine.setNodePriority('node-A', 5, now - 30000); // started 30s ago
      engine.setNodePriority('node-B', 5, now - 20000); // started 20s ago
      engine.setNodePriority('node-C', 5, now - 10000); // started 10s ago

      const results = await engine.evaluateAndShed();

      // Need to shed until total ≤ 3000W
      // After shedding node-A: total = 4000W > 3000W → continue
      // After shedding node-B: total = 2000W ≤ 3000W → stop
      expect(results).toHaveLength(2);
      expect(results[0].nodeId).toBe('node-A'); // longest running shed first
      expect(results[1].nodeId).toBe('node-B'); // second longest running shed second
      expect(results[0].reason).toBe('alm_overload');
      expect(results[1].reason).toBe('alm_overload');
    });

    it('should shed only one node when removing one is enough to drop below threshold', async () => {
      await engine.setThreshold(3000);

      // Two nodes: total = 4000W > 3000W
      engine.updateLoad('node-X', 2000);
      engine.updateLoad('node-Y', 2000);

      const now = Date.now();
      // Same priority; node-X started earlier
      engine.setNodePriority('node-X', 10, now - 60000);
      engine.setNodePriority('node-Y', 10, now - 5000);

      const results = await engine.evaluateAndShed();

      // Shed node-X (longest running): total = 2000W ≤ 3000W → done
      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe('node-X');
      expect(results[0].priorityScore).toBe(10);
    });

    it('should respect priority order before tie-breaking by timestamp', async () => {
      await engine.setThreshold(2000);

      // Three nodes: total = 6000W > 2000W
      engine.updateLoad('node-low', 2000);
      engine.updateLoad('node-high-old', 2000);
      engine.updateLoad('node-high-new', 2000);

      const now = Date.now();
      // node-low has lower priority (1) → shed first regardless of start time
      engine.setNodePriority('node-low', 1, now - 5000);
      // node-high-old has higher priority (10) but started earlier
      engine.setNodePriority('node-high-old', 10, now - 60000);
      // node-high-new has higher priority (10) but started later
      engine.setNodePriority('node-high-new', 10, now - 1000);

      const results = await engine.evaluateAndShed();

      // After shedding node-low (priority 1): total = 4000W > 2000W
      // After shedding node-high-old (priority 10, older): total = 2000W ≤ 2000W → stop
      expect(results).toHaveLength(2);
      expect(results[0].nodeId).toBe('node-low'); // lowest priority first
      expect(results[1].nodeId).toBe('node-high-old'); // tie-breaker: longest running
    });
  });

  describe('Threshold update mid-evaluation (Requirement 4.4)', () => {
    it('should use the new threshold immediately after setThreshold', async () => {
      // Initial: total 5000W, threshold 10000W → no shedding needed
      engine.updateLoad('node-1', 2500);
      engine.updateLoad('node-2', 2500);
      engine.setNodePriority('node-1', 3, Date.now() - 10000);
      engine.setNodePriority('node-2', 5, Date.now() - 5000);

      const resultsBefore = await engine.evaluateAndShed();
      expect(resultsBefore).toEqual([]);

      // Lower threshold to 2000W → now 5000W > 2000W → should shed
      await engine.setThreshold(2000);
      expect(engine.getThreshold()).toBe(2000);

      const resultsAfter = await engine.evaluateAndShed();

      // Should shed node-1 (priority 3, lower) first: total = 2500W > 2000W
      // Then shed node-2 (priority 5): total = 0W ≤ 2000W
      expect(resultsAfter.length).toBeGreaterThan(0);
      expect(resultsAfter[0].nodeId).toBe('node-1');
    });

    it('should stop shedding when threshold is raised mid-session', async () => {
      // Start with low threshold: total 6000W > 3000W threshold
      await engine.setThreshold(3000);

      engine.updateLoad('node-A', 3000);
      engine.updateLoad('node-B', 3000);
      engine.setNodePriority('node-A', 2, Date.now() - 20000);
      engine.setNodePriority('node-B', 4, Date.now() - 10000);

      // This should shed (6000 > 3000)
      const results1 = await engine.evaluateAndShed();
      expect(results1.length).toBeGreaterThan(0);

      // Now raise threshold above total → no shedding needed
      await engine.setThreshold(50000);

      // Re-add the nodes (simulating new sessions)
      engine.updateLoad('node-C', 3000);
      engine.updateLoad('node-D', 3000);
      engine.setNodePriority('node-C', 2, Date.now() - 20000);
      engine.setNodePriority('node-D', 4, Date.now() - 10000);

      const results2 = await engine.evaluateAndShed();
      expect(results2).toEqual([]);
    });

    it('should reflect threshold changes in getThreshold() immediately', async () => {
      expect(engine.getThreshold()).toBe(10000); // default

      await engine.setThreshold(5000);
      expect(engine.getThreshold()).toBe(5000);

      await engine.setThreshold(15000);
      expect(engine.getThreshold()).toBe(15000);
    });
  });
});
