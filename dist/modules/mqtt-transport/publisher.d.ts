import type { MqttClient } from 'mqtt';
import type { RelayCommand, DeliveryStatus } from '../../models/index.js';
/**
 * Publishes MQTT commands with QoS 1 reliability.
 * Retries up to maxRetries times (default 3) with ackTimeout (default 5s) between attempts.
 */
export declare class MqttPublisher {
    private client;
    private readonly ackTimeout;
    private readonly maxRetries;
    constructor(client: MqttClient);
    /**
     * Resolves the command topic for a given node.
     */
    private resolveTopic;
    /**
     * Publishes a relay command to the specified node with QoS 1.
     * Waits for ACK with configured timeout. Retries up to maxRetries times on timeout.
     * Returns delivery status indicating success/failure, attempts made, and timestamp.
     */
    publish(nodeId: string, command: RelayCommand): Promise<DeliveryStatus>;
    /**
     * Single publish attempt with ACK timeout.
     * Returns true if ACK received within timeout, false otherwise.
     */
    private attemptPublish;
}
//# sourceMappingURL=publisher.d.ts.map