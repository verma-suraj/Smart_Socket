import type { Firestore } from 'firebase-admin/firestore';
import type { IAlmEngine, ShedResult } from '../../interfaces/alm-engine.interface.js';
import type { ITemperatureMonitor } from '../../interfaces/temperature-monitor.interface.js';
import { LoadAggregator } from './load-aggregator.js';
import { ThresholdManager } from './threshold-manager.js';
import { SheddingController, type INodeSessionStore, type NodeSessionInfo } from './shedding-controller.js';

/**
 * ALM Engine — the core decision-making module that aggregates load,
 * compares against threshold, and executes load shedding by priority.
 *
 * Composes:
 *   - LoadAggregator: tracks per-node power and computes total load
 *   - ThresholdManager: manages the load threshold with Firestore persistence
 *   - SheddingController: iteratively sheds lowest-priority nodes when overloaded
 *
 * Implements:
 *   - Requirement 4.2: Identify lowest-priority socket and shed
 *   - Requirement 4.3: Repeat shedding until load ≤ threshold
 *   - Requirement 4.5: Recalculate total load on each telemetry payload
 */
export class AlmEngine implements IAlmEngine, INodeSessionStore {
  private readonly loadAggregator: LoadAggregator;
  private readonly thresholdManager: ThresholdManager;
  private readonly sheddingController: SheddingController;

  /** In-memory store of node priorities and start timestamps. */
  private readonly nodePriorities: Map<string, { priorityScore: number; startTimestamp: number }> = new Map();

  constructor(firestore: Firestore, temperatureMonitor: ITemperatureMonitor) {
    this.loadAggregator = new LoadAggregator(temperatureMonitor);
    this.thresholdManager = new ThresholdManager(firestore);
    this.sheddingController = new SheddingController(
      this.loadAggregator,
      this.thresholdManager,
      this
    );
  }

  /**
   * Update the latest power reading for a node.
   * Called each time a telemetry payload is received.
   *
   * Requirement 4.5: Recalculate total load on each telemetry payload.
   */
  updateLoad(nodeId: string, power: number): void {
    this.loadAggregator.updateLoad(nodeId, power);
  }

  /**
   * Get the current Total_Transformer_Load (sum of all active nodes).
   */
  getTotalLoad(): number {
    return this.loadAggregator.getTotalLoad();
  }

  /**
   * Get the current load threshold value.
   */
  getThreshold(): number {
    return this.thresholdManager.getThreshold();
  }

  /**
   * Set a new load threshold value. Updates immediately in memory
   * and persists to Firestore.
   */
  async setThreshold(value: number): Promise<void> {
    await this.thresholdManager.setThreshold(value);
  }

  /**
   * Evaluate current load and shed nodes if total exceeds threshold.
   * Delegates to the SheddingController.
   */
  async evaluateAndShed(): Promise<ShedResult[]> {
    return this.sheddingController.evaluateAndShed();
  }

  /**
   * Get the stored priority score for a node.
   * Returns 0 if no priority has been set for the node.
   */
  getNodePriority(nodeId: string): number {
    return this.nodePriorities.get(nodeId)?.priorityScore ?? 0;
  }

  /**
   * Set the priority score and start timestamp for a node.
   * Should be called when a session is created or updated.
   */
  setNodePriority(nodeId: string, priorityScore: number, startTimestamp: number): void {
    this.nodePriorities.set(nodeId, { priorityScore, startTimestamp });
  }

  /**
   * Remove priority info for a node (e.g., when session ends).
   */
  removeNodePriority(nodeId: string): void {
    this.nodePriorities.delete(nodeId);
  }

  /**
   * INodeSessionStore implementation — returns active node sessions
   * with their priority scores and start timestamps for the shedding controller.
   *
   * Only returns nodes that are currently contributing to load
   * (active and not in temperature override).
   */
  getActiveNodeSessions(): NodeSessionInfo[] {
    const contributingNodes = this.loadAggregator.getContributingNodes();
    const sessions: NodeSessionInfo[] = [];

    for (const nodeId of contributingNodes) {
      const info = this.nodePriorities.get(nodeId);
      if (info) {
        sessions.push({
          nodeId,
          priorityScore: info.priorityScore,
          startTimestamp: info.startTimestamp,
        });
      }
    }

    return sessions;
  }

  /**
   * Load the persisted threshold from Firestore.
   * Should be called during application initialization.
   */
  async initialize(): Promise<void> {
    await this.thresholdManager.loadThreshold();
  }

  /**
   * Expose the load aggregator for direct access if needed by other modules.
   */
  getLoadAggregator(): LoadAggregator {
    return this.loadAggregator;
  }

  /**
   * Expose the threshold manager for direct access if needed.
   */
  getThresholdManager(): ThresholdManager {
    return this.thresholdManager;
  }
}

/**
 * Factory function to create an AlmEngine instance.
 */
export function createAlmEngine(firestore: Firestore, temperatureMonitor: ITemperatureMonitor): AlmEngine {
  return new AlmEngine(firestore, temperatureMonitor);
}
