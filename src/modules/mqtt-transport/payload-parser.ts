import type { TelemetryPayload } from '../../models/index.js';

/**
 * Result of parsing a telemetry payload.
 * Discriminated union: check `success` to determine the variant.
 */
export type ParseResult =
  | { success: true; payload: TelemetryPayload }
  | { success: false; error: string };

/** Required short-key fields in the raw MQTT telemetry JSON. */
const REQUIRED_FIELDS = ['v', 'i', 'p', 'f', 'pf', 't', 'ts'] as const;

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
export function parseTelemetryPayload(raw: Buffer | string): ParseResult {
  // Convert Buffer to string
  const text = typeof raw === 'string' ? raw : raw.toString('utf-8');

  // Attempt JSON parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { success: false, error: 'Invalid JSON: payload is not valid JSON' };
  }

  // Ensure parsed value is a non-null object
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { success: false, error: 'Invalid payload: expected a JSON object' };
  }

  const obj = parsed as Record<string, unknown>;

  // Check for missing fields
  const missingFields = REQUIRED_FIELDS.filter((field) => !(field in obj));
  if (missingFields.length > 0) {
    return {
      success: false,
      error: `Missing required fields: ${missingFields.join(', ')}`,
    };
  }

  // Validate all fields are numeric (typeof number and not NaN)
  const nonNumericFields = REQUIRED_FIELDS.filter((field) => {
    const value = obj[field];
    return typeof value !== 'number' || Number.isNaN(value);
  });

  if (nonNumericFields.length > 0) {
    return {
      success: false,
      error: `Non-numeric fields: ${nonNumericFields.join(', ')}`,
    };
  }

  // Map short keys to TelemetryPayload structure
  const payload: TelemetryPayload = {
    voltage: obj['v'] as number,
    current: obj['i'] as number,
    power: obj['p'] as number,        // Use power directly — no V×I calculation
    frequency: obj['f'] as number,
    powerFactor: obj['pf'] as number,
    temperature: obj['t'] as number,
    timestamp: obj['ts'] as number,
  };

  return { success: true, payload };
}
