import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SessionCard from '../../src/components/SessionCard';
import type { Session } from '../../src/types';

function createSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-001',
    userId: 'user-001',
    nodeId: 'node-001',
    sessionType: 'owner',
    startTimestamp: Date.now() - 3661000, // ~1h 1m 1s ago
    endTimestamp: null,
    initialSOC: 20,
    batteryCapacity: 60,
    chargerPowerRating: 7.4,
    priorityScore: 85,
    totalEnergyConsumed: 4.56,
    totalTime: 3661,
    billAmount: null,
    endReason: null,
    active: true,
    guestSpecs: null,
    ...overrides,
  };
}

describe('SessionCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Requirement 6.5: Timer displays correct HH:MM:SS format
  describe('live timer format', () => {
    it('displays elapsed time in HH:MM:SS format', () => {
      // Set a fixed "now" so we can control elapsed time exactly
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // Session started exactly 1 hour, 30 minutes, 45 seconds ago
      const startTimestamp = now - (1 * 3600 + 30 * 60 + 45) * 1000;
      const session = createSession({ startTimestamp });

      render(<SessionCard session={session} nodeName="Charger A" userName="Alice" />);

      expect(screen.getByText('01:30:45')).toBeInTheDocument();
    });

    it('displays 00:00:00 when session just started', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      const session = createSession({ startTimestamp: now });

      render(<SessionCard session={session} nodeName="Charger A" userName="Alice" />);

      expect(screen.getByText('00:00:00')).toBeInTheDocument();
    });

    it('formats multi-hour durations correctly', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // 12 hours, 5 minutes, 9 seconds ago
      const startTimestamp = now - (12 * 3600 + 5 * 60 + 9) * 1000;
      const session = createSession({ startTimestamp });

      render(<SessionCard session={session} nodeName="Charger B" userName="Bob" />);

      expect(screen.getByText('12:05:09')).toBeInTheDocument();
    });

    it('does not display negative elapsed time', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // Session starts in the future (edge case)
      const startTimestamp = now + 5000;
      const session = createSession({ startTimestamp });

      render(<SessionCard session={session} nodeName="Charger A" userName="Alice" />);

      expect(screen.getByText('00:00:00')).toBeInTheDocument();
    });
  });

  // Requirement 6.5: Timer updates every 1 second
  describe('live timer updates', () => {
    it('updates the timer every 1 second', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // Session started exactly 10 seconds ago
      const startTimestamp = now - 10000;
      const session = createSession({ startTimestamp });

      render(<SessionCard session={session} nodeName="Charger A" userName="Alice" />);

      // Initial: 10 seconds elapsed
      expect(screen.getByText('00:00:10')).toBeInTheDocument();

      // Advance 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('00:00:11')).toBeInTheDocument();

      // Advance another second
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('00:00:12')).toBeInTheDocument();
    });

    it('timer rolls over minutes correctly', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // Session started 59 seconds ago
      const startTimestamp = now - 59000;
      const session = createSession({ startTimestamp });

      render(<SessionCard session={session} nodeName="Charger A" userName="Alice" />);

      expect(screen.getByText('00:00:59')).toBeInTheDocument();

      // Advance 1 second → should become 00:01:00
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('00:01:00')).toBeInTheDocument();
    });

    it('timer rolls over hours correctly', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // Session started 59 minutes and 59 seconds ago
      const startTimestamp = now - (59 * 60 + 59) * 1000;
      const session = createSession({ startTimestamp });

      render(<SessionCard session={session} nodeName="Charger A" userName="Alice" />);

      expect(screen.getByText('00:59:59')).toBeInTheDocument();

      // Advance 1 second → should become 01:00:00
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('01:00:00')).toBeInTheDocument();
    });
  });

  // Requirement 6.5: Timer calculates elapsed from startTimestamp correctly
  describe('elapsed calculation from startTimestamp', () => {
    it('calculates elapsed seconds from startTimestamp to current time', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      // Exactly 2 hours, 15 minutes, 30 seconds ago
      const elapsedMs = (2 * 3600 + 15 * 60 + 30) * 1000;
      const startTimestamp = now - elapsedMs;
      const session = createSession({ startTimestamp });

      render(<SessionCard session={session} nodeName="Charger C" userName="Charlie" />);

      expect(screen.getByText('02:15:30')).toBeInTheDocument();
    });

    it('recalculates when startTimestamp prop changes', () => {
      const now = new Date('2024-06-15T12:00:00Z').getTime();
      vi.setSystemTime(now);

      const startTimestamp1 = now - 60000; // 1 minute ago
      const session1 = createSession({ startTimestamp: startTimestamp1 });

      const { rerender } = render(
        <SessionCard session={session1} nodeName="Charger A" userName="Alice" />,
      );

      expect(screen.getByText('00:01:00')).toBeInTheDocument();

      // Rerender with a different startTimestamp (5 minutes ago)
      const startTimestamp2 = now - 300000;
      const session2 = createSession({ startTimestamp: startTimestamp2 });

      rerender(
        <SessionCard session={session2} nodeName="Charger A" userName="Alice" />,
      );

      expect(screen.getByText('00:05:00')).toBeInTheDocument();
    });
  });
});
