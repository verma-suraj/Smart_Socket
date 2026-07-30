import type {
  IPriorityCalculator,
  SessionParams,
  ActiveSession,
} from "../../interfaces/priority-calculator.interface.js";

const DEFAULT_SOC = 0.20;

/**
 * Calculates priority scores for charging sessions and resolves tie-breakers.
 *
 * Priority formula:
 *   estimated_charge_time = (battery_capacity × (1 - initial_SOC)) / charger_power_rating
 *
 * Special cases:
 *   - Guest without specs → priority = 0
 *   - Missing SOC → default to 0.20
 *
 * Tie-breaker: longest continuous running duration shed first (smallest startTimestamp).
 */
export class PriorityCalculator implements IPriorityCalculator {
  /**
   * Calculate the priority score for a session.
   *
   * Higher score = more estimated charge time remaining = higher priority (less likely to be shed).
   * Returns 0 for guest sessions without specs.
   */
  calculatePriority(session: SessionParams): number {
    // Guest without specs gets static lowest priority
    if (session.isGuest && !session.guestSpecsProvided) {
      return 0;
    }

    const soc = session.initialSOC != null && session.initialSOC >= 0 && session.initialSOC <= 1
      ? session.initialSOC
      : DEFAULT_SOC;

    const batteryCapacity = session.batteryCapacity;
    const chargerPowerRating = session.chargerPowerRating;

    // Guard against division by zero or invalid inputs
    if (chargerPowerRating <= 0 || batteryCapacity <= 0) {
      return 0;
    }

    const estimatedChargeTime = (batteryCapacity * (1 - soc)) / chargerPowerRating;

    return estimatedChargeTime;
  }

  /**
   * Resolve a tie-breaker among sessions with equal priority scores.
   *
   * Returns the nodeId of the session that should be shed first.
   * The session with the longest continuous running duration (smallest startTimestamp)
   * is selected for shedding.
   */
  resolveTieBreaker(sessions: ActiveSession[]): string {
    if (sessions.length === 0) {
      return "";
    }

    // The session with the smallest startTimestamp has been running the longest
    let longestRunning = sessions[0];

    for (let i = 1; i < sessions.length; i++) {
      if (sessions[i].startTimestamp < longestRunning.startTimestamp) {
        longestRunning = sessions[i];
      }
    }

    return longestRunning.nodeId;
  }
}

/**
 * Factory function to create a PriorityCalculator instance.
 */
export function createPriorityCalculator(): IPriorityCalculator {
  return new PriorityCalculator();
}
