import { useEffect, useRef } from 'react';
import { useRfidScan } from '../hooks/useRfidScan';

/**
 * RfidScanButton — Reusable component that initiates RFID scan mode via WebSocket.
 *
 * Render states:
 * - idle: Shows "Tap your RFID card" button
 * - scanning: Pulsing indicator + "Waiting for RFID tap..." + Cancel button
 * - timeout: Timeout message + Retry button
 * - error: Error message + Retry button
 *
 * Uses the `useRfidScan` hook internally to manage the scan lifecycle.
 * Accessible: ARIA live regions for state announcements, proper focus management.
 *
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.9
 */

export interface RfidScanButtonProps {
  /** Called when a UID is successfully captured via RFID tap */
  onUidCaptured: (uid: string, nodeId: string) => void;
  /** Called when an error occurs during scanning */
  onError?: (message: string) => void;
  /** Whether the button is disabled (e.g., max UIDs reached) */
  disabled?: boolean;
}

export function RfidScanButton({ onUidCaptured, onError, disabled = false }: RfidScanButtonProps) {
  const { status, startScan, cancelScan, lastError } = useRfidScan(onUidCaptured);

  // Ref for focus management — focus the primary action button on state change
  const actionButtonRef = useRef<HTMLButtonElement>(null);

  // Notify parent of errors
  useEffect(() => {
    if (lastError && onError) {
      onError(lastError);
    }
  }, [lastError, onError]);

  // Restore focus to the primary action button when returning to idle/timeout/error
  useEffect(() => {
    if (status !== 'scanning') {
      actionButtonRef.current?.focus();
    }
  }, [status]);

  return (
    <div className="flex flex-col items-start gap-2">
      {/* ARIA live region for screen reader announcements on state changes */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {status === 'scanning' && 'Scanning for RFID card. Waiting for tap.'}
        {status === 'timeout' && 'RFID scan timed out. You can retry.'}
        {status === 'error' && `RFID scan error: ${lastError}`}
      </div>

      {status === 'idle' && (
        <button
          ref={actionButtonRef}
          type="button"
          onClick={startScan}
          disabled={disabled}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Tap your RFID card to capture UID"
        >
          <RfidIcon />
          Tap your RFID card
        </button>
      )}

      {status === 'scanning' && (
        <div className="flex flex-col gap-2" role="status" aria-label="Scanning for RFID card">
          <div className="inline-flex items-center gap-3 px-4 py-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="inline-block w-3 h-3 bg-blue-500 rounded-full animate-pulse" aria-hidden="true" />
            <span>Waiting for RFID tap...</span>
          </div>
          <button
            type="button"
            onClick={cancelScan}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-colors"
            aria-label="Cancel RFID scan"
          >
            Cancel
          </button>
        </div>
      )}

      {status === 'timeout' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-amber-700" role="alert">
            Scan timed out. No RFID card detected.
          </p>
          <button
            ref={actionButtonRef}
            type="button"
            onClick={startScan}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Retry RFID card scan"
          >
            <RfidIcon />
            Retry
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-red-700" role="alert">
            {lastError || 'An error occurred during scanning.'}
          </p>
          <button
            ref={actionButtonRef}
            type="button"
            onClick={startScan}
            disabled={disabled}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Retry RFID card scan"
          >
            <RfidIcon />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

/** Simple RFID/NFC card icon */
function RfidIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 7v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
      <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
      <path d="M9.5 9.5a4.25 4.25 0 0 1 5 0" />
      <path d="M7.5 7.5a7.25 7.25 0 0 1 9 0" />
    </svg>
  );
}
