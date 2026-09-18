import type { Firestore } from 'firebase-admin/firestore';
import type { IAlmEngine, ShedResult } from '../../interfaces/alm-engine.interface.js';
import type { ITemperatureMonitor } from '../../interfaces/temperature-monitor.interface.js';
import { LoadAggregator } from './load-aggregator.js';
import { ThresholdManager } from './threshold-manager.js';
import { type INodeSessionStore, type NodeSessionInfo } from './shedding-controller.js';
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
export declare class AlmEngine implements IAlmEngine, INodeSessionStore {
    private readonly loadAggregator;
    private readonly thresholdManager;
    private readonly sheddingController;
    /** In-memory store of node priorities and start timestamps. */
    private readonly nodePriorities;
    constructor(firestore: Firestore, temperatureMonitor: ITemperatureMonitor);
    /**
     * Update the latest power reading for a node.
     * Called each time a telemetry payload is received.
     *
     * Requirement 4.5: Recalculate total load on each telemetry payload.
     */
    updateLoad(nodeId: string, power: number): void;
    /**
     * Get the current Total_Transformer_Load (sum of all active nodes).
     */
    getTotalLoad(): number;
    /**
     * Get the current load threshold value.
     */
    getThreshold(): number;
    /**
     * Set a new load threshold value. Updates immediately in memory
     * and persists to Firestore.
     */
    setThreshold(value: number): Promise<void>;
    /**
     * Evaluate current load and shed nodes if total exceeds threshold.
     * Delegates to the SheddingController.
     */
    evaluateAndShed(): Promise<ShedResult[]>;
    /**
     * Get the stored priority score for a node.
     * Returns 0 if no priority has been set for the node.
     */
    getNodePriority(nodeId: string): number;
    /**
     * Set the priority score and start timestamp for a node.
     * Should be called when a session is created or updated.
     */
    setNodePriority(nodeId: string, priorityScore: number, startTimestamp: number): void;
    /**
     * Remove priority info for a node (e.g., when session ends).
     */
    removeNodePriority(nodeId: string): void;
    /**
     * INodeSessionStore implementation — returns active node sessions
     * with their priority scores and start timestamps for the shedding controller.
     *
     * Only returns nodes that are currently contributing to load
     * (active and not in temperature override).
     */
    getActiveNodeSessions(): NodeSessionInfo[];
    /**
     * Load the persisted threshold from Firestore.
     * Should be called during application initialization.
     */
    initialize(): Promise<void>;
    /**
     * Expose the load aggregator for direct access if needed by other modules.
     */
    getLoadAggregator(): LoadAggregator;
    /**
     * Expose the threshold manager for direct access if needed.
     */
    getThresholdManager(): ThresholdManager;
}
/**
 * Factory function to create an AlmEngine instance.
 */
export declare function createAlmEngine(firestore: Firestore, temperatureMonitor: ITemperatureMonitor): AlmEngine;
//# sourceMappingURL=index.d.ts.map