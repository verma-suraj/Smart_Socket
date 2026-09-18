import { EventEmitter } from 'events';
import mqtt from 'mqtt';
import { config } from '../../config/index.js';
/**
 * Manages MQTT broker connection with custom exponential backoff reconnection.
 *
 * Backoff formula: delay = min(2^N × baseDelay, maxDelay)
 * where N is the attempt count starting from 1.
 *
 * Emits events: 'connected', 'disconnected', 'reconnecting', 'error'
 */
export class MqttConnectionManager extends EventEmitter {
    constructor(options) {
        super();
        this.client = null;
        this.reconnectAttempt = 0;
        this.reconnectTimer = null;
        this.intentionalDisconnect = false;
        this._state = 'disconnected';
        this.brokerUrl = options?.brokerUrl ?? config.mqtt.brokerUrl;
        this.username = options?.username ?? config.mqtt.username;
        this.password = options?.password ?? config.mqtt.password;
        this.baseDelay = options?.baseDelay ?? config.mqtt.reconnect.baseDelay;
        this.maxDelay = options?.maxDelay ?? config.mqtt.reconnect.maxDelay;
    }
    /**
     * Current connection state.
     */
    get state() {
        return this._state;
    }
    /**
     * The underlying MQTT client instance (null if not connected).
     */
    get mqttClient() {
        return this.client;
    }
    /**
     * Calculates the reconnection delay for a given attempt number.
     * Formula: min(2^N × baseDelay, maxDelay)
     */
    calculateBackoffDelay(attempt) {
        const delay = Math.pow(2, attempt) * this.baseDelay;
        return Math.min(delay, this.maxDelay);
    }
    /**
     * Connect to the MQTT broker.
     * Resolves when the connection is established.
     * Rejects if the initial connection fails.
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (this.client && this._state === 'connected') {
                resolve();
                return;
            }
            this.intentionalDisconnect = false;
            this.reconnectAttempt = 0;
            const clientOptions = {
                username: this.username || undefined,
                password: this.password || undefined,
                reconnectPeriod: 0, // Disable built-in reconnect — we handle it manually
                connectTimeout: 10000,
            };
            this.client = mqtt.connect(this.brokerUrl, clientOptions);
            const onConnect = () => {
                this.client.removeListener('error', onFirstError);
                this._state = 'connected';
                this.reconnectAttempt = 0;
                this.emit('connected');
                resolve();
            };
            const onFirstError = (err) => {
                this.client.removeListener('connect', onConnect);
                this._state = 'disconnected';
                this.emit('error', err);
                reject(err);
            };
            this.client.once('connect', onConnect);
            this.client.once('error', onFirstError);
            // Handle subsequent disconnections for auto-reconnect
            this.client.on('close', () => {
                if (this._state === 'connected') {
                    this._state = 'disconnected';
                    this.emit('disconnected');
                }
                if (!this.intentionalDisconnect) {
                    this.scheduleReconnect();
                }
            });
            // Handle errors after initial connection
            this.client.on('error', (err) => {
                this.emit('error', err);
            });
            // Handle successful reconnections
            this.client.on('connect', () => {
                if (this._state !== 'connected') {
                    this._state = 'connected';
                    this.reconnectAttempt = 0;
                    this.emit('connected');
                }
            });
        });
    }
    /**
     * Disconnect from the MQTT broker and stop reconnection attempts.
     */
    disconnect() {
        return new Promise((resolve) => {
            this.intentionalDisconnect = true;
            this.clearReconnectTimer();
            if (!this.client) {
                this._state = 'disconnected';
                resolve();
                return;
            }
            this.client.end(false, {}, () => {
                this._state = 'disconnected';
                this.client = null;
                this.reconnectAttempt = 0;
                this.emit('disconnected');
                resolve();
            });
        });
    }
    /**
     * Schedules a reconnection attempt using exponential backoff.
     */
    scheduleReconnect() {
        if (this.intentionalDisconnect) {
            return;
        }
        this.reconnectAttempt++;
        const delay = this.calculateBackoffDelay(this.reconnectAttempt);
        this._state = 'reconnecting';
        this.emit('reconnecting', this.reconnectAttempt, delay);
        this.reconnectTimer = setTimeout(() => {
            this.attemptReconnect();
        }, delay);
    }
    /**
     * Attempts to reconnect to the MQTT broker.
     */
    attemptReconnect() {
        if (this.intentionalDisconnect || !this.client) {
            return;
        }
        this.client.reconnect();
    }
    /**
     * Clears any pending reconnection timer.
     */
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
//# sourceMappingURL=connection-manager.js.map