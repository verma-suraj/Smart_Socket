/**
 * Load Shedding Controller — iteratively sheds the lowest-priority active sockets
 * until Total_Transformer_Load falls at or below the Load_Threshold.
 *
 * Implements:
 *   - Requirement 4.2: Identify lowest-priority active socket and publish relay-off
 *   - Requirement 4.3: Repeat until load falls below threshold
 *   - Requirement 5.4: Tie-breaker — longest running duration shed first
 */
export class SheddingController {
    constructor(loadAggregator, thresholdManager, nodeSessionStore) {
        this.loadAggregator = loadAggregator;
        this.thresholdManager = thresholdManager;
        this.nodeSessionStore = nodeSessionStore;
    }
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
    async evaluateAndShed() {
        const results = [];
        const threshold = this.thresholdManager.getThreshold();
        let totalLoad = this.loadAggregator.getTotalLoad();
        if (totalLoad <= threshold) {
            return results;
        }
        // Get all active sessions with priority info
        const sessions = this.nodeSessionStore.getActiveNodeSessions();
        if (sessions.length === 0) {
            return results;
        }
        // Sort by priority ascending (lowest priority shed first)
        // Tie-breaker: longest running (smallest startTimestamp) shed first
        const sorted = [...sessions].sort((a, b) => {
            if (a.priorityScore !== b.priorityScore) {
                return a.priorityScore - b.priorityScore;
            }
            // Same priority: longest running (smallest startTimestamp) first
            return a.startTimestamp - b.startTimestamp;
        });
        // Iteratively shed until load ≤ threshold
        for (const session of sorted) {
            if (totalLoad <= threshold) {
                break;
            }
            // Get this node's power contribution before removing it
            const nodePower = this.loadAggregator.getNodePower(session.nodeId);
            // Mark node inactive so it's excluded from load calculation
            this.loadAggregator.markInactive(session.nodeId);
            // Subtract shed node's power from running total
            totalLoad -= nodePower;
            results.push({
                nodeId: session.nodeId,
                reason: 'alm_overload',
                priorityScore: session.priorityScore,
                timestamp: Date.now(),
            });
        }
        return results;
    }
}
//# sourceMappingURL=shedding-controller.js.map