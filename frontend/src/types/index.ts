/**
 * Shared TypeScript interfaces and data models for the Smart Socket Dashboard.
 * These types mirror backend models and define the contract between
 * the frontend services, stores, and UI components.
 */

// ─── Telemetry ───────────────────────────────────────────────────────────────

export interface TelemetryPayload {
  voltage: number;
  current: number;
  power: number;
  frequency: number;
  powerFactor: number;
  temperature: number;
  timestamp: number;
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

export interface NodeRecord {
  nodeId: string;
  displayName: string;
  locationLabel: string;
  registrationDate: number;
  active: boolean;
  lastSeenTimestamp: number;
  inTemperatureOverride: boolean;
}

export type NodeStatus = 'online' | 'offline' | 'override';

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface Session {
  sessionId: string;
  userId: string;
  nodeId: string;
  sessionType: 'owner' | 'guest';
  startTimestamp: number;
  endTimestamp: number | null;
  initialSOC: number;
  batteryCapacity: number;
  chargerPowerRating: number;
  priorityScore: number;
  totalEnergyConsumed: number;
  totalTime: number;
  billAmount: number | null;
  endReason: string | null;
  active: boolean;
  guestSpecs: GuestSpecs | null;
}

export interface GuestSpecs {
  batteryCapacity: number;
  batteryType: string;
  chargerType: string;
  chargerPowerRating: number;
}

// ─── User Profiles ───────────────────────────────────────────────────────────

export interface UserProfile {
  userId: string;
  name: string;
  evType: '2-wheeler' | '4-wheeler';
  brand: string;
  batteryCapacity: number;
  batteryType: string;
  chargerType: string;
  chargerPowerRating: number;
  rfidUids: string[];
  createdAt: number;
  updatedAt: number;
}

export interface UserProfileInput {
  name: string;
  evType: '2-wheeler' | '4-wheeler';
  brand: string;
  batteryCapacity: number;
  batteryType: string;
  chargerType: string;
  chargerPowerRating: number;
  rfidUids: string[];
}

// ─── API Parameters ──────────────────────────────────────────────────────────

export interface RegisterNodeParams {
  nodeId: string;
  displayName: string;
  locationLabel: string;
}

export interface GuestSessionParams {
  userId: string;
  nodeId: string;
  batteryCapacity?: number;
  chargerPowerRating?: number;
  initialSOC?: number;
  guestSpecs?: GuestSpecs;
}

export interface SessionFilters {
  startDate?: number;
  endDate?: number;
  sessionType?: 'owner' | 'guest';
  nodeId?: string;
}

// ─── WebSocket Messages ──────────────────────────────────────────────────────

export type WSMessage =
  | { type: 'telemetry'; nodeId: string; payload: TelemetryPayload }
  | { type: 'node_status'; nodeId: string; status: NodeStatus }
  | { type: 'alm_event'; event: { type: 'shedding'; nodeId: string; reason: string; timestamp: number } }
  | { type: 'session_update'; session: Session };

// ─── UI: Notifications ───────────────────────────────────────────────────────

export interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: number;
  autoDismiss: boolean;
  autoDismissMs?: number;
}

// ─── UI: System Events ───────────────────────────────────────────────────────

export interface SystemEvent {
  id: string;
  type: 'alm_shedding' | 'node_offline' | 'node_override' | 'session_ended';
  nodeId?: string;
  nodeName?: string;
  message: string;
  timestamp: number;
  severity: 'info' | 'warning' | 'critical';
}
