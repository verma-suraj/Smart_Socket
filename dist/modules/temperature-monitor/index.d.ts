import type { Firestore } from 'firebase-admin/firestore';
import type { ITemperatureMonitor, SafetyAction } from '../../interfaces/temperature-monitor.interface.js';
/**
 * Temperature safety monitor with hysteresis state machine.
 *
 * State transitions:
 *   - T > 40°C  → enter override state (shutdown)
 *   - 38 ≤ T ≤ 40 → remain in override state if already in it
 *   - T < 38°C  → exit override state (can reactivate)
 *
 * Override state is tracked per-node in memory and persisted to Firestore
 * for crash recovery.
 */
export declare class TemperatureMonitor implements ITemperatureMonitor {
    private readonly firestore;
    private static readonly SHUTDOWN_THRESHOLD;
    private static readonly REACTIVATION_THRESHOLD;
    /** In-memory override state per node. */
    private readonly overrideMap;
    constructor(firestore: Firestore);
    /**
     * Check a temperature reading and return the appropriate safety action.
     *
     * - If T > 40°C → enter/remain in override, return shutdown action
     * - If node is already in override and 38 ≤ T ≤ 40 → remain in override, return block_reactivation
     * - If node is already in override and T < 38 → exit override, return none
     * - If node is NOT in override and T ≤ 40 → return none
     */
    checkTemperature(nodeId: string, temperature: number): SafetyAction;
    /**
     * Check if a node is currently in temperature override state.
     */
    isInOverrideState(nodeId: string): boolean;
    /**
     * Determine if a node can be reactivated.
     * Reactivation is allowed only when temperature drops strictly below 38°C.
     */
    canReactivate(nodeId: string, temperature: number): boolean;
    /**
     * Load override state from Firestore on startup for crash recovery.
     */
    loadPersistedState(): Promise<void>;
    private enterOverrideState;
    private exitOverrideState;
    private persistOverrideState;
}
//# sourceMappingURL=index.d.ts.map