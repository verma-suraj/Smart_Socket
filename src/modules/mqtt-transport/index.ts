import type { MqttClient } from 'mqtt';
import type { IMqttTransport } from '../../interfaces/mqtt-transport.interface.js';
import type { TelemetryPayload, RelayCommand, DeliveryStatus } from '../../models/index.js';
import { MqttConnectionManager } from './connection-manager.js';
import { SubscriptionManager } from './subscription-manager.js';
import { MqttPublisher } from './publisher.js';
import { parseTelemetryPayload } from './payload-parser.js';
import { config } from '../../config/index.js';

/**
 * Composes the full MQTT transport layer implementing IMqttTransport.
 * Manages connection lifecycle, subscriptions, publishing, and message routing.
 */
export class MqttTransport implements IMqttTransport {
  private connectionManager: MqttConnectionManager;
  private subscriptionManager: SubscriptionManager | null = null;
  private publisher: MqttPublisher | null = null;

  private telemetryHandler: ((nodeId: string, payload: TelemetryPayload) => void) | null = null;
  private rfidScanHandler: ((nodeId: string, uid: string) => void) | null = null;

  constructor(connectionManager?: MqttConnectionManager) {
    this.connectionManager = connectionManager ?? new MqttConnectionManager();
  }

  /**
   * Connect to the MQTT broker and set up message handlers.
   */
  public async connect(): Promise<void> {
    await this.connectionManager.connect();

    const client = this.connectionManager.mqttClient;
    if (!client) {
      throw new Error('MQTT client not available after connection');
    }

    this.subscriptionManager = new SubscriptionManager(client);
    this.publisher = new MqttPublisher(client);

    this.setupMessageHandler(client);
  }

  /**
   * Disconnect from the MQTT broker cleanly.
   */
  public async disconnect(): Promise<void> {
    await this.connectionManager.disconnect();
    this.subscriptionManager = null;
    this.publisher = null;
  }

  /**
   * Subscribe to telemetry and RFID topics for a node.
   */
  public subscribe(nodeId: string): void {
    if (!this.subscriptionManager) {
      throw new Error('Not connected. Call connect() first.');
    }
    this.subscriptionManager.subscribe(nodeId);
  }

  /**
   * Unsubscribe from telemetry and RFID topics for a node.
   */
  public unsubscribe(nodeId: string): void {
    if (!this.subscriptionManager) {
      throw new Error('Not connected. Call connect() first.');
    }
    this.subscriptionManager.unsubscribe(nodeId);
  }

  /**
   * Publish a relay command to a node.
   */
  public async publishCommand(nodeId: string, command: RelayCommand): Promise<DeliveryStatus> {
    if (!this.publisher) {
      throw new Error('Not connected. Call connect() first.');
    }
    return this.publisher.publish(nodeId, command);
  }

  /**
   * Register a handler for incoming telemetry data.
   */
  public onTelemetry(handler: (nodeId: string, payload: TelemetryPayload) => void): void {
    this.telemetryHandler = handler;
  }

  /**
   * Register a handler for incoming RFID scan events.
   */
  public onRfidScan(handler: (nodeId: string, uid: string) => void): void {
    this.rfidScanHandler = handler;
  }

  /**
   * Sets up the MQTT message handler for routing incoming messages.
   * Determines if a message is telemetry or RFID based on topic pattern,
   * parses accordingly, and invokes the appropriate handler.
   */
  private setupMessageHandler(client: MqttClient): void {
    client.on('message', (topic: string, payload: Buffer) => {
      const nodeId = this.extractNodeId(topic);
      if (!nodeId) {
        return;
      }

      if (this.isTelemetryTopic(topic)) {
        this.handleTelemetryMessage(nodeId, payload);
      } else if (this.isRfidTopic(topic)) {
        this.handleRfidMessage(nodeId, payload);
      }
    });
  }

  /**
   * Extracts the node ID from a topic string.
   * Assumes topic format: alm/node/{node_id}/...
   */
  private extractNodeId(topic: string): string | null {
    const parts = topic.split('/');
    // Expected format: alm/node/{node_id}/{type}
    if (parts.length >= 4 && parts[0] === 'alm' && parts[1] === 'node') {
      return parts[2];
    }
    return null;
  }

  /**
   * Checks if a topic matches the telemetry pattern.
   */
  private isTelemetryTopic(topic: string): boolean {
    return topic.endsWith('/telemetry');
  }

  /**
   * Checks if a topic matches the RFID pattern.
   */
  private isRfidTopic(topic: string): boolean {
    return topic.endsWith('/rfid');
  }

  /**
   * Handles an incoming telemetry message. Parses and dispatches to handler.
   * Discards malformed payloads with a console.warn.
   */
  private handleTelemetryMessage(nodeId: string, payload: Buffer): void {
    const result = parseTelemetryPayload(payload);

    if (!result.success) {
      console.warn(`[MqttTransport] Malformed telemetry from node ${nodeId}: ${result.error}`);
      return;
    }

    if (this.telemetryHandler) {
      this.telemetryHandler(nodeId, result.payload);
    }
  }

  /**
   * Handles an incoming RFID scan message. Parses the UID and dispatches to handler.
   */
  private handleRfidMessage(nodeId: string, payload: Buffer): void {
    try {
      const data = JSON.parse(payload.toString('utf-8'));
      const uid = data?.uid;

      if (typeof uid !== 'string' || uid.length === 0) {
        console.warn(`[MqttTransport] Malformed RFID message from node ${nodeId}: missing or invalid uid`);
        return;
      }

      if (this.rfidScanHandler) {
        this.rfidScanHandler(nodeId, uid);
      }
    } catch {
      console.warn(`[MqttTransport] Failed to parse RFID message from node ${nodeId}: invalid JSON`);
    }
  }
}

export { MqttConnectionManager } from './connection-manager.js';
export { SubscriptionManager } from './subscription-manager.js';
export { MqttPublisher } from './publisher.js';
export { parseTelemetryPayload } from './payload-parser.js';
