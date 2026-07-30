import { Session, FinalizedSession, SessionEndReason, SessionFilters } from '../models/index.js';

export interface CreateSessionParams {
  userId: string;
  nodeId: string;
  sessionType: "owner" | "guest";
  batteryCapacity: number;
  chargerPowerRating: number;
  initialSOC?: number;
  guestSpecs?: { batteryCapacity: number; batteryType: string; chargerType: string; chargerPowerRating: number } | null;
}

export interface ISessionManager {
  createSession(params: CreateSessionParams): Promise<Session>;
  updateSessionEnergy(nodeId: string, powerWatts: number, durationMs: number): void;
  finalizeSession(nodeId: string, reason: SessionEndReason): Promise<FinalizedSession>;
  getActiveSession(nodeId: string): Session | null;
  getSessionHistory(userId: string, filters?: SessionFilters): Promise<Session[]>;
  deleteSession(sessionId: string): Promise<void>;
  clearHistory(userId: string): Promise<void>;
}
