import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LoadAggregator } from '../../src/modules/alm-engine/load-aggregator.js';
import { SheddingController, type INodeSessionStore, type NodeSessionInfo } from '../../src/modules/alm-engine/shedding-controller.js';
import { ThresholdManager } from '../../src/modules/alm-engine/threshold-manager.js';
import type { ITemperatureMonitor } from '../../src/interfaces/temperature-monitor.interface.js';

/**
 * Property-based tests for ALM engine: load aggregation and shedding.
 * Validates: Requirements 4.1, 4.2, 4.3, 5.4
 */

// --- Mock helpers ---

/** Creates a mock ITemperatureMonitor with configurable override nodes. */
function createMockTemperatureMonitor(overrideNodes: Set<string> = new Set()): ITemperatureMonitor {
  return {
    checkTemperature: () => ({ action: 'none' as const }),
    isInOverrideState: (nodeId: string) => overrideNodes.has(nodeId),
    canReactivate: () => true,
  };
}

/** Creates a mock ThresholdManager with a configurable threshold value. */
function createMockThresholdManager(threshold: number): ThresholdManager {
  const mockFirestore = {} as any;
  const manager = new ThresholdManager(mockFirestore);
  // Set the internal threshold directly without Firestore
  (manager as any).threshold = threshold;
  return manager;
}

/** Creates a mock INodeSessionStore returning configured sessions. */
function createMockNodeSessionStore(sessions: NodeSessionInfo[]): INodeSessionStore {
  return {
    getActiveNodeSessions: () => sessions,
  };
}

// --- Arbitraries ---

/** Generates a unique node ID string. */
const nodeIdArb = fc.stringMatching(/^node-[a-z0-9]{4,8}$/);

/** Generates a positive power value in watts (0.1 to 10000). */
const powerArb = fc.double({ min: 0.1, max: 10000, noNaN: true, noDefaultInfinity: true });

/** Generates a priority score (integer 0-100). */
const priorityArb = fc.integer({ min: 0, max: 100 });

/** Generates a start timestamp (positive integer). */
const timestampArb = fc.integer({ min: 1, max: 2_000_000_000 });

/**
 * Generates a list of unique nodes with power values.
 * Returns array of { nodeId, power }.
 */
const nodesWithPowerArb = fc.uniqueArray(
  fc.record({
    nodeId: nodeIdArb,
    power: powerArb,
  }),
  { minLength: 1, maxLength: 20, selector: (n) => n.nodeId }
);

/**
 * Generates a list of unique nodes with power, priority, and timestamp.
 */
const nodesWithFullInfoArb = fc.uniqueArray(
  fc.record({
    nodeId: nodeIdArb,
    power: powerArb,
    priorityScore: priorityArb,
    startTimestamp: timestampArb,
  }),
  { minLength: 2, maxLength: 15, selector: (n) => n.nodeId }
);

// --- Property 6: Total Load Aggregation ---

describe('Feature: smart-socket-backend, Property 6: Total Load Aggregation', () => {
  /**
   * **Validates: Requirements 4.1**
   *
   * For any set of N active ESP32_Nodes with power values [p₁, p₂, ..., pₙ],
   * the computed Total_Transformer_Load SHALL equal the sum p₁ + p₂ + ... + pₙ,
   * excluding nodes that are inactive or in temperature override.
   */
  it('total load equals sum of all active node powers', () => {
    fc.assert(
      fc.property(nodesWithPowerArb, (nodes) => {
        const tempMonitor = createMockTemperatureMonitor();
        const aggregator = new LoadAggregator(tempMonitor);

        // Register all nodes with their power values
        for (const { nodeId, power } of nodes) {
          aggregator.updateLoad(nodeId, power);
        }

        const expectedTotal = nodes.reduce((sum, n) => sum + n.power, 0);
        const actualTotal = aggregator.getTotalLoad();

        // Allow floating-point tolerance
        expect(actualTotal).toBeCloseTo(expectedTotal, 5);
      }),
      { numRuns: 100 }
    );
  });

  it('inactive nodes are excluded from total load', () => {
    fc.assert(
      fc.property(
        nodesWithPowerArb.filter((nodes) => nodes.length >= 2),
        fc.integer({ min: 1 }),
        (nodes, inactiveCountSeed) => {
          const tempMonitor = createMockTemperatureMonitor();
          const aggregator = new LoadAggregator(tempMonitor);

          // Register all nodes
          for (const { nodeId, power } of nodes) {
            aggregator.updateLoad(nodeId, power);
          }

          // Mark some nodes as inactive (at least 1, at most all-1)
          const inactiveCount = (inactiveCountSeed % (nodes.length - 1)) + 1;
          const inactiveNodes = nodes.slice(0, inactiveCount);
          const activeNodes = nodes.slice(inactiveCount);

          for (const { nodeId } of inactiveNodes) {
            aggregator.markInactive(nodeId);
          }

          const expectedTotal = activeNodes.reduce((sum, n) => sum + n.power, 0);
          const actualTotal = aggregator.getTotalLoad();

          expect(actualTotal).toBeCloseTo(expectedTotal, 5);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('nodes in temperature override are excluded from total load', () => {
    fc.assert(
      fc.property(
        nodesWithPowerArb.filter((nodes) => nodes.length >= 2),
        fc.integer({ min: 1 }),
        (nodes, overrideCountSeed) => {
          // Pick some nodes to be in override state
          const overrideCount = (overrideCountSeed % (nodes.length - 1)) + 1;
          const overrideNodeIds = new Set(nodes.slice(0, overrideCount).map((n) => n.nodeId));
          const activeNodes = nodes.slice(overrideCount);

          const tempMonitor = createMockTemperatureMonitor(overrideNodeIds);
          const aggregator = new LoadAggregator(tempMonitor);

          // Register all nodes
          for (const { nodeId, power } of nodes) {
            aggregator.updateLoad(nodeId, power);
          }

          const expectedTotal = activeNodes.reduce((sum, n) => sum + n.power, 0);
          const actualTotal = aggregator.getTotalLoad();

          expect(actualTotal).toBeCloseTo(expectedTotal, 5);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 7: ALM Shedding Selects Lowest Priority ---

describe('Feature: smart-socket-backend, Property 7: ALM Shedding Selects Lowest Priority', () => {
  /**
   * **Validates: Requirements 4.2, 5.4**
   *
   * For any set of active sockets where Total_Transformer_Load exceeds Load_Threshold,
   * the ALM engine SHALL select the socket with the lowest Priority_Score for shedding.
   * If multiple sockets share the lowest priority, the one with the longest continuous
   * running duration SHALL be selected.
   */
  it('first shed node has the lowest priority score', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodesWithFullInfoArb.filter((nodes) => {
          // Ensure distinct priority scores so we can verify lowest is picked
          const priorities = nodes.map((n) => n.priorityScore);
          return new Set(priorities).size === priorities.length;
        }),
        async (nodes) => {
          const tempMonitor = createMockTemperatureMonitor();
          const aggregator = new LoadAggregator(tempMonitor);

          // Register all nodes
          for (const { nodeId, power } of nodes) {
            aggregator.updateLoad(nodeId, power);
          }

          const totalLoad = aggregator.getTotalLoad();
          // Set threshold below total to force at least one shedding
          const threshold = totalLoad * 0.5;
          const thresholdManager = createMockThresholdManager(threshold);

          const sessions: NodeSessionInfo[] = nodes.map(({ nodeId, priorityScore, startTimestamp }) => ({
            nodeId,
            priorityScore,
            startTimestamp,
          }));

          const sessionStore = createMockNodeSessionStore(sessions);
          const controller = new SheddingController(aggregator, thresholdManager, sessionStore);

          const shedResults = await controller.evaluateAndShed();

          expect(shedResults.length).toBeGreaterThan(0);

          // The first shed node should have the minimum priority score
          const minPriority = Math.min(...nodes.map((n) => n.priorityScore));
          expect(shedResults[0].priorityScore).toBe(minPriority);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('tie-breaker: among same priority, longest running (smallest startTimestamp) is shed first', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate nodes that share the same priority but have different timestamps
        fc.uniqueArray(
          fc.record({
            nodeId: nodeIdArb,
            power: powerArb,
            startTimestamp: timestampArb,
          }),
          { minLength: 3, maxLength: 10, selector: (n) => n.nodeId }
        ).filter((nodes) => {
          // Ensure all timestamps are distinct
          const ts = nodes.map((n) => n.startTimestamp);
          return new Set(ts).size === ts.length;
        }),
        priorityArb,
        async (nodes, sharedPriority) => {
          const tempMonitor = createMockTemperatureMonitor();
          const aggregator = new LoadAggregator(tempMonitor);

          // Register all nodes
          for (const { nodeId, power } of nodes) {
            aggregator.updateLoad(nodeId, power);
          }

          const totalLoad = aggregator.getTotalLoad();
          // Set threshold to force at least one shed but not all
          const threshold = totalLoad * 0.5;
          const thresholdManager = createMockThresholdManager(threshold);

          // All nodes share the same priority
          const sessions: NodeSessionInfo[] = nodes.map(({ nodeId, startTimestamp }) => ({
            nodeId,
            priorityScore: sharedPriority,
            startTimestamp,
          }));

          const sessionStore = createMockNodeSessionStore(sessions);
          const controller = new SheddingController(aggregator, thresholdManager, sessionStore);

          const shedResults = await controller.evaluateAndShed();

          expect(shedResults.length).toBeGreaterThan(0);

          // The first shed node should have the smallest startTimestamp (longest running)
          const minTimestamp = Math.min(...nodes.map((n) => n.startTimestamp));
          const expectedFirstShed = nodes.find((n) => n.startTimestamp === minTimestamp)!;
          expect(shedResults[0].nodeId).toBe(expectedFirstShed.nodeId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// --- Property 8: ALM Post-Condition — Load Below Threshold ---

describe('Feature: smart-socket-backend, Property 8: ALM Post-Condition — Load Below Threshold', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any set of active sockets where Total_Transformer_Load exceeds Load_Threshold,
   * after the ALM shedding loop completes, the resulting Total_Transformer_Load of
   * remaining active sockets SHALL be less than or equal to the Load_Threshold
   * (provided sufficient sockets can be shed).
   */
  it('after shedding, total load is at or below threshold (or all nodes shed)', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodesWithFullInfoArb,
        fc.double({ min: 0.01, max: 0.99, noNaN: true, noDefaultInfinity: true }),
        async (nodes, thresholdRatio) => {
          const tempMonitor = createMockTemperatureMonitor();
          const aggregator = new LoadAggregator(tempMonitor);

          // Register all nodes
          for (const { nodeId, power } of nodes) {
            aggregator.updateLoad(nodeId, power);
          }

          const totalLoad = aggregator.getTotalLoad();
          // Set threshold as a fraction of total load to guarantee overload
          const threshold = totalLoad * thresholdRatio;
          const thresholdManager = createMockThresholdManager(threshold);

          const sessions: NodeSessionInfo[] = nodes.map(({ nodeId, priorityScore, startTimestamp }) => ({
            nodeId,
            priorityScore,
            startTimestamp,
          }));

          const sessionStore = createMockNodeSessionStore(sessions);
          const controller = new SheddingController(aggregator, thresholdManager, sessionStore);

          const shedResults = await controller.evaluateAndShed();

          // After shedding, get the remaining load
          const remainingLoad = aggregator.getTotalLoad();

          // Post-condition: remaining load <= threshold OR all nodes were shed
          const allShed = shedResults.length === nodes.length;
          if (allShed) {
            // If all nodes were shed, load should be 0 (or very close)
            expect(remainingLoad).toBeCloseTo(0, 5);
          } else {
            // Load must be at or below threshold (with floating-point tolerance)
            expect(remainingLoad).toBeLessThanOrEqual(threshold + 1e-9);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('shedding results all have reason "alm_overload"', async () => {
    await fc.assert(
      fc.asyncProperty(
        nodesWithFullInfoArb,
        async (nodes) => {
          const tempMonitor = createMockTemperatureMonitor();
          const aggregator = new LoadAggregator(tempMonitor);

          for (const { nodeId, power } of nodes) {
            aggregator.updateLoad(nodeId, power);
          }

          const totalLoad = aggregator.getTotalLoad();
          // Force shedding by setting threshold to half
          const threshold = totalLoad * 0.5;
          const thresholdManager = createMockThresholdManager(threshold);

          const sessions: NodeSessionInfo[] = nodes.map(({ nodeId, priorityScore, startTimestamp }) => ({
            nodeId,
            priorityScore,
            startTimestamp,
          }));

          const sessionStore = createMockNodeSessionStore(sessions);
          const controller = new SheddingController(aggregator, thresholdManager, sessionStore);

          const shedResults = await controller.evaluateAndShed();

          // Every shed result must have reason "alm_overload"
          for (const result of shedResults) {
            expect(result.reason).toBe('alm_overload');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
