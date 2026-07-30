/**
 * Property-based tests for filter utility functions.
 *
 * Validates: Requirements 6.1, 7.1, 7.4, 8.3, 10.1, 10.7
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { NodeRecord, Session, SessionFilters, UserProfileInput } from '../../src/types';
import {
  sortSessionsByStartTime,
  buildSessionQueryParams,
  computeProfileDiff,
  filterAvailableNodes,
} from '../../src/utils/filters';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const evTypeArb = fc.constantFrom('2-wheeler' as const, '4-wheeler' as const);
const sessionTypeArb = fc.constantFrom('owner' as const, 'guest' as const);

const sessionArb: fc.Arbitrary<Session> = fc.record({
  sessionId: fc.string({ minLength: 1, maxLength: 20 }),
  userId: fc.string({ minLength: 1, maxLength: 20 }),
  nodeId: fc.string({ minLength: 1, maxLength: 20 }),
  sessionType: sessionTypeArb,
  startTimestamp: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  endTimestamp: fc.option(fc.integer({ min: 0, max: 2_000_000_000_000 }), { nil: null }),
  initialSOC: fc.integer({ min: 0, max: 100 }),
  batteryCapacity: fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),
  chargerPowerRating: fc.float({ min: Math.fround(0.1), max: Math.fround(50), noNaN: true }),
  priorityScore: fc.float({ min: Math.fround(0), max: Math.fround(1000), noNaN: true }),
  totalEnergyConsumed: fc.float({ min: Math.fround(0), max: Math.fround(10000), noNaN: true }),
  totalTime: fc.integer({ min: 0, max: 1_000_000 }),
  billAmount: fc.option(fc.float({ min: Math.fround(0), max: Math.fround(100000), noNaN: true }), { nil: null }),
  endReason: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
  active: fc.boolean(),
  guestSpecs: fc.option(
    fc.record({
      batteryCapacity: fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),
      batteryType: fc.string({ minLength: 1, maxLength: 20 }),
      chargerType: fc.string({ minLength: 1, maxLength: 20 }),
      chargerPowerRating: fc.float({ min: Math.fround(0.1), max: Math.fround(50), noNaN: true }),
    }),
    { nil: null },
  ),
});

const nodeRecordArb: fc.Arbitrary<NodeRecord> = fc.record({
  nodeId: fc.string({ minLength: 1, maxLength: 20 }),
  displayName: fc.string({ minLength: 1, maxLength: 50 }),
  locationLabel: fc.string({ minLength: 1, maxLength: 50 }),
  registrationDate: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  active: fc.boolean(),
  lastSeenTimestamp: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  inTemperatureOverride: fc.boolean(),
});

const userProfileInputArb: fc.Arbitrary<UserProfileInput> = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  evType: evTypeArb,
  brand: fc.string({ minLength: 1, maxLength: 50 }),
  batteryCapacity: fc.float({ min: Math.fround(0.1), max: Math.fround(200), noNaN: true }),
  batteryType: fc.string({ minLength: 1, maxLength: 30 }),
  chargerType: fc.string({ minLength: 1, maxLength: 30 }),
  chargerPowerRating: fc.float({ min: Math.fround(0.1), max: Math.fround(50), noNaN: true }),
  rfidUids: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 5 }),
});

const sessionFiltersArb: fc.Arbitrary<SessionFilters> = fc.record({
  startDate: fc.option(fc.integer({ min: 0, max: 2_000_000_000_000 }), { nil: undefined }),
  endDate: fc.option(fc.integer({ min: 0, max: 2_000_000_000_000 }), { nil: undefined }),
  sessionType: fc.option(sessionTypeArb, { nil: undefined }),
  nodeId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: smart-socket-dashboard, Property 12: Session list sorting', () => {
  /**
   * **Validates: Requirements 6.1**
   *
   * For any list of Session objects, sortSessionsByStartTime produces a list
   * where for every consecutive pair (sessions[i], sessions[i+1]),
   * sessions[i].startTimestamp >= sessions[i+1].startTimestamp
   */
  it('should sort sessions descending by startTimestamp', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 0, maxLength: 30 }), (sessions) => {
        const sorted = sortSessionsByStartTime(sessions);

        // Same length
        expect(sorted).toHaveLength(sessions.length);

        // Every consecutive pair is in descending order
        for (let i = 0; i < sorted.length - 1; i++) {
          expect(sorted[i].startTimestamp).toBeGreaterThanOrEqual(sorted[i + 1].startTimestamp);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should not mutate the original array', () => {
    fc.assert(
      fc.property(fc.array(sessionArb, { minLength: 1, maxLength: 10 }), (sessions) => {
        const original = [...sessions];
        sortSessionsByStartTime(sessions);

        // Original array is unchanged
        expect(sessions).toEqual(original);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 14: Session filter query construction', () => {
  /**
   * **Validates: Requirements 7.1, 7.4**
   *
   * For any valid SessionFilters object (with any combination of startDate, endDate,
   * sessionType, nodeId being defined or undefined), buildSessionQueryParams includes
   * exactly the defined fields as query params and omits undefined fields
   */
  it('should include exactly the defined fields and omit undefined fields', () => {
    fc.assert(
      fc.property(sessionFiltersArb, (filters) => {
        const params = buildSessionQueryParams(filters);

        const definedKeys: string[] = [];
        if (filters.startDate !== undefined) definedKeys.push('startDate');
        if (filters.endDate !== undefined) definedKeys.push('endDate');
        if (filters.sessionType !== undefined) definedKeys.push('sessionType');
        if (filters.nodeId !== undefined) definedKeys.push('nodeId');

        // Params has exactly the defined keys
        const paramKeys = Object.keys(params).sort();
        expect(paramKeys).toEqual(definedKeys.sort());

        // Each value is the string representation
        if (filters.startDate !== undefined) {
          expect(params.startDate).toBe(String(filters.startDate));
        }
        if (filters.endDate !== undefined) {
          expect(params.endDate).toBe(String(filters.endDate));
        }
        if (filters.sessionType !== undefined) {
          expect(params.sessionType).toBe(filters.sessionType);
        }
        if (filters.nodeId !== undefined) {
          expect(params.nodeId).toBe(filters.nodeId);
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 16: Profile update diff computation', () => {
  /**
   * **Validates: Requirements 8.3**
   *
   * For any two UserProfileInput objects (original and modified), computeProfileDiff
   * returns only fields where values differ.
   * If original === modified (same values), diff should be empty {}.
   */
  it('should return only fields where values differ', () => {
    fc.assert(
      fc.property(userProfileInputArb, userProfileInputArb, (original, modified) => {
        const diff = computeProfileDiff(original, modified);

        // Each key in diff must have a different value from original
        for (const key of Object.keys(diff) as (keyof UserProfileInput)[]) {
          if (key === 'rfidUids') {
            expect(JSON.stringify(original.rfidUids)).not.toBe(JSON.stringify(modified.rfidUids));
          } else {
            expect(original[key]).not.toBe(modified[key]);
          }
        }

        // Each field that differs should be in the diff
        const simpleKeys: (keyof Omit<UserProfileInput, 'rfidUids'>)[] = [
          'name', 'evType', 'brand', 'batteryCapacity', 'batteryType', 'chargerType', 'chargerPowerRating',
        ];
        for (const key of simpleKeys) {
          if (original[key] !== modified[key]) {
            expect(diff).toHaveProperty(key, modified[key]);
          }
        }
        if (JSON.stringify(original.rfidUids) !== JSON.stringify(modified.rfidUids)) {
          expect(diff).toHaveProperty('rfidUids', modified.rfidUids);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('should return empty object when original equals modified', () => {
    fc.assert(
      fc.property(userProfileInputArb, (profile) => {
        // Clone to create identical input
        const clone: UserProfileInput = {
          ...profile,
          rfidUids: [...profile.rfidUids],
        };
        const diff = computeProfileDiff(profile, clone);
        expect(Object.keys(diff)).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: smart-socket-dashboard, Property 18: Available node filtering', () => {
  /**
   * **Validates: Requirements 10.1, 10.7**
   *
   * For any set of NodeRecord objects and active Session objects,
   * filterAvailableNodes returns only nodes where active===true AND
   * inTemperatureOverride===false AND no active session has matching nodeId
   */
  it('should return only online, non-override, non-occupied nodes', () => {
    fc.assert(
      fc.property(
        fc.array(nodeRecordArb, { minLength: 0, maxLength: 20 }),
        fc.array(sessionArb, { minLength: 0, maxLength: 20 }),
        (nodes, sessions) => {
          const result = filterAvailableNodes(nodes, sessions);

          // Build the set of occupied node IDs (from active sessions)
          const occupiedNodeIds = new Set(
            sessions.filter((s) => s.active).map((s) => s.nodeId),
          );

          // Every returned node must satisfy all conditions
          for (const node of result) {
            expect(node.active).toBe(true);
            expect(node.inTemperatureOverride).toBe(false);
            expect(occupiedNodeIds.has(node.nodeId)).toBe(false);
          }

          // Every node that satisfies all conditions must be in the result
          const expectedNodes = nodes.filter(
            (n) => n.active && !n.inTemperatureOverride && !occupiedNodeIds.has(n.nodeId),
          );
          expect(result).toEqual(expectedNodes);
        },
      ),
      { numRuns: 100 },
    );
  });
});
