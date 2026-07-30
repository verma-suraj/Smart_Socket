import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelemetryPanel } from '../../src/components/TelemetryPanel';
import type { TelemetryPayload } from '../../src/types';
import { useTelemetryStore } from '../../src/stores/telemetry.store';

function createTelemetry(overrides: Partial<TelemetryPayload> = {}): TelemetryPayload {
  return {
    voltage: 230.5,
    current: 12.34,
    power: 2845.7,
    frequency: 50.1,
    powerFactor: 0.98,
    temperature: 35.2,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('TelemetryPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset telemetry store state
    useTelemetryStore.setState({
      telemetryByNode: new Map(),
      lastUpdateByNode: new Map(),
      totalLoad: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Requirement 4.3: Correct decimal precision for telemetry values
  describe('telemetry value formatting precision', () => {
    it('formats voltage to 1 decimal place', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ voltage: 230.567 })} />);
      expect(screen.getByText('230.6')).toBeInTheDocument();
    });

    it('formats current to 2 decimal places', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ current: 12.3 })} />);
      expect(screen.getByText('12.30')).toBeInTheDocument();
    });

    it('formats power to 1 decimal place', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ power: 2845.78 })} />);
      expect(screen.getByText('2845.8')).toBeInTheDocument();
    });

    it('formats frequency to 1 decimal place', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ frequency: 50.123 })} />);
      expect(screen.getByText('50.1')).toBeInTheDocument();
    });

    it('formats power factor to 2 decimal places', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ powerFactor: 0.9 })} />);
      expect(screen.getByText('0.90')).toBeInTheDocument();
    });

    it('formats temperature to 1 decimal place', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 36.78 })} />);
      expect(screen.getByText('36.8')).toBeInTheDocument();
    });
  });

  // Requirements 4.4, 4.5: Temperature color states
  describe('temperature color states', () => {
    it('shows normal styling when temperature ≤ 38°C', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 35.0 })} />);
      const tempValue = screen.getByText('35.0');
      expect(tempValue).toHaveClass('text-gray-900');
      expect(screen.queryByText('Temperature Override Active')).not.toBeInTheDocument();
    });

    it('shows normal styling at exactly 38°C (boundary)', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 38.0 })} />);
      const tempValue = screen.getByText('38.0');
      expect(tempValue).toHaveClass('text-gray-900');
    });

    it('shows warning styling when temperature > 38°C and ≤ 40°C', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 39.5 })} />);
      const tempValue = screen.getByText('39.5');
      expect(tempValue).toHaveClass('text-amber-600');
      expect(screen.queryByText('Temperature Override Active')).not.toBeInTheDocument();
    });

    it('shows warning styling at exactly 40°C (boundary)', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 40.0 })} />);
      const tempValue = screen.getByText('40.0');
      expect(tempValue).toHaveClass('text-amber-600');
    });

    it('shows critical styling when temperature > 40°C', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 42.3 })} />);
      const tempValue = screen.getByText('42.3');
      expect(tempValue).toHaveClass('text-red-600');
    });

    it('displays "Temperature Override Active" label when temperature > 40°C', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 41.0 })} />);
      expect(screen.getByText('Temperature Override Active')).toBeInTheDocument();
    });

    it('does NOT display "Temperature Override Active" label when temperature ≤ 40°C', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ temperature: 40.0 })} />);
      expect(screen.queryByText('Temperature Override Active')).not.toBeInTheDocument();
    });
  });

  // Requirement 4.8: Staleness indicator (30s timeout)
  describe('staleness indicator', () => {
    it('does NOT show stale indicator when data is recent', () => {
      const now = Date.now();
      useTelemetryStore.setState({
        lastUpdateByNode: new Map([['node-1', now]]),
      });

      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry({ timestamp: now })} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows stale indicator when no update received for > 30 seconds', () => {
      const thirtyOneSecondsAgo = Date.now() - 31000;
      useTelemetryStore.setState({
        lastUpdateByNode: new Map([['node-1', thirtyOneSecondsAgo]]),
      });

      render(
        <TelemetryPanel
          nodeId="node-1"
          telemetry={createTelemetry({ timestamp: thirtyOneSecondsAgo })}
        />
      );

      // Advance timer to trigger initial elapsed calculation
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const staleAlert = screen.getByRole('alert');
      expect(staleAlert).toBeInTheDocument();
      expect(staleAlert.textContent).toContain('Data may be stale');
    });

    it('shows elapsed seconds in staleness message', () => {
      const fortySecondsAgo = Date.now() - 40000;
      useTelemetryStore.setState({
        lastUpdateByNode: new Map([['node-1', fortySecondsAgo]]),
      });

      render(
        <TelemetryPanel
          nodeId="node-1"
          telemetry={createTelemetry({ timestamp: fortySecondsAgo })}
        />
      );

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      const staleAlert = screen.getByRole('alert');
      expect(staleAlert.textContent).toMatch(/\d+s ago/);
    });

    it('does NOT show stale indicator at exactly 30 seconds', () => {
      const exactlyThirtySecondsAgo = Date.now() - 30000;
      useTelemetryStore.setState({
        lastUpdateByNode: new Map([['node-1', exactlyThirtySecondsAgo]]),
      });

      render(
        <TelemetryPanel
          nodeId="node-1"
          telemetry={createTelemetry({ timestamp: exactlyThirtySecondsAgo })}
        />
      );

      // At exactly 30s, elapsed === 30000, isStale should be false (> 30000, not >=)
      // Don't advance time - check initial state
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  // Unit labels
  describe('displays unit labels', () => {
    it('shows all expected unit labels', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry()} />);
      expect(screen.getByText('V')).toBeInTheDocument();
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('W')).toBeInTheDocument();
      expect(screen.getByText('Hz')).toBeInTheDocument();
      expect(screen.getByText('°C')).toBeInTheDocument();
    });

    it('shows field labels', () => {
      render(<TelemetryPanel nodeId="node-1" telemetry={createTelemetry()} />);
      expect(screen.getByText('Voltage')).toBeInTheDocument();
      expect(screen.getByText('Current')).toBeInTheDocument();
      expect(screen.getByText('Power')).toBeInTheDocument();
      expect(screen.getByText('Frequency')).toBeInTheDocument();
      expect(screen.getByText('Power Factor')).toBeInTheDocument();
      expect(screen.getByText('Temperature')).toBeInTheDocument();
    });
  });
});
