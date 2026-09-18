import type { TelemetryPayload } from '../../models/index.js';
/**
 * Result of parsing a telemetry payload.
 * Discriminated union: check `success` to determine the variant.
 */
export type ParseResult = {
    success: true;
    payload: TelemetryPayload;
} | {
    success: false;
    error: string;
};
/**
 * Parses and validates a raw MQTT telemetry message payload.
 *
 * Accepts a Buffer or string (the raw MQTT message), attempts JSON parsing,
 * then validates that all required fields exist and are numeric.
 *
 * On success, returns a TelemetryPayload with short keys mapped to full names.
 * Power (`p`) is used directly from the payload — no V×I computation.
 *
 * @param raw - The raw MQTT message payload (Buffer or string)
 * @returns A ParseResult indicating success with the payload or failure with an error message
 */
export declare function parseTelemetryPayload(raw: Buffer | string): ParseResult;
//# sourceMappingURL=payload-parser.d.ts.map