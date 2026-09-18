/**
 * Stored node record for a registered ESP32 device.
 */
export interface NodeRecord {
    nodeId: string;
    displayName: string;
    locationLabel: string;
    registrationDate: number;
    active: boolean;
    lastSeenTimestamp: number;
    inTemperatureOverride: boolean;
}
/**
 * Parameters for registering a new ESP32 node.
 */
export interface RegisterNodeParams {
    nodeId: string;
    displayName: string;
    locationLabel: string;
}
/**
 * Full Firestore node document (includes additional fields for persistence).
 */
export interface NodeDocument extends NodeRecord {
    lastTelemetry: import('./telemetry.js').TelemetryPayload | null;
    temperatureOverrideSince: number | null;
}
//# sourceMappingURL=node.d.ts.map