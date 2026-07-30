import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  createSession,
  updateSessionEnergy,
  finalizeSession,
  getActiveSession,
  getActiveSessionsMap,
} from '../../src/modules/session-manager/session-lifecycle.js';
import {
  addToHistory,
  getSessionHistory,
  deleteSession,
  getHistoryMap,
} from '../../src/modules/session-manager/session-history.js';
import { config } from '../../src/config/index.js';
import type { Session, SessionFilters } from '../../src/models/index.js';

/**
 * Property-based tests for the Session Manager module.
 * Validates: Requirements 8.2, 8.3, 8.5, 9.2, 9.4
 */

describe('Feature: smart-socket-backend, Property 15: Energy Accumulation Correctness', () => {
  /**
   * **Validates: Requirements 8.2, 8.3**
   *
   * For any sequence of telemetry readings with power values [p₁, p₂, ..., pₙ]
   * received at time intervals [Δt₁, Δt₂, ..., Δtₙ], the accumulated session energy
   * SHALL equal Σ(pᵢ × Δtᵢ) converted to kWh (divided by 3,600,000 if power is in
   * watts and time in milliseconds).
   */
  beforeEach(() => {
    getActiveSessionsMap().clear();
  });

  it('accumulated energy equals sum of (power × duration) / 3_600_000 for any sequence of readings', () => {
    fc.assert(
      fc.property(
        // Generate an array of telemetry readings: [powerWatts, durationMs]
        fc.array(
          fc.tuple(
            fc.double({ min: 0, max: 50000, noNaN: true, noDefaultInfinity: true }), // powerWatts
            fc.double({ min: 0, max: 60000, noNaN: true, noDefaultInfinity: true })  // durationMs
          ),
          { minLength: 1, maxLength: 20 }
        ),
        (readings) => {
          const nodeId = 'test-node-energy';

          // Create a session for this node
          createSession({
            userId: 'user-1',
            nodeId,
            sessionType: 'owner',
            batteryCapacity: 60,
            chargerPowerRating: 7.4,
            initialSOC: 0.5,
          });

          // Apply each reading
          for (const [powerWatts, durationMs] of readings) {
            updateSessionEnergy(nodeId, powerWatts, durationMs);
          }

          // Calculate expected energy
          const expectedEnergy = readings.reduce(
            (sum, [powerWatts, durationMs]) => sum + (powerWatts * durationMs) / 3_600_000,
            0
          );

          const session = getActiveSession(nodeId);
          expect(session).not.toBeNull();
          expect(session!.totalEnergyConsumed).toBeCloseTo(expectedEnergy, 10);

          // Cleanup
          getActiveSessionsMap().clear();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-backend, Property 16: Session Bill Calculation', () => {
  /**
   * **Validates: Requirements 8.5, 9.2**
   *
   * For any finalized session with total energy consumed E (kWh) and configured
   * per-unit rate R, the Session_Bill SHALL equal E × R.
   */
  beforeEach(() => {
    getActiveSessionsMap().clear();
  });

  it('bill amount equals totalEnergyConsumed × perUnitRate for any finalized session', () => {
    fc.assert(
      fc.property(
        // Generate energy readings to accumulate before finalizing
        fc.array(
          fc.tuple(
            fc.double({ min: 100, max: 22000, noNaN: true, noDefaultInfinity: true }), // powerWatts
            fc.double({ min: 100, max: 30000, noNaN: true, noDefaultInfinity: true })  // durationMs
          ),
          { minLength: 1, maxLength: 10 }
        ),
        (readings) => {
          const nodeId = 'test-node-bill';

          // Create a session
          createSession({
            userId: 'user-bill',
            nodeId,
            sessionType: 'owner',
            batteryCapacity: 40,
            chargerPowerRating: 7.4,
            initialSOC: 0.3,
          });

          // Accumulate energy
          for (const [powerWatts, durationMs] of readings) {
            updateSessionEnergy(nodeId, powerWatts, durationMs);
          }

          // Compute expected energy
          const expectedEnergy = readings.reduce(
            (sum, [powerWatts, durationMs]) => sum + (powerWatts * durationMs) / 3_600_000,
            0
          );

          // Finalize the session
          const finalized = finalizeSession(nodeId, 'user_ended');

          // Bill should equal energy × perUnitRate
          const expectedBill = expectedEnergy * config.session.perUnitRate;

          expect(finalized.billAmount).toBeCloseTo(expectedBill, 10);
          expect(finalized.totalEnergy).toBeCloseTo(expectedEnergy, 10);

          // Cleanup
          getActiveSessionsMap().clear();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-backend, Property 17: Session Deletion Removes From History', () => {
  /**
   * **Validates: Requirements 9.4**
   *
   * For any session that is deleted, subsequent queries to session history
   * SHALL NOT include that session in results.
   */
  beforeEach(() => {
    getHistoryMap().clear();
  });

  it('deleted session is not returned by getSessionHistory', () => {
    fc.assert(
      fc.property(
        // Number of sessions to create
        fc.integer({ min: 2, max: 10 }),
        // Index of the session to delete (will be modded by count)
        fc.integer({ min: 0, max: 100 }),
        (sessionCount, deleteIdx) => {
          const userId = 'user-delete-test';
          const actualDeleteIdx = deleteIdx % sessionCount;

          // Create sessions and add them to history
          const sessions: Session[] = [];
          for (let i = 0; i < sessionCount; i++) {
            const session: Session = {
              sessionId: `session-${i}-${Date.now()}`,
              userId,
              nodeId: `node-${i}`,
              sessionType: i % 2 === 0 ? 'owner' : 'guest',
              startTimestamp: Date.now() - (sessionCount - i) * 60000,
              endTimestamp: Date.now() - (sessionCount - i - 1) * 60000,
              initialSOC: 0.2,
              batteryCapacity: 40,
              chargerPowerRating: 7.4,
              priorityScore: 1.0,
              totalEnergyConsumed: 5.0,
              totalTime: 60,
              billAmount: 40.0,
              endReason: 'user_ended',
              active: false,
              guestSpecs: null,
            };
            sessions.push(session);
            addToHistory(session);
          }

          const sessionToDelete = sessions[actualDeleteIdx];

          // Delete the chosen session
          deleteSession(sessionToDelete.sessionId);

          // Query history — deleted session must not appear
          const history = getSessionHistory(userId);
          const deletedFound = history.some(s => s.sessionId === sessionToDelete.sessionId);

          expect(deletedFound).toBe(false);
          expect(history.length).toBe(sessionCount - 1);

          // Cleanup
          getHistoryMap().clear();
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Feature: smart-socket-backend, Property 18: Session Filter Correctness', () => {
  /**
   * **Validates: Requirements 9.2, 9.4**
   *
   * For any set of sessions and any combination of filter criteria (date range,
   * session_type, node_id), the returned results SHALL contain exactly those sessions
   * that match ALL specified filter criteria — no more, no less.
   */
  beforeEach(() => {
    getHistoryMap().clear();
  });

  it('filtered results match exactly those sessions satisfying all filter criteria', () => {
    const userId = 'user-filter-test';

    // Arbitraries for session generation
    const sessionTypeArb = fc.constantFrom('owner' as const, 'guest' as const);
    const nodeIdArb = fc.constantFrom('node-A', 'node-B', 'node-C');
    const timestampArb = fc.integer({ min: 1_000_000_000_000, max: 1_700_000_000_000 });

    // Generate a list of sessions with varying attributes
    const sessionsArb = fc.array(
      fc.tuple(sessionTypeArb, nodeIdArb, timestampArb),
      { minLength: 1, maxLength: 15 }
    );

    // Generate optional filter criteria
    const filtersArb = fc.record({
      startDate: fc.option(timestampArb, { nil: undefined }),
      endDate: fc.option(timestampArb, { nil: undefined }),
      sessionType: fc.option(sessionTypeArb, { nil: undefined }),
      nodeId: fc.option(nodeIdArb, { nil: undefined }),
    });

    fc.assert(
      fc.property(sessionsArb, filtersArb, (sessionData, filters) => {
        // Clear previous state
        getHistoryMap().clear();

        // Create and add sessions to history
        const sessions: Session[] = sessionData.map(([type, node, timestamp], i) => ({
          sessionId: `filter-session-${i}`,
          userId,
          nodeId: node,
          sessionType: type,
          startTimestamp: timestamp,
          endTimestamp: timestamp + 60000,
          initialSOC: 0.2,
          batteryCapacity: 40,
          chargerPowerRating: 7.4,
          priorityScore: 1.0,
          totalEnergyConsumed: 3.0,
          totalTime: 60,
          billAmount: 24.0,
          endReason: 'user_ended' as const,
          active: false,
          guestSpecs: null,
        }));

        for (const session of sessions) {
          addToHistory(session);
        }

        // Build the filter object (only include defined criteria)
        const appliedFilters: SessionFilters = {};
        if (filters.startDate !== undefined) appliedFilters.startDate = filters.startDate;
        if (filters.endDate !== undefined) appliedFilters.endDate = filters.endDate;
        if (filters.sessionType !== undefined) appliedFilters.sessionType = filters.sessionType;
        if (filters.nodeId !== undefined) appliedFilters.nodeId = filters.nodeId;

        // Query with filters
        const results = getSessionHistory(userId, appliedFilters);

        // Manually compute expected results using AND logic
        const expected = sessions.filter(s => {
          if (appliedFilters.startDate != null && s.startTimestamp < appliedFilters.startDate) return false;
          if (appliedFilters.endDate != null && s.startTimestamp > appliedFilters.endDate) return false;
          if (appliedFilters.sessionType != null && s.sessionType !== appliedFilters.sessionType) return false;
          if (appliedFilters.nodeId != null && s.nodeId !== appliedFilters.nodeId) return false;
          return true;
        });

        // Results should contain exactly the expected sessions
        expect(results.length).toBe(expected.length);

        const resultIds = new Set(results.map(r => r.sessionId));
        for (const exp of expected) {
          expect(resultIds.has(exp.sessionId)).toBe(true);
        }

        // Cleanup
        getHistoryMap().clear();
      }),
      { numRuns: 100 }
    );
  });
});
