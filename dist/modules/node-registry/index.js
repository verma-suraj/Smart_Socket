import { config } from '../../config/index.js';
/**
 * NodeRegistry — manages ESP32 node registration, metadata, and health monitoring.
 *
 * Maintains an in-memory cache for fast lookups with Firestore persistence for
 * durability. Uses callback functions for side effects (MQTT subscribe/unsubscribe,
 * ALM exclusion) to avoid direct coupling to other modules.
 *
 * Implements:
 *   - Requirement 2.1: Register node, assign MQTT topics, begin accepting telemetry
 *   - Requirement 2.2: Deregister node, unsubscribe MQTT, exclude from ALM
 *   - Requirement 2.3: Store metadata (node_id, display name, location, date, active status)
 *   - Requirement 2.4: Dynamic addition without redeployment
 *   - Requirement 13.5: Stale detection (30s without telemetry → offline)
 */
export class NodeRegistry {
    constructor(firestore, callbacks = {}) {
        /** In-memory cache of node records, keyed by nodeId. */
        this.nodes = new Map();
        this.firestore = firestore;
        this.callbacks = callbacks;
    }
    /**
     * Register a new ESP32 node.
     * Creates a Firestore record and adds to in-memory cache, then triggers
     * the onRegister callback (typically wired to MQTT subscribe).
     *
     * Requirement 2.1: Create record, assign MQTT topic subscriptions, begin accepting telemetry.
     * Requirement 2.3: Store node_id, display name, location label, registration date, active status.
     */
    async registerNode(params) {
        const now = Date.now();
        const record = {
            nodeId: params.nodeId,
            displayName: params.displayName,
            locationLabel: params.locationLabel,
            registrationDate: now,
            active: true,
            lastSeenTimestamp: now,
            inTemperatureOverride: false,
        };
        // Persist to Firestore
        await this.firestore
            .collection('nodes')
            .doc(params.nodeId)
            .set({
            ...record,
            lastTelemetry: null,
            temperatureOverrideSince: null,
        });
        // Add to in-memory cache
        this.nodes.set(params.nodeId, record);
        // Trigger side effects (MQTT subscription)
        if (this.callbacks.onRegister) {
            this.callbacks.onRegister(params.nodeId);
        }
        return record;
    }
    /**
     * Deregister an ESP32 node.
     * Marks the node inactive in both Firestore and memory, then triggers
     * the onDeregister callback (typically wired to MQTT unsubscribe + ALM exclusion).
     *
     * Requirement 2.2: Unsubscribe MQTT topics, mark inactive, exclude from ALM.
     */
    async deregisterNode(nodeId) {
        const record = this.nodes.get(nodeId);
        if (record) {
            record.active = false;
        }
        // Persist inactive status to Firestore
        await this.firestore
            .collection('nodes')
            .doc(nodeId)
            .update({ active: false });
        // Trigger side effects (MQTT unsubscribe + ALM exclusion)
        if (this.callbacks.onDeregister) {
            this.callbacks.onDeregister(nodeId);
        }
    }
    /**
     * Retrieve a node record by ID from the in-memory cache.
     * Returns null if the node is not found.
     */
    getNode(nodeId) {
        return this.nodes.get(nodeId) ?? null;
    }
    /**
     * Get all nodes that are currently marked as active.
     */
    getAllActiveNodes() {
        const active = [];
        for (const record of this.nodes.values()) {
            if (record.active) {
                active.push(record);
            }
        }
        return active;
    }
    /**
     * Update the lastSeenTimestamp for a node.
     * Called each time telemetry is received from the node.
     *
     * Requirement 13.5: Track last telemetry time for stale detection.
     */
    updateLastSeen(nodeId, timestamp) {
        const record = this.nodes.get(nodeId);
        if (record) {
            record.lastSeenTimestamp = timestamp;
        }
    }
    /**
     * Get all nodes whose lastSeenTimestamp is older than the given threshold.
     * Default threshold is 30000ms (30 seconds) per Requirement 13.5.
     *
     * Requirement 13.5: Nodes without telemetry for 30+ seconds are "stale"/"offline".
     */
    getStaleNodes(thresholdMs = config.node.staleThresholdMs) {
        const now = Date.now();
        const stale = [];
        for (const record of this.nodes.values()) {
            if (!record.active) {
                continue; // Only check active nodes for staleness
            }
            if (now - record.lastSeenTimestamp > thresholdMs) {
                stale.push(record);
            }
        }
        return stale;
    }
    /**
     * Load all active nodes from Firestore into the in-memory cache.
     * Should be called during application initialization to restore state.
     */
    async loadFromFirestore() {
        const snapshot = await this.firestore
            .collection('nodes')
            .where('active', '==', true)
            .get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            const record = {
                nodeId: data.nodeId,
                displayName: data.displayName,
                locationLabel: data.locationLabel,
                registrationDate: data.registrationDate,
                active: data.active,
                lastSeenTimestamp: data.lastSeenTimestamp,
                inTemperatureOverride: data.inTemperatureOverride ?? false,
            };
            this.nodes.set(record.nodeId, record);
        }
    }
}
/**
 * Factory function to create a NodeRegistry instance.
 */
export function createNodeRegistry(firestore, callbacks = {}) {
    return new NodeRegistry(firestore, callbacks);
}
//# sourceMappingURL=index.js.map