import type { MqttClient } from 'mqtt';
import { config } from '../../config/index.js';

/**
 * Manages dynamic MQTT topic subscriptions per node.
 * Subscribes/unsubscribes to telemetry and RFID topics for each node.
 */
export class SubscriptionManager {
  private activeSubscriptions = new Map<string, string[]>();

  constructor(private client: MqttClient) {}

  /**
   * Resolves a topic template by replacing {node_id} with the actual nodeId.
   */
  private resolveTopic(template: string, nodeId: string): string {
    return template.replace('{node_id}', nodeId);
  }

  /**
   * Subscribe to telemetry and RFID topics for a given node.
   */
  public subscribe(nodeId: string): void {
    if (this.activeSubscriptions.has(nodeId)) {
      return; // Already subscribed
    }

    const telemetryTopic = this.resolveTopic(config.mqtt.topics.telemetry, nodeId);
    const rfidTopic = this.resolveTopic(config.mqtt.topics.rfid, nodeId);
    const topics = [telemetryTopic, rfidTopic];

    for (const topic of topics) {
      this.client.subscribe(topic, { qos: config.mqtt.qos });
    }

    this.activeSubscriptions.set(nodeId, topics);
  }

  /**
   * Unsubscribe from telemetry and RFID topics for a given node.
   */
  public unsubscribe(nodeId: string): void {
    const topics = this.activeSubscriptions.get(nodeId);
    if (!topics) {
      return; // Not subscribed
    }

    for (const topic of topics) {
      this.client.unsubscribe(topic);
    }

    this.activeSubscriptions.delete(nodeId);
  }

  /**
   * Returns the set of currently subscribed node IDs.
   */
  public getActiveSubscriptions(): string[] {
    return Array.from(this.activeSubscriptions.keys());
  }
}
