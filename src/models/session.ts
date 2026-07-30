/**
 * Reason a session was ended.
 */
export type SessionEndReason = "user_ended" | "alm_override" | "safety_override" | "admin_action";

/**
 * Guest-provided EV specifications for a single session.
 */
export interface GuestSpecs {
  batteryCapacity: number;
  batteryType: string;
  chargerType: string;
  chargerPowerRating: number;
}

/**
 * Active or historical charging session record.
 */
export interface Session {
  sessionId: string;
  userId: string;
  nodeId: string;
  sessionType: "owner" | "guest";
  startTimestamp: number;
  endTimestamp: number | null;
  initialSOC: number;
  batteryCapacity: number;
  chargerPowerRating: number;
  priorityScore: number;
  totalEnergyConsumed: number;
  totalTime: number;
  billAmount: number | null;
  endReason: SessionEndReason | null;
  active: boolean;
  guestSpecs: GuestSpecs | null;
}

/**
 * Finalized session returned when a session is ended.
 */
export interface FinalizedSession {
  sessionId: string;
  totalTime: number;
  totalEnergy: number;
  billAmount: number;
  endReason: SessionEndReason;
}

/**
 * Filters for querying session history.
 */
export interface SessionFilters {
  startDate?: number;
  endDate?: number;
  sessionType?: "owner" | "guest";
  nodeId?: string;
}
