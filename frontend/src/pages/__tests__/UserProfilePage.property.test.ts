/**
 * Property 5: RFID UID List Bounded at 5
 *
 * For any user profile, the `rfidUids` array must never exceed 5 entries;
 * adding when at 5 must be rejected.
 *
 * **Validates: Requirements 1.6**
 *
 * Tag: Feature: rfid-tap-and-user-management, Property 5: RFID UID List Bounded at 5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';

/**
 * Replicate the Zod schema for rfidUids from UserProfilePage.
 * This tests the validation logic as a pure function.
 */
const rfidUidsSchema = z
  .array(z.object({ value: z.string().min(1, 'RFID UID cannot be empty') }))
  .max(5, 'At most 5 RFID UIDs allowed');

// Arbitrary: generates a valid non-empty RFID UID string (hex 8-20 chars)
const rfidUidValueArb = fc.stringMatching(/^[0-9a-fA-F]{8,20}$/);

// Arbitrary: generates an rfidUid object { value: string }
const rfidUidObjectArb = rfidUidValueArb.map((uid) => ({ value: uid }));

// Arbitrary: generates arrays of length 0-5 (valid range)
const validRfidArrayArb = fc.integer({ min: 0, max: 5 }).chain((len) =>
  fc.array(rfidUidObjectArb, { minLength: len, maxLength: len }),
);

// Arbitrary: generates arrays of length 6+ (invalid, exceeds bound)
const invalidRfidArrayArb = fc.integer({ min: 6, max: 20 }).chain((len) =>
  fc.array(rfidUidObjectArb, { minLength: len, maxLength: len }),
);

describe('Property 5: RFID UID List Bounded at 5', { timeout: 30_000 }, () => {
  it('rfidUids arrays with 0-5 non-empty entries must pass validation', () => {
    fc.assert(
      fc.property(validRfidArrayArb, (rfidUids) => {
        const result = rfidUidsSchema.safeParse(rfidUids);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('rfidUids arrays with 6+ entries must be rejected by validation', () => {
    fc.assert(
      fc.property(invalidRfidArrayArb, (rfidUids) => {
        const result = rfidUidsSchema.safeParse(rfidUids);
        expect(result.success).toBe(false);
        if (!result.success) {
          // The error should mention the max constraint
          const messages = result.error.issues.map((i) => i.message);
          expect(messages).toContain('At most 5 RFID UIDs allowed');
        }
      }),
      { numRuns: 100 },
    );
  });
});
