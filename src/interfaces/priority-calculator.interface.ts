export interface SessionParams {
  batteryCapacity: number;
  initialSOC: number;
  chargerPowerRating: number;
  isGuest: boolean;
  guestSpecsProvided: boolean;
}

export interface ActiveSession {
  nodeId: string;
  priorityScore: number;
  startTimestamp: number;
}

export interface IPriorityCalculator {
  calculatePriority(session: SessionParams): number;
  resolveTieBreaker(sessions: ActiveSession[]): string;
}
