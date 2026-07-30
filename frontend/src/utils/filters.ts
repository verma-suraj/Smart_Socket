/**
 * Pure filtering and sorting utility functions for the Smart Socket Dashboard.
 */

import type { NodeRecord, Session, SessionFilters, UserProfileInput } from '../types';

/**
 * Filter nodes that are available for a guest session:
 * - active === true
 * - inTemperatureOverride === false
 * - no active session has a matching nodeId
 */
export function filterAvailableNodes(nodes: NodeRecord[], activeSessions: Session[]): NodeRecord[] {
  const occupiedNodeIds = new Set(
    activeSessions.filter((s) => s.active).map((s) => s.nodeId),
  );

  return nodes.filter(
    (node) => node.active && !node.inTemperatureOverride && !occupiedNodeIds.has(node.nodeId),
  );
}

/**
 * Build query params from session filters, including only defined fields.
 */
export function buildSessionQueryParams(filters: SessionFilters): Record<string, string> {
  const params: Record<string, string> = {};

  if (filters.startDate !== undefined) {
    params.startDate = String(filters.startDate);
  }
  if (filters.endDate !== undefined) {
    params.endDate = String(filters.endDate);
  }
  if (filters.sessionType !== undefined) {
    params.sessionType = filters.sessionType;
  }
  if (filters.nodeId !== undefined) {
    params.nodeId = filters.nodeId;
  }

  return params;
}

/**
 * Compute the diff between original and modified user profile input.
 * Returns only fields that differ.
 */
export function computeProfileDiff(
  original: UserProfileInput,
  modified: UserProfileInput,
): Partial<UserProfileInput> {
  const diff: Partial<UserProfileInput> = {};

  if (original.name !== modified.name) {
    diff.name = modified.name;
  }
  if (original.evType !== modified.evType) {
    diff.evType = modified.evType;
  }
  if (original.brand !== modified.brand) {
    diff.brand = modified.brand;
  }
  if (original.batteryCapacity !== modified.batteryCapacity) {
    diff.batteryCapacity = modified.batteryCapacity;
  }
  if (original.batteryType !== modified.batteryType) {
    diff.batteryType = modified.batteryType;
  }
  if (original.chargerType !== modified.chargerType) {
    diff.chargerType = modified.chargerType;
  }
  if (original.chargerPowerRating !== modified.chargerPowerRating) {
    diff.chargerPowerRating = modified.chargerPowerRating;
  }
  if (JSON.stringify(original.rfidUids) !== JSON.stringify(modified.rfidUids)) {
    diff.rfidUids = modified.rfidUids;
  }

  return diff;
}

/**
 * Sort sessions descending by startTimestamp (newest first).
 */
export function sortSessionsByStartTime(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => b.startTimestamp - a.startTimestamp);
}
