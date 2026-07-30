/**
 * Pure notification logic utilities for the Smart Socket Dashboard.
 */

import type { Notification } from '../types';

/**
 * Create a notification with appropriate auto-dismiss settings based on type.
 * - success: autoDismiss true, 5000ms
 * - warning: autoDismiss true, 10000ms
 * - error: autoDismiss false
 * - info: autoDismiss true, 5000ms
 */
export function createNotification(
  type: 'success' | 'warning' | 'error' | 'info',
  title: string,
  message: string,
): Notification {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const timestamp = Date.now();

  switch (type) {
    case 'success':
      return { id, type, title, message, timestamp, autoDismiss: true, autoDismissMs: 5000 };
    case 'warning':
      return { id, type, title, message, timestamp, autoDismiss: true, autoDismissMs: 10000 };
    case 'error':
      return { id, type, title, message, timestamp, autoDismiss: false };
    case 'info':
      return { id, type, title, message, timestamp, autoDismiss: true, autoDismissMs: 5000 };
  }
}

/**
 * Returns whether a notification should auto-dismiss.
 */
export function shouldAutoDismiss(notification: Notification): boolean {
  return notification.autoDismiss;
}

/**
 * Keep only the most recent `maxVisible` notifications (by timestamp, newest kept).
 */
export function evictOldest(notifications: Notification[], maxVisible: number): Notification[] {
  if (notifications.length <= maxVisible) {
    return notifications;
  }
  // Sort by timestamp descending and keep the newest maxVisible
  const sorted = [...notifications].sort((a, b) => b.timestamp - a.timestamp);
  return sorted.slice(0, maxVisible);
}

/**
 * Consolidate duplicate notifications: if multiple have same type AND same title,
 * keep only the most recent one per unique (type+title) combination.
 */
export function consolidateDuplicates(notifications: Notification[]): Notification[] {
  const seen = new Map<string, Notification>();

  for (const notification of notifications) {
    const key = `${notification.type}::${notification.title}`;
    const existing = seen.get(key);
    if (!existing || notification.timestamp > existing.timestamp) {
      seen.set(key, notification);
    }
  }

  return Array.from(seen.values());
}

/**
 * Compute exponential backoff delay for reconnection attempts.
 * Returns min(1000 * 2^(attempt-1), 30000) for attempt in [1, 10].
 */
export function computeBackoffDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 30000);
}
