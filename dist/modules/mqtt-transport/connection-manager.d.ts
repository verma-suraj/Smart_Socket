import { EventEmitter } from 'events';
import { MqttClient } from 'mqtt';
export type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';
export interface ConnectionManagerEvents {
    connected: [];
    disconnected: [];
    reconnecting: [attempt: number, delay: number];
    error: [error: Error];
}
/**
 * Manages MQTT broker connection with custom exponential backoff reconnection.
 *
 * Backoff formula: delay = min(2^N × baseDelay, maxDelay)
 * where N is the attempt count starting from 1.
 *
 * Emits events: 'connected', 'disconnected', 'reconnecting', 'error'
 */
export declare class MqttConnectionManager extends EventEmitter {
    private client;
    private reconnectAttempt;
    private reconnectTimer;
    private intentionalDisconnect;
    private _state;
    private readonly brokerUrl;
    private readonly username;
    private readonly password;
    private readonly baseDelay;
    private readonly maxDelay;
    constructor(options?: {
        brokerUrl?: string;
        username?: string;
        password?: string;
        baseDelay?: number;
        maxDelay?: number;
    });
    /**
     * Current connection state.
     */
    get state(): ConnectionState;
    /**
     * The underlying MQTT client instance (null if not connected).
     */
    get mqttClient(): MqttClient | null;
    /**
     * Calculates the reconnection delay for a given attempt number.
     * Formula: min(2^N × baseDelay, maxDelay)
     */
    calculateBackoffDelay(attempt: number): number;
    /**
     * Connect to the MQTT broker.
     * Resolves when the connection is established.
     * Rejects if the initial connection fails.
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the MQTT broker and stop reconnection attempts.
     */
    disconnect(): Promise<void>;
    /**
     * Schedules a reconnection attempt using exponential backoff.
     */
    private scheduleReconnect;
    /**
     * Attempts to reconnect to the MQTT broker.
     */
    private attemptReconnect;
    /**
     * Clears any pending reconnection timer.
     */
    private clearReconnectTimer;
}
//# sourceMappingURL=connection-manager.d.ts.map