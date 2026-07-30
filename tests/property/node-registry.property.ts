import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { NodeRegistry } from '../../src/modules/node-registry/index.js';

/**
 * Property-based tests for NodeRegistry: staleness detection and deregistration.
 * Validates: Requirements 2.2, 13.5
 */

// --- Mock helpers ---

/** Creates a minimal mock Firestore that supports methods used by NodeRegistry. */
function createMockFirestore(): any {
  return {
    collection: () => ({
      doc: () => ({
        set: async () => {},
        update: async () => {},
      }),
      where: () => ({
        get: async () => ({ docs: [] }),
      }),
    }),
  };
}

// --- Arbitraries ---

/** Generates a unique node ID string. */
const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{4,8}$/);

/** Generates a display name. */
const displayNameArb = fc.stringMatching(/^[A-Za-z ]{3,20}$/);

/** Generates a location label. */
const locationLabelArb = fc.stringMatching(/^[A-Za-z0-9 ]{3,15}$/);

/** Generates a RegisterNodeParams record with unique nodeId. */
const registerNodeParamsArb = fc.record({
  nodeId: nodeIdArb,
  displayName: displayNameArb,
  locationLabel: locationLabelArb,
});

/** Generates a list of unique RegisterNodeParams. */
const uniqueNodeParamsArb = fc.uniqueArray(registerNodeParamsArb, {
  minLength: 1,
  maxLength: 15,
  selector: (p) => p.nodeId,
});

// --- Property 20: Node Staleness Detection ---

describe('Feature: smart-socket-backend, Property 20: Node Staleness Detection', () => {
  /**
   * **Validates: Requirements 13.5**
   *
   * For any registered ESP32_Node whose last telemetry timestamp is more than 30 seconds
   * older than the current time, the system SHALL report that node as "stale" or "offline".
   */

  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dateNowSpy = vi.spyOn(Date, 'now');
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it('nodes with lastSeenTimestamp older than threshold are reported as stale', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueNodeParamsArb,
        fc.integer({ min: 31000, max: 120000 }), // staleDelta: always > 30s threshold
        async (nodeParams, staleDelta) => {
          const mockFirestore = createMockFirestore();
          const registry = new NodeRegistry(mockFirestore);

          const registrationTime = 1_000_000_000;
          dateNowSpy.mockReturnValue(registrationTime);

          // Register all nodes
          for (const params of nodeParams) {
            await registry.registerNode(params);
          }

          // Set lastSeen to registrationTime for all nodes (they were just registered)
          // Now advance time by staleDelta (>30s)
          const currentTime = registrationTime + staleDelta;
          dateNowSpy.mockReturnValue(currentTime);

          // All nodes should be stale since their lastSeen is registrationTime
          // and currentTime - registrationTime > 30000
          const staleNodes = registry.getStaleNodes(30000);

          expect(staleNodes.length).toBe(nodeParams.length);
          for (const staleNode of staleNodes) {
            expect(currentTime - staleNode.lastSeenTimestamp).toBeGreaterThan(30000);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('nodes with recent telemetry (within threshold) are NOT reported as stale', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueNodeParamsArb,
        fc.integer({ min: 0, max: 29999 }), // freshDelta: always < 30s threshold
        async (nodeParams, freshDelta) => {
          const mockFirestore = createMockFirestore();
          const registry = new NodeRegistry(mockFirestore);

          const registrationTime = 1_000_000_000;
          dateNowSpy.mockReturnValue(registrationTime);

          // Register all nodes
          for (const params of nodeParams) {
            await registry.registerNode(params);
          }

          // Update lastSeen to a recent timestamp
          const recentTimestamp = registrationTime + 50000;
          for (const params of nodeParams) {
            registry.updateLastSeen(params.nodeId, recentTimestamp);
          }

          // Set current time within threshold of recentTimestamp
          const currentTime = recentTimestamp + freshDelta;
          dateNowSpy.mockReturnValue(currentTime);

          const staleNodes = registry.getStaleNodes(30000);

          // No nodes should be stale
          expect(staleNodes.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mixed freshness: only nodes exceeding threshold appear as stale', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueNodeParamsArb.filter((nodes) => nodes.length >= 2),
        fc.integer({ min: 1 }), // seed for splitting fresh vs stale
        async (nodeParams, splitSeed) => {
          const mockFirestore = createMockFirestore();
          const registry = new NodeRegistry(mockFirestore);

          const baseTime = 1_000_000_000;
          dateNowSpy.mockReturnValue(baseTime);

          // Register all nodes
          for (const params of nodeParams) {
            await registry.registerNode(params);
          }

          // Split nodes into fresh and stale groups
          const splitIndex = (splitSeed % (nodeParams.length - 1)) + 1;
          const staleGroup = nodeParams.slice(0, splitIndex);
          const freshGroup = nodeParams.slice(splitIndex);

          // Current time is baseTime + 60000 (60s from registration)
          const currentTime = baseTime + 60000;
          dateNowSpy.mockReturnValue(currentTime);

          // Fresh group: update lastSeen to be within threshold (< 30s ago)
          for (const params of freshGroup) {
            registry.updateLastSeen(params.nodeId, currentTime - 10000); // 10s ago
          }

          // Stale group: leave lastSeen at registration time (60s ago > 30s threshold)
          // They were registered at baseTime, so lastSeen = baseTime
          // currentTime - baseTime = 60000 > 30000 ✓

          const staleNodes = registry.getStaleNodes(30000);

          // Only the stale group should appear
          const staleNodeIds = new Set(staleNodes.map((n) => n.nodeId));
          for (const params of staleGroup) {
            expect(staleNodeIds.has(params.nodeId)).toBe(true);
          }
          for (const params of freshGroup) {
            expect(staleNodeIds.has(params.nodeId)).toBe(false);
          }
          expect(staleNodes.length).toBe(staleGroup.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 22: Node Deregistration Exclusion ---

describe('Feature: smart-socket-backend, Property 22: Node Deregistration Exclusion', () => {
  /**
   * **Validates: Requirements 2.2**
   *
   * For any deregistered ESP32_Node, the node SHALL be marked inactive, excluded from
   * Total_Transformer_Load calculations, and its MQTT topic subscriptions SHALL be removed.
   */

  it('deregistered nodes are marked inactive and excluded from active node list', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueNodeParamsArb.filter((nodes) => nodes.length >= 2),
        fc.integer({ min: 1 }), // seed for choosing how many to deregister
        async (nodeParams, deregSeed) => {
          const mockFirestore = createMockFirestore();
          const registry = new NodeRegistry(mockFirestore);

          // Register all nodes
          for (const params of nodeParams) {
            await registry.registerNode(params);
          }

          // Deregister a subset
          const deregCount = (deregSeed % (nodeParams.length - 1)) + 1;
          const deregisteredNodes = nodeParams.slice(0, deregCount);
          const remainingNodes = nodeParams.slice(deregCount);

          for (const params of deregisteredNodes) {
            await registry.deregisterNode(params.nodeId);
          }

          // Check: deregistered nodes are marked inactive
          for (const params of deregisteredNodes) {
            const node = registry.getNode(params.nodeId);
            expect(node).not.toBeNull();
            expect(node!.active).toBe(false);
          }

          // Check: deregistered nodes excluded from getAllActiveNodes
          const activeNodes = registry.getAllActiveNodes();
          const activeNodeIds = new Set(activeNodes.map((n) => n.nodeId));

          for (const params of deregisteredNodes) {
            expect(activeNodeIds.has(params.nodeId)).toBe(false);
          }

          // Check: remaining nodes still active
          for (const params of remainingNodes) {
            expect(activeNodeIds.has(params.nodeId)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deregistration triggers onDeregister callback (MQTT unsubscribe)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueNodeParamsArb,
        async (nodeParams) => {
          const mockFirestore = createMockFirestore();
          const deregisteredIds: string[] = [];
          const callbacks = {
            onDeregister: (nodeId: string) => {
              deregisteredIds.push(nodeId);
            },
          };

          const registry = new NodeRegistry(mockFirestore, callbacks);

          // Register all nodes
          for (const params of nodeParams) {
            await registry.registerNode(params);
          }

          // Deregister all nodes
          for (const params of nodeParams) {
            await registry.deregisterNode(params.nodeId);
          }

          // onDeregister should have been called for every node
          expect(deregisteredIds.length).toBe(nodeParams.length);
          const deregSet = new Set(deregisteredIds);
          for (const params of nodeParams) {
            expect(deregSet.has(params.nodeId)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deregistered nodes are excluded from stale detection (only active nodes checked)', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueNodeParamsArb,
        async (nodeParams) => {
          const mockFirestore = createMockFirestore();
          const registry = new NodeRegistry(mockFirestore);

          const baseTime = 1_000_000_000;
          const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(baseTime);

          // Register all nodes
          for (const params of nodeParams) {
            await registry.registerNode(params);
          }

          // Deregister all nodes
          for (const params of nodeParams) {
            await registry.deregisterNode(params.nodeId);
          }

          // Advance time well beyond stale threshold
          dateNowSpy.mockReturnValue(baseTime + 120000);

          // Even though time has passed, deregistered nodes should NOT appear as stale
          const staleNodes = registry.getStaleNodes(30000);
          expect(staleNodes.length).toBe(0);

          dateNowSpy.mockRestore();
        }
      ),
      { numRuns: 100 }
    );
  });
});
