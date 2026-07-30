import type { MqttClient } from 'mqtt';
import type { RelayCommand, DeliveryStatus } from '../../models/index.js';
import { config } from '../../config/index.js';

/**
 * Publishes MQTT commands with QoS 1 reliability.
 * Retries up to maxRetries times (default 3) with ackTimeout (default 5s) between attempts.
 */
export class MqttPublisher {
  private readonly ackTimeout: number;
  private readonly maxRetries: number;

  constructor(private client: MqttClient) {
    this.ackTimeout = config.mqtt.command.ackTimeout;
    this.maxRetries = config.mqtt.command.maxRetries;
  }

  /**
   * Resolves the command topic for a given node.
   */
  private resolveTopic(nodeId: string): string {
    return config.mqtt.topics.command.replace('{node_id}', nodeId);
  }

  /**
   * Publishes a relay command to the specified node with QoS 1.
   * Waits for ACK with configured timeout. Retries up to maxRetries times on timeout.
   * Returns delivery status indicating success/failure, attempts made, and timestamp.
   */
  public async publish(nodeId: string, command: RelayCommand): Promise<DeliveryStatus> {
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
  private attemptPublish(topic: string, payload: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, this.ackTimeout);

      this.client.publish(topic, payload, { qos: 1 }, (err) => {
        clearTimeout(timeout);
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }
}
