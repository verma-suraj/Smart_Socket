import type { ITemperatureMonitor } from '../../interfaces/temperature-monitor.interface.js';
/**
 * Load Aggregator — maintains per-node power readings and computes
 * the Total_Transformer_Load by summing active power values, excluding
 * nodes that are inactive or in temperature override.
 *
 * Implements Requirements 4.1: Continuously compute Total_Transformer_Load
 * by summing the active power values from the most recent telemetry of all
 * active ESP32_Nodes.
 */
export declare class LoadAggregator {
    private readonly temperatureMonitor;
    /** In-memory map of nodeId → latest power value (watts). */
    private readonly powerMap;
    /** Tracks which nodes are marked inactive (deregistered or offline). */
    private readonly inactiveNodes;
    constructor(temperatureMonitor: ITemperatureMonitor);
    /**
     * Update the latest power reading for a node.
     * Called each time a new telemetry payload is received.
     */
    updateLoad(nodeId: string, power: number): void;
    /**
     * Compute Total_Transformer_Load by summing power values of all nodes
     * that are active AND not in temperature override.
     *
     * Requirement 4.1: Sum active power values, exclude inactive/override nodes.
     */
    getTotalLoad(): number;
    /**
     * Get the current power reading for a specific node.
     * Returns 0 if no reading exists.
     */
    getNodePower(nodeId: string): number;
    /**
     * Mark a node as inactive — it will be excluded from load calculations.
     */
    markInactive(nodeId: string): void;
    /**
     * Mark a node as active — it will be included in load calculations.
     */
    markActive(nodeId: string): void;
    /**
     * Check if a node is currently marked as active.
     */
    isActive(nodeId: string): boolean;
    /**
     * Remove a node entirely from tracking (e.g., on deregistration).
     */
    removeNode(nodeId: string): void;
    /**
     * Get all node IDs that contribute to the current total load
     * (active and not in temperature override).
     */
    getContributingNodes(): string[];
}
//# sourceMappingURL=load-aggregator.d.ts.map