/**
 * Telemetry payload received from ESP32 nodes via MQTT.
 * Topic: alm/node/{node_id}/telemetry
 */
export interface TelemetryPayload {
  /** Voltage in volts (V) */
  voltage: number;
  /** Current in amps (A) */
  current: number;
  /** Power in watts (W) — measured directly by PZEM-004T */
  power: number;
  /** Frequency in hertz (Hz) */
  frequency: number;
  /** Power factor (0-1) */
  powerFactor: number;
  /** Temperature in degrees Celsius (°C) */
  temperature: number;
  /** Unix timestamp in seconds */
  timestamp: number;
}

/**
 * Relay command sent to ESP32 nodes via MQTT.
 * Topic: alm/node/{node_id}/command
 */
export interface RelayCommand {
  relay_state: "on" | "off";
  timestamp: number;
  reason: "alm" | "safety" | "user" | "auth" | "auth_denied";
  /** Optional user display name, sent to the node on successful RFID auth (for the LCD). */
  userName?: string;
}

/**
 * Delivery status of a published MQTT command.
 */
export interface DeliveryStatus {
  delivered: boolean;
  attempts: number;
  timestamp: number;
}
