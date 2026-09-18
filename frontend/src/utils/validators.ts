/**
 * Pure validation utility functions for the Smart Socket Dashboard.
 */

import type { UserProfileInput, RegisterNodeParams, GuestSpecs } from '../types';

/**
 * Classify temperature into normal, warning, or critical.
 * - normal: temp ≤ 38
 * - warning: temp > 38 AND temp ≤ 40
 * - critical: temp > 40
 */
export function classifyTemperature(temp: number): 'normal' | 'warning' | 'critical' {
  if (temp > 40) return 'critical';
  if (temp > 38) return 'warning';
  return 'normal';
}

/**
 * Clamp a threshold value to the range [1, 100000].
 */
export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return 1;
  if (value < 1) return 1;
  if (value > 100000) return 100000;
  return value;
}

/**
 * Validate a user profile input. Returns valid: true if all constraints are met,
 * otherwise valid: false with a list of error messages.
 */
export function validateUserProfile(input: UserProfileInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.name || input.name.length === 0) {
    errors.push('Name is required');
  } else if (input.name.length > 100) {
    errors.push('Name must be at most 100 characters');
  }

  if (input.evType !== '2-wheeler' && input.evType !== '4-wheeler') {
    errors.push('EV type must be "2-wheeler" or "4-wheeler"');
  }

  if (!input.brand || input.brand.length === 0) {
    errors.push('Brand is required');
  } else if (input.brand.length > 50) {
    errors.push('Brand must be at most 50 characters');
  }

  if (input.batteryCapacity < 0.1 || input.batteryCapacity > 200) {
    errors.push('Battery capacity must be between 0.1 and 200');
  }

  if (!input.batteryType || input.batteryType.length === 0) {
    errors.push('Battery type is required');
  } else if (input.batteryType.length > 50) {
    errors.push('Battery type must be at most 50 characters');
  }

  if (!input.chargerType || input.chargerType.length === 0) {
    errors.push('Charger type is required');
  } else if (input.chargerType.length > 50) {
    errors.push('Charger type must be at most 50 characters');
  }

  if (input.chargerPowerRating < 0.1 || input.chargerPowerRating > 50) {
    errors.push('Charger power rating must be between 0.1 and 50');
  }

  if (input.rfidUids.length > 5) {
    errors.push('At most 5 RFID UIDs allowed');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate node registration parameters.
 * - nodeId: matches /^[a-zA-Z0-9-]{1,64}$/
 * - displayName: 1–128 characters
 * - locationLabel: 1–128 characters
 */
export function validateNodeRegistration(params: RegisterNodeParams): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const nodeIdPattern = /^[a-zA-Z0-9-]{1,64}$/;

  if (!nodeIdPattern.test(params.nodeId)) {
    errors.push('Node ID must be 1-64 characters, alphanumeric and hyphens only');
  }

  if (!params.displayName || params.displayName.length === 0) {
    errors.push('Display name is required');
  } else if (params.displayName.length > 128) {
    errors.push('Display name must be at most 128 characters');
  }

  if (!params.locationLabel || params.locationLabel.length === 0) {
    errors.push('Location label is required');
  } else if (params.locationLabel.length > 128) {
    errors.push('Location label must be at most 128 characters');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate guest specs: all 4 fields or none. Partial (1–3 fields) is invalid.
 * When all 4 are provided, also validates ranges.
 */
export function validateGuestSpecs(specs: Partial<GuestSpecs>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const fields = ['batteryCapacity', 'batteryType', 'chargerType', 'chargerPowerRating'] as const;
  const provided = fields.filter((f) => specs[f] !== undefined && specs[f] !== null && specs[f] !== '');

  if (provided.length === 0) {
    // No fields provided — valid (empty/no specs)
    return { valid: true, errors: [] };
  }

  if (provided.length > 0 && provided.length < 4) {
    errors.push('All 4 guest spec fields must be provided, or none');
    return { valid: false, errors };
  }

  // All 4 provided — validate ranges
  if (specs.batteryCapacity! < 0.1 || specs.batteryCapacity! > 200) {
    errors.push('Battery capacity must be between 0.1 and 200');
  }

  if (specs.chargerPowerRating! < 0.1 || specs.chargerPowerRating! > 50) {
    errors.push('Charger power rating must be between 0.1 and 50');
  }

  return { valid: errors.length === 0, errors };
}
