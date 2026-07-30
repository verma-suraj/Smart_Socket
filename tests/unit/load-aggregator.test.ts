import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoadAggregator } from '../../src/modules/alm-engine/load-aggregator.js';
import type { ITemperatureMonitor } from '../../src/interfaces/temperature-monitor.interface.js';

/**
 * Creates a minimal temperature monitor mock for testing.
 */
function createTemperatureMonitorMock(): ITemperatureMonitor {
  const overrideNodes = new Set<string>();

  return {
    checkTemperature: vi.fn().mockReturnValue({ action: 'none' }),
    isInOverrideState: vi.fn((nodeId: string) => overrideNodes.has(nodeId)),
    canReactivate: vi.fn().mockReturnValue(true),
    // Helper to simulate override state in tests
    _setOverride: (nodeId: string) => overrideNodes.add(nodeId),
    _clearOverride: (nodeId: string) => overrideNodes.delete(nodeId),
  } as any;
}

describe('LoadAggregator', () => {
  let aggregator: LoadAggregator;
  let tempMonitor: ReturnType<typeof createTemperatureMonitorMock>;

  beforeEach(() => {
    tempMonitor = createTemperatureMonitorMock();
    aggregator = new LoadAggregator(tempMonitor);
  });

  describe('updateLoad', () => {
    it('should store the power value for a node', () => {
      aggregator.updateLoad('node-1', 1500);
      expect(aggregator.getNodePower('node-1')).toBe(1500);
    });

    it('should overwrite previous power value for the same node', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-1', 2000);
      expect(aggregator.getNodePower('node-1')).toBe(2000);
    });

    it('should track multiple nodes independently', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      expect(aggregator.getNodePower('node-1')).toBe(1500);
      expect(aggregator.getNodePower('node-2')).toBe(2500);
    });
  });

  describe('getTotalLoad', () => {
    it('should return 0 when no nodes are tracked', () => {
      expect(aggregator.getTotalLoad()).toBe(0);
    });

    it('should sum power values of all active nodes', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      aggregator.updateLoad('node-3', 1000);
      expect(aggregator.getTotalLoad()).toBe(5000);
    });

    it('should exclude inactive nodes from the total', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      aggregator.markInactive('node-2');
      expect(aggregator.getTotalLoad()).toBe(1500);
    });

    it('should exclude nodes in temperature override from the total', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      (tempMonitor as any)._setOverride('node-2');
      expect(aggregator.getTotalLoad()).toBe(1500);
    });

    it('should exclude both inactive and override nodes', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      aggregator.updateLoad('node-3', 3000);
      aggregator.markInactive('node-2');
      (tempMonitor as any)._setOverride('node-3');
      expect(aggregator.getTotalLoad()).toBe(1500);
    });

    it('should include a node again after marking it active', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      aggregator.markInactive('node-2');
      expect(aggregator.getTotalLoad()).toBe(1500);

      aggregator.markActive('node-2');
      expect(aggregator.getTotalLoad()).toBe(4000);
    });

    it('should include a node after temperature override clears', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      (tempMonitor as any)._setOverride('node-2');
      expect(aggregator.getTotalLoad()).toBe(1500);

      (tempMonitor as any)._clearOverride('node-2');
      expect(aggregator.getTotalLoad()).toBe(4000);
    });
  });

  describe('getNodePower', () => {
    it('should return 0 for unknown nodes', () => {
      expect(aggregator.getNodePower('unknown')).toBe(0);
    });

    it('should return the latest power value for tracked nodes', () => {
      aggregator.updateLoad('node-1', 1234);
      expect(aggregator.getNodePower('node-1')).toBe(1234);
    });
  });

  describe('markInactive / markActive / isActive', () => {
    it('should mark a node as inactive', () => {
      aggregator.markInactive('node-1');
      expect(aggregator.isActive('node-1')).toBe(false);
    });

    it('should mark a node as active', () => {
      aggregator.markInactive('node-1');
      aggregator.markActive('node-1');
      expect(aggregator.isActive('node-1')).toBe(true);
    });

    it('should treat nodes as active by default', () => {
      aggregator.updateLoad('node-1', 1000);
      expect(aggregator.isActive('node-1')).toBe(true);
    });
  });

  describe('removeNode', () => {
    it('should remove power tracking and inactive status', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.markInactive('node-1');
      aggregator.removeNode('node-1');

      expect(aggregator.getNodePower('node-1')).toBe(0);
      expect(aggregator.isActive('node-1')).toBe(true); // no longer in inactive set
    });

    it('should not affect other nodes', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      aggregator.removeNode('node-1');

      expect(aggregator.getTotalLoad()).toBe(2500);
    });
  });

  describe('getContributingNodes', () => {
    it('should return empty array when no nodes exist', () => {
      expect(aggregator.getContributingNodes()).toEqual([]);
    });

    it('should return only active, non-override nodes', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);
      aggregator.updateLoad('node-3', 3000);
      aggregator.markInactive('node-2');
      (tempMonitor as any)._setOverride('node-3');

      expect(aggregator.getContributingNodes()).toEqual(['node-1']);
    });

    it('should return all nodes when none are excluded', () => {
      aggregator.updateLoad('node-1', 1500);
      aggregator.updateLoad('node-2', 2500);

      const result = aggregator.getContributingNodes();
      expect(result).toContain('node-1');
      expect(result).toContain('node-2');
      expect(result).toHaveLength(2);
    });
  });
});
