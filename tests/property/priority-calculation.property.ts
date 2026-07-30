import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PriorityCalculator } from '../../src/modules/priority-calculator/index.js';

/**
 * Property-based tests for priority score calculation.
 * Validates: Requirements 5.1, 5.2, 5.3, 12.2, 12.3
 */

describe('Feature: smart-socket-backend, Property 9: Priority Score Formula Correctness', () => {
  /**
   * **Validates: Requirements 5.1, 5.2, 12.2**
   *
   * For any valid session parameters (battery_capacity > 0, initial_SOC ∈ [0,1],
   * charger_power_rating > 0), the calculated Priority_Score SHALL equal
   * (battery_capacity × (1 - initial_SOC)) / charger_power_rating.
   * If initial_SOC is not provided (invalid), it SHALL default to 0.20.
   * Guest sessions with specs SHALL use the same formula.
   */
  it('priority score equals (battery_capacity × (1 - initial_SOC)) / charger_power_rating for valid inputs', () => {
    fc.assert(
      fc.property(
        // battery_capacity > 0
        fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
        // initial_SOC ∈ [0, 1]
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        // charger_power_rating > 0
        fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (batteryCapacity, initialSOC, chargerPowerRating) => {
          const calculator = new PriorityCalculator();

          const result = calculator.calculatePriority({
            batteryCapacity,
            initialSOC,
            chargerPowerRating,
            isGuest: false,
            guestSpecsProvided: false,
          });

          const expected = (batteryCapacity * (1 - initialSOC)) / chargerPowerRating;

          expect(result).toBeCloseTo(expected, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('defaults SOC to 0.20 when initial_SOC is invalid (negative)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
        // Invalid SOC: negative values
        fc.double({ min: -1000, max: -0.001, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (batteryCapacity, invalidSOC, chargerPowerRating) => {
          const calculator = new PriorityCalculator();

          const result = calculator.calculatePriority({
            batteryCapacity,
            initialSOC: invalidSOC,
            chargerPowerRating,
            isGuest: false,
            guestSpecsProvided: false,
          });

          // Should default to 0.20
          const expected = (batteryCapacity * (1 - 0.20)) / chargerPowerRating;

          expect(result).toBeCloseTo(expected, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('defaults SOC to 0.20 when initial_SOC is invalid (greater than 1)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
        // Invalid SOC: > 1
        fc.double({ min: 1.001, max: 1000, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (batteryCapacity, invalidSOC, chargerPowerRating) => {
          const calculator = new PriorityCalculator();

          const result = calculator.calculatePriority({
            batteryCapacity,
            initialSOC: invalidSOC,
            chargerPowerRating,
            isGuest: false,
            guestSpecsProvided: false,
          });

          // Should default to 0.20
          const expected = (batteryCapacity * (1 - 0.20)) / chargerPowerRating;

          expect(result).toBeCloseTo(expected, 10);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('guest sessions with specs use the same priority formula', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 200, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true, noDefaultInfinity: true }),
        (batteryCapacity, initialSOC, chargerPowerRating) => {
          const calculator = new PriorityCalculator();

          const result = calculator.calculatePriority({
            batteryCapacity,
            initialSOC,
            chargerPowerRating,
            isGuest: true,
            guestSpecsProvided: true,
          });

          const expected = (batteryCapacity * (1 - initialSOC)) / chargerPowerRating;

          expect(result).toBeCloseTo(expected, 10);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-backend, Property 10: Guest Without Specs Priority Is Zero', () => {
  /**
   * **Validates: Requirements 5.3, 12.3**
   *
   * For any guest session started without providing EV specifications,
   * the assigned Priority_Score SHALL be exactly 0, regardless of any
   * other system state.
   */
  it('guest without specs always returns priority 0 regardless of other parameters', () => {
    fc.assert(
      fc.property(
        // Arbitrary battery capacity (could be anything — should not matter)
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        // Arbitrary initial SOC
        fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
        // Arbitrary charger power rating
        fc.double({ min: -1000, max: 1000, noNaN: true, noDefaultInfinity: true }),
        (batteryCapacity, initialSOC, chargerPowerRating) => {
          const calculator = new PriorityCalculator();

          const result = calculator.calculatePriority({
            batteryCapacity,
            initialSOC,
            chargerPowerRating,
            isGuest: true,
            guestSpecsProvided: false,
          });

          expect(result).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
