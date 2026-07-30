import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  truncateDisplayName,
  formatTelemetryValue,
  formatTimestamp,
  formatDuration,
  truncateErrorMessage,
} from '../../src/utils/formatters';

/**
 * Property-based tests for formatter utility functions.
 * Validates: Requirements 1.6, 4.3, 4.6, 6.5, 12.2
 */

describe('Feature: smart-socket-dashboard, Property 2: Display name truncation', () => {
  it('output is always at most 33 characters', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = truncateDisplayName(input);
        return result.length <= 33;
      }),
      { numRuns: 100 }
    );
  });

  it('input of 30 chars or fewer returns input unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 30 }),
        (input) => {
          const result = truncateDisplayName(input);
          return result === input;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 7: Telemetry value formatting precision', () => {
  const oneDecimalFields = ['voltage', 'power', 'frequency', 'temperature'] as const;
  const twoDecimalFields = ['current', 'powerFactor'] as const;

  it('voltage, power, frequency, temperature produce exactly 1 decimal place', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...oneDecimalFields),
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        (field, value) => {
          const result = formatTelemetryValue(field, value);
          // Must match pattern: optional minus, digits, dot, exactly 1 digit
          return /^-?\d+\.\d{1}$/.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('current, powerFactor produce exactly 2 decimal places', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...twoDecimalFields),
        fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }),
        (field, value) => {
          const result = formatTelemetryValue(field, value);
          // Must match pattern: optional minus, digits, dot, exactly 2 digits
          return /^-?\d+\.\d{2}$/.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 9: Timestamp formatting', () => {
  it('produces a string matching YYYY-MM-DD HH:MM:SS pattern for any positive integer timestamp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4102444800000 }), // up to year ~2100
        (timestamp) => {
          const result = formatTimestamp(timestamp);
          return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 13: Duration formatting round-trip', () => {
  it('formatDuration produces HH:MM:SS that parses back to the original seconds', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 359999 }), // 99:59:59
        (seconds) => {
          const result = formatDuration(seconds);
          // Verify format matches HH:MM:SS
          const match = result.match(/^(\d{2,}):(\d{2}):(\d{2})$/);
          if (!match) return false;
          const [, hStr, mStr, sStr] = match;
          const parsedSeconds =
            parseInt(hStr, 10) * 3600 +
            parseInt(mStr, 10) * 60 +
            parseInt(sStr, 10);
          return parsedSeconds === seconds;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 20: Error message truncation', () => {
  it('output is always at most 200 characters', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = truncateErrorMessage(input);
        return result.length <= 200;
      }),
      { numRuns: 100 }
    );
  });

  it('input of 200 chars or fewer returns input unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        (input) => {
          const result = truncateErrorMessage(input);
          return result === input;
        }
      ),
      { numRuns: 100 }
    );
  });
});
