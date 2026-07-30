import { create } from 'zustand';
import type { Notification, SystemEvent } from '../types';

const MAX_NOTIFICATIONS = 5;
const MAX_EVENTS = 50;

export interface UIState {
  notifications: Notification[];
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  eventLog: SystemEvent[];
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
  addEvent: (event: Omit<SystemEvent, 'id'>) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const useUIStore = create<UIState>((set) => ({
  notifications: [],
  connectionStatus: 'disconnected',
  eventLog: [],

  addNotification: (notification) => {
    set((state) => {
      const newNotification: Notification = {
        ...notification,
        id: generateId(),
        timestamp: Date.now(),
      };

      // Consolidation: if a notification with same type AND same title exists, replace it
      const existingIndex = state.notifications.findIndex(
        (n) => n.type === newNotification.type && n.title === newNotification.title,
      );

      let updated: Notification[];
      if (existingIndex !== -1) {
        // Replace the existing one with the new one
        updated = [...state.notifications];
        updated[existingIndex] = newNotification;
      } else {
        updated = [...state.notifications, newNotification];
      }

      // FIFO eviction: if > MAX_NOTIFICATIONS, remove oldest (lowest timestamp)
      if (updated.length > MAX_NOTIFICATIONS) {
        const sorted = [...updated].sort((a, b) => a.timestamp - b.timestamp);
        // Remove the oldest entries to bring count to MAX_NOTIFICATIONS
        const toKeep = sorted.slice(updated.length - MAX_NOTIFICATIONS);
        updated = toKeep;
      }

      return { notifications: updated };
    });
  },

  dismissNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  setConnectionStatus: (status) => {
    set({ connectionStatus: status });
  },

  addEvent: (event) => {
    set((state) => {
      const newEvent: SystemEvent = {
        ...event,
        id: generateId(),
      };

      // Add to front (newest first)
      const updated = [newEvent, ...state.eventLog];

      // FIFO cap: max 50 events — keep newest 50
      if (updated.length > MAX_EVENTS) {
        return { eventLog: updated.slice(0, MAX_EVENTS) };
      }

      return { eventLog: updated };
    });
  },
}));
