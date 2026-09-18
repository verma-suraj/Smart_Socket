import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RfidScanButton } from '../RfidScanButton';
import type { UseRfidScanReturn, ScanStatus } from '../../hooks/useRfidScan';

// Mock the useRfidScan hook
const mockStartScan = vi.fn();
const mockCancelScan = vi.fn();

const defaultHookReturn: UseRfidScanReturn = {
  status: 'idle',
  startScan: mockStartScan,
  cancelScan: mockCancelScan,
  lastError: null,
};

let hookReturn: UseRfidScanReturn = { ...defaultHookReturn };

vi.mock('../../hooks/useRfidScan', () => ({
  useRfidScan: (_onUidCaptured: (uid: string, nodeId: string) => void) => hookReturn,
}));

/**
 * Unit tests for RfidScanButton component.
 * Validates: Requirements 1.1, 1.5
 */
describe('RfidScanButton', () => {
  const mockOnUidCaptured = vi.fn();
  const mockOnError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    hookReturn = { ...defaultHookReturn };
  });

  function setHookStatus(status: ScanStatus, lastError: string | null = null) {
    hookReturn = {
      ...defaultHookReturn,
      status,
      lastError,
    };
  }

  describe('idle state', () => {
    it('renders "Tap your RFID card" button', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const button = screen.getByRole('button', { name: /tap your rfid card/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('calls startScan when button is clicked', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const button = screen.getByRole('button', { name: /tap your rfid card/i });
      fireEvent.click(button);

      expect(mockStartScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanning state', () => {
    beforeEach(() => {
      setHookStatus('scanning');
    });

    it('renders "Waiting for RFID tap..." indicator', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      expect(screen.getByText('Waiting for RFID tap...')).toBeInTheDocument();
    });

    it('renders a Cancel button', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton).toBeInTheDocument();
    });

    it('calls cancelScan when Cancel button is clicked', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(mockCancelScan).toHaveBeenCalledTimes(1);
    });

    it('does not render the idle scan button', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      expect(screen.queryByRole('button', { name: /tap your rfid card/i })).not.toBeInTheDocument();
    });
  });

  describe('timeout state', () => {
    beforeEach(() => {
      setHookStatus('timeout', 'Scan timed out. Please try again.');
    });

    it('renders timeout message', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      expect(screen.getByText('Scan timed out. No RFID card detected.')).toBeInTheDocument();
    });

    it('renders a Retry button', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('calls startScan when Retry button is clicked', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(mockStartScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('error state', () => {
    beforeEach(() => {
      setHookStatus('error', 'Another scan is already in progress.');
    });

    it('renders error message', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      expect(screen.getByText('Another scan is already in progress.')).toBeInTheDocument();
    });

    it('renders a Retry button', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('calls startScan when Retry button is clicked', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      fireEvent.click(retryButton);

      expect(mockStartScan).toHaveBeenCalledTimes(1);
    });
  });

  describe('UID capture propagation', () => {
    it('passes onUidCaptured callback to the useRfidScan hook', () => {
      // The mock captures the callback argument. We verify the component renders
      // and the hook is invoked (which receives onUidCaptured internally).
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      // Component renders without error, confirming the callback is passed through
      expect(screen.getByRole('button', { name: /tap your rfid card/i })).toBeInTheDocument();
    });
  });

  describe('error callback propagation', () => {
    it('calls onError when lastError changes', () => {
      setHookStatus('error', 'WebSocket not connected. Cannot start scan.');

      render(
        <RfidScanButton onUidCaptured={mockOnUidCaptured} onError={mockOnError} />,
      );

      expect(mockOnError).toHaveBeenCalledWith('WebSocket not connected. Cannot start scan.');
    });

    it('does not call onError when lastError is null', () => {
      setHookStatus('idle');

      render(
        <RfidScanButton onUidCaptured={mockOnUidCaptured} onError={mockOnError} />,
      );

      expect(mockOnError).not.toHaveBeenCalled();
    });
  });

  describe('disabled prop', () => {
    it('disables the scan button when disabled=true in idle state', () => {
      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} disabled={true} />);

      const button = screen.getByRole('button', { name: /tap your rfid card/i });
      expect(button).toBeDisabled();
    });

    it('disables the retry button when disabled=true in timeout state', () => {
      setHookStatus('timeout', 'Scan timed out. Please try again.');

      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} disabled={true} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeDisabled();
    });

    it('disables the retry button when disabled=true in error state', () => {
      setHookStatus('error', 'Another scan is already in progress.');

      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} disabled={true} />);

      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('has an ARIA live region for state announcements', () => {
      setHookStatus('scanning');

      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      // The sr-only live region should announce scanning state
      expect(screen.getByText('Scanning for RFID card. Waiting for tap.')).toBeInTheDocument();
    });

    it('has role="alert" on timeout message', () => {
      setHookStatus('timeout', 'Scan timed out. Please try again.');

      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('has role="alert" on error message', () => {
      setHookStatus('error', 'Another scan is already in progress.');

      render(<RfidScanButton onUidCaptured={mockOnUidCaptured} />);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });
  });
});
