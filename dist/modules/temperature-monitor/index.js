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
export class TemperatureMonitor {
    constructor(firestore) {
        this.firestore = firestore;
        /** In-memory override state per node. */
        this.overrideMap = new Map();
    }
    /**
     * Check a temperature reading and return the appropriate safety action.
     *
     * - If T > 40°C → enter/remain in override, return shutdown action
     * - If node is already in override and 38 ≤ T ≤ 40 → remain in override, return block_reactivation
     * - If node is already in override and T < 38 → exit override, return none
     * - If node is NOT in override and T ≤ 40 → return none
     */
    checkTemperature(nodeId, temperature) {
        if (temperature > TemperatureMonitor.SHUTDOWN_THRESHOLD) {
            // Enter or remain in override state
            this.enterOverrideState(nodeId);
            return {
                action: 'shutdown',
                reason: 'temperature_exceeded',
                temperature,
            };
        }
        if (this.overrideMap.has(nodeId)) {
            // Node is currently in override state
            if (temperature < TemperatureMonitor.REACTIVATION_THRESHOLD) {
                // Temperature dropped below hysteresis band → exit override
                this.exitOverrideState(nodeId);
                return { action: 'none' };
            }
            // Still in hysteresis band (38 ≤ T ≤ 40) → block reactivation
            return {
                action: 'block_reactivation',
                reason: 'hysteresis_active',
                temperature,
            };
        }
        // Node is not in override and temperature is safe
        return { action: 'none' };
    }
    /**
     * Check if a node is currently in temperature override state.
     */
    isInOverrideState(nodeId) {
        return this.overrideMap.has(nodeId);
    }
    /**
     * Determine if a node can be reactivated.
     * Reactivation is allowed only when temperature drops strictly below 38°C.
     */
    canReactivate(nodeId, temperature) {
        if (!this.overrideMap.has(nodeId)) {
            // Node is not in override — it can be activated normally
            return true;
        }
        return temperature < TemperatureMonitor.REACTIVATION_THRESHOLD;
    }
    /**
     * Load override state from Firestore on startup for crash recovery.
     */
    async loadPersistedState() {
        const snapshot = await this.firestore
            .collection('nodes')
            .where('inTemperatureOverride', '==', true)
            .get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const nodeId = data.nodeId ?? doc.id;
            const since = data.temperatureOverrideSince ?? Date.now();
            this.overrideMap.set(nodeId, { since });
        }
        if (snapshot.size > 0) {
            console.log(`[TemperatureMonitor] Restored override state for ${snapshot.size} node(s) from Firestore`);
        }
    }
    // ─── Private Helpers ───────────────────────────────────────────────
    enterOverrideState(nodeId) {
        if (this.overrideMap.has(nodeId)) {
            // Already in override — do not reset the timestamp
            return;
        }
        const now = Date.now();
        this.overrideMap.set(nodeId, { since: now });
        console.log(`[TemperatureMonitor] Override ENTERED for node=${nodeId} at ${new Date(now).toISOString()}`);
        // Persist to Firestore (fire-and-forget for safety — do not block the safety action)
        this.persistOverrideState(nodeId, true, now).catch((err) => {
            console.error(`[TemperatureMonitor] Failed to persist override state for node=${nodeId}:`, err);
        });
    }
    exitOverrideState(nodeId) {
        this.overrideMap.delete(nodeId);
        console.log(`[TemperatureMonitor] Override EXITED for node=${nodeId} at ${new Date().toISOString()}`);
        // Persist to Firestore
        this.persistOverrideState(nodeId, false, null).catch((err) => {
            console.error(`[TemperatureMonitor] Failed to persist override exit for node=${nodeId}:`, err);
        });
    }
    async persistOverrideState(nodeId, inOverride, since) {
        await this.firestore.collection('nodes').doc(nodeId).set({
            inTemperatureOverride: inOverride,
            temperatureOverrideSince: since,
        }, { merge: true });
    }
}
TemperatureMonitor.SHUTDOWN_THRESHOLD = 40; // °C, strict >
TemperatureMonitor.REACTIVATION_THRESHOLD = 38; // °C, strict <
//# sourceMappingURL=index.js.map