import type { IMqttTransport } from '../../interfaces/mqtt-transport.interface.js';
import type { TelemetryPayload, RelayCommand, DeliveryStatus } from '../../models/index.js';
import { MqttConnectionManager } from './connection-manager.js';
/**
 * Composes the full MQTT transport layer implementing IMqttTransport.
 * Manages connection lifecycle, subscriptions, publishing, and message routing.
 */
export declare class MqttTransport implements IMqttTransport {
    private connectionManager;
    private subscriptionManager;
    private publisher;
    private telemetryHandler;
    private rfidScanHandler;
    constructor(connectionManager?: MqttConnectionManager);
    /**
     * Connect to the MQTT broker and set up message handlers.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the MQTT broker cleanly.
     */
    disconnect(): Promise<void>;
    /**
     * Subscribe to telemetry and RFID topics for a node.
     */
    subscribe(nodeId: string): void;
    /**
     * Unsubscribe from telemetry and RFID topics for a node.
     */
    unsubscribe(nodeId: string): void;
    /**
     * Publish a relay command to a node.
     */
    publishCommand(nodeId: string, command: RelayCommand): Promise<DeliveryStatus>;
    /**
     * Register a handler for incoming telemetry data.
     */
    onTelemetry(handler: (nodeId: string, payload: TelemetryPayload) => void): void;
    /**
     * Register a handler for incoming RFID scan events.
     */
    onRfidScan(handler: (nodeId: string, uid: string) => void): void;
    /**
     * Sets up the MQTT message handler for routing incoming messages.
     * Determines if a message is telemetry or RFID based on topic pattern,
     * parses accordingly, and invokes the appropriate handler.
     */
    private setupMessageHandler;
    /**
     * Extracts the node ID from a topic string.
     * Assumes topic format: alm/node/{node_id}/...
     */
    private extractNodeId;
    /**
     * Checks if a topic matches the telemetry pattern.
     */
    private isTelemetryTopic;
    /**
     * Checks if a topic matches the RFID pattern.
     */
    private isRfidTopic;
    /**
     * Handles an incoming telemetry message. Parses and dispatches to handler.
     * Discards malformed payloads with a console.warn.
     */
    private handleTelemetryMessage;
    /**
     * Handles an incoming RFID scan message. Parses the UID and dispatches to handler.
     */
    private handleRfidMessage;
}
export { MqttConnectionManager } from './connection-manager.js';
export { SubscriptionManager } from './subscription-manager.js';
export { MqttPublisher } from './publisher.js';
export { parseTelemetryPayload } from './payload-parser.js';
//# sourceMappingURL=index.d.ts.map