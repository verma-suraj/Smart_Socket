import type { MqttClient } from 'mqtt';
/**
 * Manages dynamic MQTT topic subscriptions per node.
 * Subscribes/unsubscribes to telemetry and RFID topics for each node.
 */
export declare class SubscriptionManager {
    private client;
    private activeSubscriptions;
    constructor(client: MqttClient);
    /**
     * Resolves a topic template by replacing {node_id} with the actual nodeId.
     */
    private resolveTopic;
    /**
     * Subscribe to telemetry and RFID topics for a given node.
     */
    subscribe(nodeId: string): void;
    /**
     * Unsubscribe from telemetry and RFID topics for a given node.
     */
    unsubscribe(nodeId: string): void;
    /**
     * Returns the set of currently subscribed node IDs.
     */
    getActiveSubscriptions(): string[];
}
//# sourceMappingURL=subscription-manager.d.ts.map