import type { LoadAggregator } from './load-aggregator.js';
import type { ThresholdManager } from './threshold-manager.js';
import type { ShedResult } from '../../interfaces/alm-engine.interface.js';
/**
 * Represents an active node session with priority and timing information
 * used for shedding decisions.
 */
export interface NodeSessionInfo {
    nodeId: string;
    priorityScore: number;
    startTimestamp: number;
}
/**
 * Interface for retrieving active node session info needed by the shedding controller.
 */
export interface INodeSessionStore {
    getActiveNodeSessions(): NodeSessionInfo[];
}
/**
 * Load Shedding Controller — iteratively sheds the lowest-priority active sockets
 * until Total_Transformer_Load falls at or below the Load_Threshold.
 *
 * Implements:
 *   - Requirement 4.2: Identify lowest-priority active socket and publish relay-off
 *   - Requirement 4.3: Repeat until load falls below threshold
 *   - Requirement 5.4: Tie-breaker — longest running duration shed first
 */
export declare class SheddingController {
    private readonly loadAggregator;
    private readonly thresholdManager;
    private readonly nodeSessionStore;
    constructor(loadAggregator: LoadAggregator, thresholdManager: ThresholdManager, nodeSessionStore: INodeSessionStore);
    /**
     * Evaluate current load against threshold and shed nodes as needed.
     *
     * Algorithm:
     * 1. Compare getTotalLoad() against getThreshold()
     * 2. If total > threshold, gather all contributing nodes with priorities
     * 3. Sort by priority ascending (lowest first); ties broken by longest running (smallest startTimestamp)
     * 4. Iteratively shed (mark inactive) until total ≤ threshold
     * 5. Return ShedResult[] for each shed node
     */
    evaluateAndShed(): Promise<ShedResult[]>;
}
//# sourceMappingURL=shedding-controller.d.ts.map