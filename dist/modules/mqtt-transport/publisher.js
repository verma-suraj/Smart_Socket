import { config } from '../../config/index.js';
/**
 * Publishes MQTT commands with QoS 1 reliability.
 * Retries up to maxRetries times (default 3) with ackTimeout (default 5s) between attempts.
 */
export class MqttPublisher {
    constructor(client) {
        this.client = client;
        this.ackTimeout = config.mqtt.command.ackTimeout;
        this.maxRetries = config.mqtt.command.maxRetries;
    }
    /**
     * Resolves the command topic for a given node.
     */
    resolveTopic(nodeId) {
        return config.mqtt.topics.command.replace('{node_id}', nodeId);
    }
    /**
     * Publishes a relay command to the specified node with QoS 1.
     * Waits for ACK with configured timeout. Retries up to maxRetries times on timeout.
     * Returns delivery status indicating success/failure, attempts made, and timestamp.
     */
    async publish(nodeId, command) {
        const topic = this.resolveTopic(nodeId);
        const payload = JSON.stringify(command);
        const totalAttempts = 1 + this.maxRetries; // 1 initial + maxRetries
        let attempts = 0;
        for (let i = 0; i < totalAttempts; i++) {
            attempts++;
            const delivered = await this.attemptPublish(topic, payload);
            if (delivered) {
                return {
                    delivered: true,
                    attempts,
                    timestamp: Date.now(),
                };
            }
        }
        return {
            delivered: false,
            attempts,
            timestamp: Date.now(),
        };
    }
    /**
     * Single publish attempt with ACK timeout.
     * Returns true if ACK received within timeout, false otherwise.
     */
    attemptPublish(topic, payload) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(false);
            }, this.ackTimeout);
            this.client.publish(topic, payload, { qos: 1 }, (err) => {
                clearTimeout(timeout);
                if (err) {
                    resolve(false);
                }
                else {
                    resolve(true);
                }
            });
        });
    }
}
//# sourceMappingURL=publisher.js.map