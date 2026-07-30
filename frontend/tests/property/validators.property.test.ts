import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  classifyTemperature,
  clampThreshold,
  validateUserProfile,
  validateNodeRegistration,
  validateGuestSpecs,
} from '../../src/utils/validators';
import type { UserProfileInput, RegisterNodeParams, GuestSpecs } from '../../src/types';

/**
 * Property-based tests for validator utility functions.
 * Validates: Requirements 4.4, 4.5, 5.5, 8.1, 8.4, 9.1, 9.8, 10.3
 */

// ─── Property 8: Temperature classification ─────────────────────────────────

describe('Feature: smart-socket-dashboard, Property 8: Temperature classification', () => {
  it('returns "normal" for any temperature ≤ 38', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 38, noNaN: true, noDefaultInfinity: true }),
        (temp) => {
          return classifyTemperature(temp) === 'normal';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "warning" for any temperature > 38 and ≤ 40', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 38.000001, max: 40, noNaN: true, noDefaultInfinity: true }),
        (temp) => {
          return classifyTemperature(temp) === 'warning';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns "critical" for any temperature > 40', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 40.000001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (temp) => {
          return classifyTemperature(temp) === 'critical';
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Threshold value clamping ───────────────────────────────────

describe('Feature: smart-socket-dashboard, Property 11: Threshold value clamping', () => {
  it('output is always in [1, 100000] for any numeric input', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }),
        (value) => {
          const result = clampThreshold(value);
          return result >= 1 && result <= 100000;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('values below 1 clamp to 1', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1e9, max: 0.999999, noNaN: true, noDefaultInfinity: true }),
        (value) => {
          return clampThreshold(value) === 1;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('values above 100000 clamp to 100000', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100000.000001, max: 1e9, noNaN: true, noDefaultInfinity: true }),
        (value) => {
          return clampThreshold(value) === 100000;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('values in [1, 100000] are returned unchanged', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 100000, noNaN: true, noDefaultInfinity: true }),
        (value) => {
          return clampThreshold(value) === value;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 15: User profile validation ────────────────────────────────────

describe('Feature: smart-socket-dashboard, Property 15: User profile validation', () => {
  // Generator for valid UserProfileInput
  const validUserProfileArb: fc.Arbitrary<UserProfileInput> = fc.record({
    name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    evType: fc.constantFrom('2-wheeler' as const, '4-wheeler' as const),
    brand: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    batteryCapacity: fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
    batteryType: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    chargerType: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    chargerPowerRating: fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true }),
    rfidUids: fc.array(fc.string(), { maxLength: 5 }),
  });

  it('passes validation for any valid UserProfileInput', () => {
    fc.assert(
      fc.property(validUserProfileArb, (input) => {
        const result = validateUserProfile(input);
        return result.valid === true && result.errors.length === 0;
      }),
      { numRuns: 100 }
    );
  });

  it('fails when name is empty', () => {
    fc.assert(
      fc.property(
        validUserProfileArb.map((input) => ({ ...input, name: '' })),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when name exceeds 100 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 101, maxLength: 200 }).chain((name) =>
          validUserProfileArb.map((input) => ({ ...input, name }))
        ),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when evType is not "2-wheeler" or "4-wheeler"', () => {
    fc.assert(
      fc.property(
        validUserProfileArb.map((input) => ({
          ...input,
          evType: 'truck' as '2-wheeler' | '4-wheeler',
        })),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when brand is empty', () => {
    fc.assert(
      fc.property(
        validUserProfileArb.map((input) => ({ ...input, brand: '' })),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when brand exceeds 50 characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 51, maxLength: 100 }).chain((brand) =>
          validUserProfileArb.map((input) => ({ ...input, brand }))
        ),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when batteryCapacity is out of range [0.1, 200]', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1000, max: 0.0999, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 200.001, max: 10000, noNaN: true, noDefaultInfinity: true })
        ).chain((batteryCapacity) =>
          validUserProfileArb.map((input) => ({ ...input, batteryCapacity }))
        ),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when chargerPowerRating is out of range [0.1, 50]', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1000, max: 0.0999, noNaN: true, noDefaultInfinity: true }),
          fc.double({ min: 50.001, max: 10000, noNaN: true, noDefaultInfinity: true })
        ).chain((chargerPowerRating) =>
          validUserProfileArb.map((input) => ({ ...input, chargerPowerRating }))
        ),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when rfidUids has more than 5 entries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 6, maxLength: 10 }).chain((rfidUids) =>
          validUserProfileArb.map((input) => ({ ...input, rfidUids }))
        ),
        (input) => {
          const result = validateUserProfile(input);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 17: Node registration validation ──────────────────────────────

describe('Feature: smart-socket-dashboard, Property 17: Node registration validation', () => {
  // Generator for valid node IDs: 1-64 chars, alphanumeric + hyphens
  const nodeIdChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
  const validNodeIdArb = fc
    .array(fc.constantFrom(...nodeIdChars.split('')), { minLength: 1, maxLength: 64 })
    .map((chars) => chars.join(''));

  // Generator for valid display names: 1-128 chars
  const validDisplayNameArb = fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.trim().length > 0);

  // Generator for valid location labels: 1-128 chars
  const validLocationLabelArb = fc.string({ minLength: 1, maxLength: 128 }).filter((s) => s.trim().length > 0);

  it('passes validation for valid nodeId, displayName, and locationLabel', () => {
    fc.assert(
      fc.property(
        validNodeIdArb,
        validDisplayNameArb,
        validLocationLabelArb,
        (nodeId, displayName, locationLabel) => {
          const result = validateNodeRegistration({ nodeId, displayName, locationLabel });
          return result.valid === true && result.errors.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when nodeId contains invalid characters', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 64 }).filter((s) => !/^[a-zA-Z0-9-]+$/.test(s)),
        validDisplayNameArb,
        validLocationLabelArb,
        (nodeId, displayName, locationLabel) => {
          const result = validateNodeRegistration({ nodeId, displayName, locationLabel });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when nodeId is empty', () => {
    fc.assert(
      fc.property(
        validDisplayNameArb,
        validLocationLabelArb,
        (displayName, locationLabel) => {
          const result = validateNodeRegistration({ nodeId: '', displayName, locationLabel });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when nodeId exceeds 64 characters', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')), {
          minLength: 65,
          maxLength: 100,
        }).map((chars) => chars.join('')),
        validDisplayNameArb,
        validLocationLabelArb,
        (nodeId, displayName, locationLabel) => {
          const result = validateNodeRegistration({ nodeId, displayName, locationLabel });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when displayName is empty', () => {
    fc.assert(
      fc.property(
        validNodeIdArb,
        validLocationLabelArb,
        (nodeId, locationLabel) => {
          const result = validateNodeRegistration({ nodeId, displayName: '', locationLabel });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when displayName exceeds 128 characters', () => {
    fc.assert(
      fc.property(
        validNodeIdArb,
        fc.string({ minLength: 129, maxLength: 200 }),
        validLocationLabelArb,
        (nodeId, displayName, locationLabel) => {
          const result = validateNodeRegistration({ nodeId, displayName, locationLabel });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when locationLabel is empty', () => {
    fc.assert(
      fc.property(
        validNodeIdArb,
        validDisplayNameArb,
        (nodeId, displayName) => {
          const result = validateNodeRegistration({ nodeId, displayName, locationLabel: '' });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('fails when locationLabel exceeds 128 characters', () => {
    fc.assert(
      fc.property(
        validNodeIdArb,
        validDisplayNameArb,
        fc.string({ minLength: 129, maxLength: 200 }),
        (nodeId, displayName, locationLabel) => {
          const result = validateNodeRegistration({ nodeId, displayName, locationLabel });
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 19: Guest specs partial validation ─────────────────────────────

describe('Feature: smart-socket-dashboard, Property 19: Guest specs partial validation', () => {
  const validBatteryCapacity = fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true });
  const validBatteryType = fc.string({ minLength: 1, maxLength: 50 });
  const validChargerType = fc.string({ minLength: 1, maxLength: 50 });
  const validChargerPowerRating = fc.double({ min: 0.1, max: 50, noNaN: true, noDefaultInfinity: true });

  it('rejects when exactly 1 field is provided', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          validBatteryCapacity.map((v) => ({ batteryCapacity: v })),
          validBatteryType.map((v) => ({ batteryType: v })),
          validChargerType.map((v) => ({ chargerType: v })),
          validChargerPowerRating.map((v) => ({ chargerPowerRating: v }))
        ),
        (specs) => {
          const result = validateGuestSpecs(specs);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects when exactly 2 fields are provided', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(validBatteryCapacity, validBatteryType).map(([bc, bt]) => ({
            batteryCapacity: bc,
            batteryType: bt,
          })),
          fc.tuple(validBatteryCapacity, validChargerType).map(([bc, ct]) => ({
            batteryCapacity: bc,
            chargerType: ct,
          })),
          fc.tuple(validBatteryCapacity, validChargerPowerRating).map(([bc, cpr]) => ({
            batteryCapacity: bc,
            chargerPowerRating: cpr,
          })),
          fc.tuple(validBatteryType, validChargerType).map(([bt, ct]) => ({
            batteryType: bt,
            chargerType: ct,
          })),
          fc.tuple(validBatteryType, validChargerPowerRating).map(([bt, cpr]) => ({
            batteryType: bt,
            chargerPowerRating: cpr,
          })),
          fc.tuple(validChargerType, validChargerPowerRating).map(([ct, cpr]) => ({
            chargerType: ct,
            chargerPowerRating: cpr,
          }))
        ),
        (specs) => {
          const result = validateGuestSpecs(specs);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects when exactly 3 fields are provided', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(validBatteryCapacity, validBatteryType, validChargerType).map(([bc, bt, ct]) => ({
            batteryCapacity: bc,
            batteryType: bt,
            chargerType: ct,
          })),
          fc.tuple(validBatteryCapacity, validBatteryType, validChargerPowerRating).map(([bc, bt, cpr]) => ({
            batteryCapacity: bc,
            batteryType: bt,
            chargerPowerRating: cpr,
          })),
          fc.tuple(validBatteryCapacity, validChargerType, validChargerPowerRating).map(([bc, ct, cpr]) => ({
            batteryCapacity: bc,
            chargerType: ct,
            chargerPowerRating: cpr,
          })),
          fc.tuple(validBatteryType, validChargerType, validChargerPowerRating).map(([bt, ct, cpr]) => ({
            batteryType: bt,
            chargerType: ct,
            chargerPowerRating: cpr,
          }))
        ),
        (specs) => {
          const result = validateGuestSpecs(specs);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('accepts when 0 fields are provided (empty object)', () => {
    const result = validateGuestSpecs({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts when all 4 fields are provided with valid ranges', () => {
    fc.assert(
      fc.property(
        validBatteryCapacity,
        validBatteryType,
        validChargerType,
        validChargerPowerRating,
        (batteryCapacity, batteryType, chargerType, chargerPowerRating) => {
          const result = validateGuestSpecs({
            batteryCapacity,
            batteryType,
            chargerType,
            chargerPowerRating,
          });
          return result.valid === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
