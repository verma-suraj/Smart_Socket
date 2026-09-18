import { useState, useCallback, useEffect, useRef } from 'react';
import { webSocketService } from '../services/websocket.service';

/**
 * Scan mode state machine:
 * - idle: No scan in progress, ready to start
 * - scanning: Scan mode active, waiting for RFID tap
 * - timeout: Scan timed out (30s defense-in-depth)
 * - error: An error occurred (e.g., another scan in progress, connection lost)
 */
export type ScanStatus = 'idle' | 'scanning' | 'timeout' | 'error';

export interface UseRfidScanReturn {
  status: ScanStatus;
  startScan: () => void;
  cancelScan: () => void;
  lastError: string | null;
}

/** Scan-related message types received from the server */
const SCAN_MESSAGE_TYPES = [
  'scan_mode_entered',
  'rfid_scanned',
  'scan_mode_timeout',
  'scan_in_progress',
] as const;

type ScanMessageType = (typeof SCAN_MESSAGE_TYPES)[number];

/** Frontend timeout duration (30s defense-in-depth, matches backend) */
const FRONTEND_TIMEOUT_MS = 30_000;

/**
 * Custom hook that encapsulates the RFID scan mode WebSocket messaging and state machine.
 *
 * Sends `enter_scan_mode` and `cancel_scan_mode` messages to the backend.
 * Listens for `scan_mode_entered`, `rfid_scanned`, `scan_mode_timeout`, and `scan_in_progress`.
 * Handles WebSocket disconnect during scan and implements a 30s frontend timeout as defense-in-depth.
 *
 * Validates: Requirements 1.1, 1.3, 1.4, 1.5, 1.9
 */
export function useRfidScan(
  onUidCaptured: (uid: string, nodeId: string) => void,
): UseRfidScanReturn {
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs to keep current values accessible in callbacks without stale closures
  const statusRef = useRef<ScanStatus>(status);
  const onUidCapturedRef = useRef(onUidCaptured);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync refs with state
  statusRef.current = status;
  onUidCapturedRef.current = onUidCaptured;

  /** Clear the frontend timeout timer */
  const clearFrontendTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /** Start the 30s frontend timeout as defense-in-depth */
  const startFrontendTimeout = useCallback(() => {
    clearFrontendTimeout();
    timeoutRef.current = setTimeout(() => {
      if (statusRef.current === 'scanning') {
        setStatus('timeout');
        setLastError('Scan timed out. Please try again.');
      }
    }, FRONTEND_TIMEOUT_MS);
  }, [clearFrontendTimeout]);

  /**
   * Start RFID scan mode.
   * Sends `enter_scan_mode` to the backend and transitions to `scanning` state.
   */
  const startScan = useCallback(() => {
    if (statusRef.current === 'scanning') {
      return; // Already scanning
    }

    const sent = webSocketService.send({ type: 'enter_scan_mode' });
    if (!sent) {
      setStatus('error');
      setLastError('WebSocket not connected. Cannot start scan.');
      return;
    }

    setStatus('scanning');
    setLastError(null);
    startFrontendTimeout();
  }, [startFrontendTimeout]);

  /**
   * Cancel an active RFID scan.
   * Sends `cancel_scan_mode` to the backend and transitions to `idle` state.
   */
  const cancelScan = useCallback(() => {
    if (statusRef.current !== 'scanning') {
      return; // Nothing to cancel
    }

    webSocketService.send({ type: 'cancel_scan_mode' });
    clearFrontendTimeout();
    setStatus('idle');
    setLastError(null);
  }, [clearFrontendTimeout]);

  // Set up WebSocket message listener and disconnect handler
  useEffect(() => {
    /** Handle incoming scan-related messages */
    function handleRawMessage(message: Record<string, unknown>): void {
      const type = message.type as string;

      if (!SCAN_MESSAGE_TYPES.includes(type as ScanMessageType)) {
        return; // Not a scan message, ignore
      }

      switch (type) {
        case 'scan_mode_entered': {
          // Backend confirmed scan mode is active — already in scanning state
          // No state change needed (we optimistically set it in startScan)
          break;
        }

        case 'rfid_scanned': {
          if (statusRef.current !== 'scanning') {
            return; // Unexpected message — ignore
          }
          const uid = message.rfidUid as string;
          const nodeId = message.nodeId as string;

          clearFrontendTimeout();
          setStatus('idle');
          setLastError(null);
          onUidCapturedRef.current(uid, nodeId);
          break;
        }

        case 'scan_mode_timeout': {
          if (statusRef.current !== 'scanning') {
            return; // Already handled by frontend timeout or not scanning
          }
          clearFrontendTimeout();
          setStatus('timeout');
          setLastError('Scan timed out. Please try again.');
          break;
        }

        case 'scan_in_progress': {
          const error = (message.error as string) || 'Another scan is already in progress.';
          clearFrontendTimeout();
          setStatus('error');
          setLastError(error);
          break;
        }
      }
    }

    /** Handle WebSocket disconnect during scan */
    function handleDisconnect(): void {
      if (statusRef.current === 'scanning') {
        clearFrontendTimeout();
        setStatus('idle');
        setLastError('Scan interrupted: WebSocket connection lost.');
      }
    }

    webSocketService.onRawMessage(handleRawMessage);
    webSocketService.onDisconnect(handleDisconnect);

    return () => {
      webSocketService.offRawMessage(handleRawMessage);
      webSocketService.offDisconnect(handleDisconnect);
      clearFrontendTimeout();
    };
  }, [clearFrontendTimeout]);

  return { status, startScan, cancelScan, lastError };
}
