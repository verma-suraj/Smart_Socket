import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SheddingController, type INodeSessionStore, type NodeSessionInfo } from '../../src/modules/alm-engine/shedding-controller.js';
import { LoadAggregator } from '../../src/modules/alm-engine/load-aggregator.js';
import { ThresholdManager } from '../../src/modules/alm-engine/threshold-manager.js';
import type { ITemperatureMonitor } from '../../src/interfaces/temperature-monitor.interface.js';

// Mock temperature monitor — all nodes are healthy (no override)
function createMockTemperatureMonitor(): ITemperatureMonitor {
  return {
    checkTemperature: () => ({ action: 'none' as const }),
    isInOverrideState: () => false,
    canReactivate: () => true,
  };
}

// Mock Firestore for ThresholdManager
function createMockFirestore() {
  return {
    collection: () => ({
      doc: () => ({
        set: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({ exists: false }),
      }),
    }),
  } as any;
}

// Helper to create a simple INodeSessionStore from an array
function createSessionStore(sessions: NodeSessionInfo[]): INodeSessionStore {
  return {
    getActiveNodeSessions: () => sessions,
  };
}

describe('SheddingController', () => {
  let loadAggregator: LoadAggregator;
  let thresholdManager: ThresholdManager;
  let temperatureMonitor: ITemperatureMonitor;

  beforeEach(() => {
    temperatureMonitor = createMockTemperatureMonitor();
    loadAggregator = new LoadAggregator(temperatureMonitor);
    thresholdManager = new ThresholdManager(createMockFirestore());
  });

  describe('No shedding when load is below threshold', () => {
    it('should return empty array when total load is below threshold', async () => {
      // Set threshold to 10000W (default)
      await thresholdManager.setThreshold(10000);

      // Add nodes totaling 8000W (below threshold)
      loadAggregator.updateLoad('node-1', 3000);
      loadAggregator.updateLoad('node-2', 2500);
      loadAggregator.updateLoad('node-3', 2500);

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 5, startTimestamp: 1000 },
        { nodeId: 'node-2', priorityScore: 3, startTimestamp: 2000 },
        { nodeId: 'node-3', priorityScore: 7, startTimestamp: 3000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      expect(results).toEqual([]);
    });

    it('should return empty array when total load equals threshold', async () => {
      await thresholdManager.setThreshold(5000);

      loadAggregator.updateLoad('node-1', 2500);
      loadAggregator.updateLoad('node-2', 2500);

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 5, startTimestamp: 1000 },
        { nodeId: 'node-2', priorityScore: 3, startTimestamp: 2000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      expect(results).toEqual([]);
    });
  });

  describe('Single node shed when load slightly exceeds threshold', () => {
    it('should shed one node with lowest priority', async () => {
      await thresholdManager.setThreshold(5000);

      // Total = 6000W, threshold = 5000W
      loadAggregator.updateLoad('node-1', 3000); // priority 8
      loadAggregator.updateLoad('node-2', 3000); // priority 2 (lowest)

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 8, startTimestamp: 1000 },
        { nodeId: 'node-2', priorityScore: 2, startTimestamp: 2000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      expect(results).toHaveLength(1);
      expect(results[0].nodeId).toBe('node-2');
      expect(results[0].reason).toBe('alm_overload');
      expect(results[0].priorityScore).toBe(2);
    });

    it('should mark shed node as inactive in load aggregator', async () => {
      await thresholdManager.setThreshold(5000);

      loadAggregator.updateLoad('node-1', 3000);
      loadAggregator.updateLoad('node-2', 3000);

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 8, startTimestamp: 1000 },
        { nodeId: 'node-2', priorityScore: 2, startTimestamp: 2000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      await controller.evaluateAndShed();

      // node-2 should be marked inactive
      expect(loadAggregator.isActive('node-2')).toBe(false);
      // Total load should now only include node-1
      expect(loadAggregator.getTotalLoad()).toBe(3000);
    });
  });

  describe('Multiple nodes shed iteratively until load drops below threshold', () => {
    it('should shed multiple nodes in priority order', async () => {
      await thresholdManager.setThreshold(3000);

      // Total = 12000W, need to shed until ≤ 3000W
      loadAggregator.updateLoad('node-1', 3000); // priority 10 (highest)
      loadAggregator.updateLoad('node-2', 3000); // priority 5
      loadAggregator.updateLoad('node-3', 3000); // priority 2 (lowest)
      loadAggregator.updateLoad('node-4', 3000); // priority 7

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 10, startTimestamp: 1000 },
        { nodeId: 'node-2', priorityScore: 5, startTimestamp: 2000 },
        { nodeId: 'node-3', priorityScore: 2, startTimestamp: 3000 },
        { nodeId: 'node-4', priorityScore: 7, startTimestamp: 4000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      // Should shed node-3 (priority 2), node-2 (priority 5), node-4 (priority 7)
      // After shedding 3 nodes: 12000 - 3000 - 3000 - 3000 = 3000 ≤ threshold
      expect(results).toHaveLength(3);
      expect(results[0].nodeId).toBe('node-3'); // priority 2
      expect(results[1].nodeId).toBe('node-2'); // priority 5
      expect(results[2].nodeId).toBe('node-4'); // priority 7
    });

    it('should stop shedding as soon as load drops to threshold', async () => {
      await thresholdManager.setThreshold(5000);

      // Total = 8000W, threshold = 5000W
      // Shedding node-3 (2000W) brings total to 6000W (still > 5000)
      // Shedding node-2 (3000W) brings total to 3000W (≤ 5000) — stop
      loadAggregator.updateLoad('node-1', 3000); // priority 10
      loadAggregator.updateLoad('node-2', 3000); // priority 3
      loadAggregator.updateLoad('node-3', 2000); // priority 1 (lowest)

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 10, startTimestamp: 1000 },
        { nodeId: 'node-2', priorityScore: 3, startTimestamp: 2000 },
        { nodeId: 'node-3', priorityScore: 1, startTimestamp: 3000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      expect(results).toHaveLength(2);
      expect(results[0].nodeId).toBe('node-3'); // priority 1
      expect(results[1].nodeId).toBe('node-2'); // priority 3
      // node-1 should remain active
      expect(loadAggregator.isActive('node-1')).toBe(true);
    });
  });

  describe('Tie-breaker logic: same priority → longest running shed first', () => {
    it('should shed the node with smallest startTimestamp when priorities are equal', async () => {
      await thresholdManager.setThreshold(3000);

      // Total = 6000W, threshold = 3000W
      loadAggregator.updateLoad('node-1', 3000); // priority 5, started first (longest running)
      loadAggregator.updateLoad('node-2', 3000); // priority 5, started later

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 5, startTimestamp: 1000 }, // longest running
        { nodeId: 'node-2', priorityScore: 5, startTimestamp: 5000 }, // shorter running
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      // node-1 has same priority but started first (longest running) → shed first
      expect(results[0].nodeId).toBe('node-1');
    });

    it('should correctly order multiple nodes with same priority by start time', async () => {
      await thresholdManager.setThreshold(2000);

      // Total = 9000W, threshold = 2000W — need to shed most nodes
      loadAggregator.updateLoad('node-a', 3000); // priority 3, started at 5000
      loadAggregator.updateLoad('node-b', 3000); // priority 3, started at 1000 (longest)
      loadAggregator.updateLoad('node-c', 3000); // priority 3, started at 3000

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-a', priorityScore: 3, startTimestamp: 5000 },
        { nodeId: 'node-b', priorityScore: 3, startTimestamp: 1000 },
        { nodeId: 'node-c', priorityScore: 3, startTimestamp: 3000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      // Order: node-b (started 1000), node-c (started 3000), node-a should NOT be shed
      // After node-b: 9000 - 3000 = 6000 > 2000
      // After node-c: 6000 - 3000 = 3000 > 2000
      // After node-a: 3000 - 3000 = 0 ≤ 2000
      expect(results).toHaveLength(3);
      expect(results[0].nodeId).toBe('node-b'); // started 1000
      expect(results[1].nodeId).toBe('node-c'); // started 3000
      expect(results[2].nodeId).toBe('node-a'); // started 5000
    });

    it('should use tie-breaker only for equal priorities', async () => {
      await thresholdManager.setThreshold(4000);

      // Total = 9000W
      loadAggregator.updateLoad('node-1', 3000); // priority 5, started recently
      loadAggregator.updateLoad('node-2', 3000); // priority 2, started long ago
      loadAggregator.updateLoad('node-3', 3000); // priority 2, started recently

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 5, startTimestamp: 9000 },
        { nodeId: 'node-2', priorityScore: 2, startTimestamp: 1000 }, // lowest priority, longest running
        { nodeId: 'node-3', priorityScore: 2, startTimestamp: 5000 }, // lowest priority, shorter running
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      // First shed: node-2 (priority 2, started at 1000 — longest running among tied)
      // After: 9000 - 3000 = 6000 > 4000
      // Second shed: node-3 (priority 2, started at 5000)
      // After: 6000 - 3000 = 3000 ≤ 4000 — stop
      expect(results).toHaveLength(2);
      expect(results[0].nodeId).toBe('node-2');
      expect(results[1].nodeId).toBe('node-3');
      // node-1 (priority 5) should not be shed
      expect(loadAggregator.isActive('node-1')).toBe(true);
    });
  });

  describe('Empty node set scenario', () => {
    it('should return empty array when no active sessions exist', async () => {
      await thresholdManager.setThreshold(5000);

      // Load is above threshold but no sessions tracked
      loadAggregator.updateLoad('node-1', 6000);

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore([]));
      const results = await controller.evaluateAndShed();

      expect(results).toEqual([]);
    });

    it('should return empty array when no nodes are contributing load', async () => {
      await thresholdManager.setThreshold(5000);

      // No load at all
      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 5, startTimestamp: 1000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      expect(results).toEqual([]);
    });
  });

  describe('All nodes same priority', () => {
    it('should shed all equally-prioritized nodes by start time (longest first)', async () => {
      await thresholdManager.setThreshold(3000);

      // Total = 8000W, threshold = 3000W
      loadAggregator.updateLoad('node-a', 2000);
      loadAggregator.updateLoad('node-b', 2000);
      loadAggregator.updateLoad('node-c', 2000);
      loadAggregator.updateLoad('node-d', 2000);

      // All have priority 0 (e.g., guests without specs)
      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-a', priorityScore: 0, startTimestamp: 4000 },
        { nodeId: 'node-b', priorityScore: 0, startTimestamp: 1000 }, // longest running
        { nodeId: 'node-c', priorityScore: 0, startTimestamp: 3000 },
        { nodeId: 'node-d', priorityScore: 0, startTimestamp: 2000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      // Sorted order by startTimestamp: node-b(1000), node-d(2000), node-c(3000), node-a(4000)
      // After node-b: 8000 - 2000 = 6000 > 3000
      // After node-d: 6000 - 2000 = 4000 > 3000
      // After node-c: 4000 - 2000 = 2000 ≤ 3000 — stop
      expect(results).toHaveLength(3);
      expect(results[0].nodeId).toBe('node-b');
      expect(results[1].nodeId).toBe('node-d');
      expect(results[2].nodeId).toBe('node-c');
      // node-a should remain
      expect(loadAggregator.isActive('node-a')).toBe(true);
    });
  });

  describe('ShedResult structure', () => {
    it('should include correct fields in each ShedResult', async () => {
      await thresholdManager.setThreshold(2000);

      loadAggregator.updateLoad('node-1', 3000);

      const sessions: NodeSessionInfo[] = [
        { nodeId: 'node-1', priorityScore: 4.5, startTimestamp: 1000 },
      ];

      const controller = new SheddingController(loadAggregator, thresholdManager, createSessionStore(sessions));
      const results = await controller.evaluateAndShed();

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        nodeId: 'node-1',
        reason: 'alm_overload',
        priorityScore: 4.5,
      });
      expect(results[0].timestamp).toBeTypeOf('number');
      expect(results[0].timestamp).toBeGreaterThan(0);
    });
  });
});
