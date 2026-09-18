/**
 * Load Aggregator — maintains per-node power readings and computes
 * the Total_Transformer_Load by summing active power values, excluding
 * nodes that are inactive or in temperature override.
 *
 * Implements Requirements 4.1: Continuously compute Total_Transformer_Load
 * by summing the active power values from the most recent telemetry of all
 * active ESP32_Nodes.
 */
export class LoadAggregator {
    constructor(temperatureMonitor) {
        this.temperatureMonitor = temperatureMonitor;
        /** In-memory map of nodeId → latest power value (watts). */
        this.powerMap = new Map();
        /** Tracks which nodes are marked inactive (deregistered or offline). */
        this.inactiveNodes = new Set();
    }
    /**
     * Update the latest power reading for a node.
     * Called each time a new telemetry payload is received.
     */
    updateLoad(nodeId, power) {
        this.powerMap.set(nodeId, power);
    }
    /**
     * Compute Total_Transformer_Load by summing power values of all nodes
     * that are active AND not in temperature override.
     *
     * Requirement 4.1: Sum active power values, exclude inactive/override nodes.
     */
    getTotalLoad() {
        let total = 0;
        for (const [nodeId, power] of this.powerMap) {
            // Exclude inactive nodes
            if (this.inactiveNodes.has(nodeId)) {
                continue;
            }
            // Exclude nodes in temperature override state
            if (this.temperatureMonitor.isInOverrideState(nodeId)) {
                continue;
            }
            total += power;
        }
        return total;
    }
    /**
     * Get the current power reading for a specific node.
     * Returns 0 if no reading exists.
     */
    getNodePower(nodeId) {
        return this.powerMap.get(nodeId) ?? 0;
    }
    /**
     * Mark a node as inactive — it will be excluded from load calculations.
     */
    markInactive(nodeId) {
        this.inactiveNodes.add(nodeId);
    }
    /**
     * Mark a node as active — it will be included in load calculations.
     */
    markActive(nodeId) {
        this.inactiveNodes.delete(nodeId);
    }
    /**
     * Check if a node is currently marked as active.
     */
    isActive(nodeId) {
        return !this.inactiveNodes.has(nodeId);
    }
    /**
     * Remove a node entirely from tracking (e.g., on deregistration).
     */
    removeNode(nodeId) {
        this.powerMap.delete(nodeId);
        this.inactiveNodes.delete(nodeId);
    }
    /**
     * Get all node IDs that contribute to the current total load
     * (active and not in temperature override).
     */
    getContributingNodes() {
        const contributing = [];
        for (const [nodeId] of this.powerMap) {
            if (this.inactiveNodes.has(nodeId)) {
                continue;
            }
            if (this.temperatureMonitor.isInOverrideState(nodeId)) {
                continue;
            }
            contributing.push(nodeId);
        }
        return contributing;
    }
}
//# sourceMappingURL=load-aggregator.js.map