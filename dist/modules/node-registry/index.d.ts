import type { Firestore } from 'firebase-admin/firestore';
import type { INodeRegistry } from '../../interfaces/node-registry.interface.js';
import type { NodeRecord, RegisterNodeParams } from '../../models/index.js';
/**
 * Callback signatures for side effects triggered on registration/deregistration.
 * These allow the application bootstrap to wire the NodeRegistry to MQTT subscriptions
 * and ALM load aggregator without direct module coupling.
 */
export interface NodeRegistryCallbacks {
    onRegister?: (nodeId: string) => void;
    onDeregister?: (nodeId: string) => void;
}
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
export declare class NodeRegistry implements INodeRegistry {
    /** In-memory cache of node records, keyed by nodeId. */
    private readonly nodes;
    private readonly firestore;
    private readonly callbacks;
    constructor(firestore: Firestore, callbacks?: NodeRegistryCallbacks);
    /**
     * Register a new ESP32 node.
     * Creates a Firestore record and adds to in-memory cache, then triggers
     * the onRegister callback (typically wired to MQTT subscribe).
     *
     * Requirement 2.1: Create record, assign MQTT topic subscriptions, begin accepting telemetry.
     * Requirement 2.3: Store node_id, display name, location label, registration date, active status.
     */
    registerNode(params: RegisterNodeParams): Promise<NodeRecord>;
    /**
     * Deregister an ESP32 node.
     * Marks the node inactive in both Firestore and memory, then triggers
     * the onDeregister callback (typically wired to MQTT unsubscribe + ALM exclusion).
     *
     * Requirement 2.2: Unsubscribe MQTT topics, mark inactive, exclude from ALM.
     */
    deregisterNode(nodeId: string): Promise<void>;
    /**
     * Retrieve a node record by ID from the in-memory cache.
     * Returns null if the node is not found.
     */
    getNode(nodeId: string): NodeRecord | null;
    /**
     * Get all nodes that are currently marked as active.
     */
    getAllActiveNodes(): NodeRecord[];
    /**
     * Update the lastSeenTimestamp for a node.
     * Called each time telemetry is received from the node.
     *
     * Requirement 13.5: Track last telemetry time for stale detection.
     */
    updateLastSeen(nodeId: string, timestamp: number): void;
    /**
     * Get all nodes whose lastSeenTimestamp is older than the given threshold.
     * Default threshold is 30000ms (30 seconds) per Requirement 13.5.
     *
     * Requirement 13.5: Nodes without telemetry for 30+ seconds are "stale"/"offline".
     */
    getStaleNodes(thresholdMs?: number): NodeRecord[];
    /**
     * Load all active nodes from Firestore into the in-memory cache.
     * Should be called during application initialization to restore state.
     */
    loadFromFirestore(): Promise<void>;
}
/**
 * Factory function to create a NodeRegistry instance.
 */
export declare function createNodeRegistry(firestore: Firestore, callbacks?: NodeRegistryCallbacks): NodeRegistry;
//# sourceMappingURL=index.d.ts.map