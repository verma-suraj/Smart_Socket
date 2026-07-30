import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeRegistry, type NodeRegistryCallbacks } from '../../src/modules/node-registry/index.js';
import type { RegisterNodeParams } from '../../src/models/index.js';

/**
 * Unit tests for the NodeRegistry module.
 * Validates Requirements: 2.1, 2.2, 2.3, 2.4, 13.5
 */

// Mock Firestore
function createMockFirestore() {
  const mockDoc = {
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const mockCollection = {
    doc: vi.fn().mockReturnValue(mockDoc),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue({ docs: [] }),
  };
  const firestore = {
    collection: vi.fn().mockReturnValue(mockCollection),
  };
  return { firestore: firestore as any, mockCollection, mockDoc };
}

describe('NodeRegistry', () => {
  let registry: NodeRegistry;
  let mockFirestore: ReturnType<typeof createMockFirestore>;
  let callbacks: NodeRegistryCallbacks;

  beforeEach(() => {
    mockFirestore = createMockFirestore();
    callbacks = {
      onRegister: vi.fn(),
      onDeregister: vi.fn(),
    };
    registry = new NodeRegistry(mockFirestore.firestore, callbacks);
  });

  describe('registerNode()', () => {
    it('should create a node record with correct metadata', async () => {
      const params: RegisterNodeParams = {
        nodeId: 'node-001',
        displayName: 'Socket A1',
        locationLabel: 'Parking Lot A',
      };

      const result = await registry.registerNode(params);

      expect(result.nodeId).toBe('node-001');
      expect(result.displayName).toBe('Socket A1');
      expect(result.locationLabel).toBe('Parking Lot A');
      expect(result.active).toBe(true);
      expect(result.inTemperatureOverride).toBe(false);
      expect(result.registrationDate).toBeGreaterThan(0);
      expect(result.lastSeenTimestamp).toBeGreaterThan(0);
    });

    it('should persist the node to Firestore', async () => {
      const params: RegisterNodeParams = {
        nodeId: 'node-002',
        displayName: 'Socket B1',
        locationLabel: 'Parking Lot B',
      };

      await registry.registerNode(params);

      expect(mockFirestore.firestore.collection).toHaveBeenCalledWith('nodes');
      expect(mockFirestore.mockCollection.doc).toHaveBeenCalledWith('node-002');
      expect(mockFirestore.mockDoc.set).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeId: 'node-002',
          displayName: 'Socket B1',
          locationLabel: 'Parking Lot B',
          active: true,
          lastTelemetry: null,
          temperatureOverrideSince: null,
        })
      );
    });

    it('should trigger onRegister callback', async () => {
      const params: RegisterNodeParams = {
        nodeId: 'node-003',
        displayName: 'Socket C1',
        locationLabel: 'Parking Lot C',
      };

      await registry.registerNode(params);

      expect(callbacks.onRegister).toHaveBeenCalledWith('node-003');
    });

    it('should add the node to in-memory cache', async () => {
      const params: RegisterNodeParams = {
        nodeId: 'node-004',
        displayName: 'Socket D1',
        locationLabel: 'Building D',
      };

      await registry.registerNode(params);

      const node = registry.getNode('node-004');
      expect(node).not.toBeNull();
      expect(node!.nodeId).toBe('node-004');
      expect(node!.active).toBe(true);
    });
  });

  describe('deregisterNode()', () => {
    it('should mark node as inactive in memory', async () => {
      await registry.registerNode({
        nodeId: 'node-005',
        displayName: 'Socket E1',
        locationLabel: 'Garage',
      });

      await registry.deregisterNode('node-005');

      const node = registry.getNode('node-005');
      expect(node).not.toBeNull();
      expect(node!.active).toBe(false);
    });

    it('should update Firestore with inactive status', async () => {
      await registry.registerNode({
        nodeId: 'node-006',
        displayName: 'Socket F1',
        locationLabel: 'Garage',
      });

      await registry.deregisterNode('node-006');

      expect(mockFirestore.mockDoc.update).toHaveBeenCalledWith({ active: false });
    });

    it('should trigger onDeregister callback', async () => {
      await registry.registerNode({
        nodeId: 'node-007',
        displayName: 'Socket G1',
        locationLabel: 'Garage',
      });

      await registry.deregisterNode('node-007');

      expect(callbacks.onDeregister).toHaveBeenCalledWith('node-007');
    });

    it('should exclude deregistered node from getAllActiveNodes', async () => {
      await registry.registerNode({
        nodeId: 'node-008',
        displayName: 'Socket H1',
        locationLabel: 'Garage',
      });
      await registry.registerNode({
        nodeId: 'node-009',
        displayName: 'Socket H2',
        locationLabel: 'Garage',
      });

      await registry.deregisterNode('node-008');

      const active = registry.getAllActiveNodes();
      expect(active).toHaveLength(1);
      expect(active[0].nodeId).toBe('node-009');
    });
  });

  describe('getNode()', () => {
    it('should return null for non-existent node', () => {
      expect(registry.getNode('non-existent')).toBeNull();
    });

    it('should return the node record for a registered node', async () => {
      await registry.registerNode({
        nodeId: 'node-010',
        displayName: 'Socket J1',
        locationLabel: 'Office',
      });

      const node = registry.getNode('node-010');
      expect(node).not.toBeNull();
      expect(node!.displayName).toBe('Socket J1');
    });
  });

  describe('getAllActiveNodes()', () => {
    it('should return empty array when no nodes registered', () => {
      expect(registry.getAllActiveNodes()).toEqual([]);
    });

    it('should return only active nodes', async () => {
      await registry.registerNode({ nodeId: 'n1', displayName: 'N1', locationLabel: 'L1' });
      await registry.registerNode({ nodeId: 'n2', displayName: 'N2', locationLabel: 'L2' });
      await registry.registerNode({ nodeId: 'n3', displayName: 'N3', locationLabel: 'L3' });

      await registry.deregisterNode('n2');

      const active = registry.getAllActiveNodes();
      expect(active).toHaveLength(2);
      expect(active.map(n => n.nodeId).sort()).toEqual(['n1', 'n3']);
    });
  });

  describe('updateLastSeen()', () => {
    it('should update the lastSeenTimestamp of a registered node', async () => {
      await registry.registerNode({
        nodeId: 'node-011',
        displayName: 'Socket K1',
        locationLabel: 'Office',
      });

      const newTimestamp = Date.now() + 5000;
      registry.updateLastSeen('node-011', newTimestamp);

      const node = registry.getNode('node-011');
      expect(node!.lastSeenTimestamp).toBe(newTimestamp);
    });

    it('should be a no-op for non-existent node', () => {
      // Should not throw
      expect(() => registry.updateLastSeen('non-existent', Date.now())).not.toThrow();
    });
  });

  describe('getStaleNodes()', () => {
    it('should return nodes whose lastSeen exceeds the threshold', async () => {
      await registry.registerNode({
        nodeId: 'stale-1',
        displayName: 'Stale Node',
        locationLabel: 'Corner',
      });

      // Manually set lastSeenTimestamp to 60 seconds ago
      const node = registry.getNode('stale-1')!;
      node.lastSeenTimestamp = Date.now() - 60000;

      const stale = registry.getStaleNodes(30000);
      expect(stale).toHaveLength(1);
      expect(stale[0].nodeId).toBe('stale-1');
    });

    it('should not return nodes that reported recently', async () => {
      await registry.registerNode({
        nodeId: 'fresh-1',
        displayName: 'Fresh Node',
        locationLabel: 'Corner',
      });

      // lastSeenTimestamp is set to Date.now() during registration
      const stale = registry.getStaleNodes(30000);
      expect(stale).toHaveLength(0);
    });

    it('should not return inactive nodes as stale', async () => {
      await registry.registerNode({
        nodeId: 'inactive-1',
        displayName: 'Inactive Node',
        locationLabel: 'Corner',
      });

      const node = registry.getNode('inactive-1')!;
      node.lastSeenTimestamp = Date.now() - 60000;

      await registry.deregisterNode('inactive-1');

      const stale = registry.getStaleNodes(30000);
      expect(stale).toHaveLength(0);
    });

    it('should use default threshold of 30000ms when not specified', async () => {
      await registry.registerNode({
        nodeId: 'default-threshold-node',
        displayName: 'DT Node',
        locationLabel: 'Main',
      });

      const node = registry.getNode('default-threshold-node')!;
      node.lastSeenTimestamp = Date.now() - 31000; // 31 seconds ago

      const stale = registry.getStaleNodes();
      expect(stale).toHaveLength(1);
    });

    it('should not return node that is exactly at the threshold boundary', async () => {
      await registry.registerNode({
        nodeId: 'boundary-node',
        displayName: 'Boundary Node',
        locationLabel: 'Main',
      });

      const now = Date.now();
      const node = registry.getNode('boundary-node')!;
      // Set to exactly 30 seconds ago — should NOT be stale (need > 30s)
      node.lastSeenTimestamp = now - 30000;

      // Use a fixed "now" reference by providing a specific threshold
      // Since getStaleNodes uses Date.now() internally, if lastSeen == now - threshold,
      // then now - lastSeen == threshold, which is NOT > threshold
      const stale = registry.getStaleNodes(30000);
      // This test may be flaky due to timing but validates the > logic
      expect(stale).toHaveLength(0);
    });
  });

  describe('callbacks are optional', () => {
    it('should work without callbacks', async () => {
      const registryNoCallbacks = new NodeRegistry(mockFirestore.firestore);

      const result = await registryNoCallbacks.registerNode({
        nodeId: 'no-cb-1',
        displayName: 'No CB',
        locationLabel: 'Test',
      });

      expect(result.nodeId).toBe('no-cb-1');

      // Should not throw even without onDeregister callback
      await expect(registryNoCallbacks.deregisterNode('no-cb-1')).resolves.toBeUndefined();
    });
  });
});
