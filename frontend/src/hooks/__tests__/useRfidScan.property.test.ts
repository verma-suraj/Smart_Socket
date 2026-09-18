/**
 * Property 6: Scan State Machine Transitions
 *
 * For any scan state 'scanning':
 * - Receiving `rfid_scanned` must transition to 'idle' with captured UID
 * - Invoking `cancelScan()` must transition to 'idle' with no UID
 *
 * **Validates: Requirements 1.3, 1.5**
 *
 * Tag: Feature: rfid-tap-and-user-management, Property 6: Scan State Machine Transitions
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as fc from 'fast-check';
import { useRfidScan } from '../useRfidScan';

// Capture registered handlers so we can trigger them in tests
let rawMessageHandler: ((message: Record<string, unknown>) => void) | null = null;
let disconnectHandler: (() => void) | null = null;

vi.mock('../../services/websocket.service', () => ({
  webSocketService: {
    send: vi.fn(() => true),
    onRawMessage: vi.fn((handler: (message: Record<string, unknown>) => void) => {
      rawMessageHandler = handler;
    }),
    offRawMessage: vi.fn(() => {
      rawMessageHandler = null;
    }),
    onDisconnect: vi.fn((handler: () => void) => {
      disconnectHandler = handler;
    }),
    offDisconnect: vi.fn(() => {
      disconnectHandler = null;
    }),
  },
}));

// Arbitrary: generates valid RFID UIDs (hex strings 8-20 chars)
const rfidUidArb = fc.stringMatching(/^[0-9a-fA-F]{8,20}$/);

// Arbitrary: generates valid node IDs (alphanumeric strings 4-16 chars)
const nodeIdArb = fc.stringMatching(/^[a-zA-Z0-9_-]{4,16}$/);

describe('Property 6: Scan State Machine Transitions', { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    rawMessageHandler = null;
    disconnectHandler = null;
  });

  it(
    'receiving rfid_scanned while scanning must transition to idle with captured UID',
    () => {
      fc.assert(
        fc.property(rfidUidArb, nodeIdArb, (uid, nodeId) => {
          // Reset mocks for each iteration
          rawMessageHandler = null;
          disconnectHandler = null;

          const onUidCaptured = vi.fn();

          const { result, unmount } = renderHook(() => useRfidScan(onUidCaptured));

          // Start scan — transitions to 'scanning'
          act(() => {
            result.current.startScan();
          });
          expect(result.current.status).toBe('scanning');

          // Simulate receiving rfid_scanned message
          act(() => {
            rawMessageHandler!({
              type: 'rfid_scanned',
              rfidUid: uid,
              nodeId: nodeId,
            });
          });

          // Must transition to 'idle'
          expect(result.current.status).toBe('idle');

          // Must have called onUidCaptured with the correct UID and nodeId
          expect(onUidCaptured).toHaveBeenCalledWith(uid, nodeId);

          unmount();
        }),
        { numRuns: 100 },
      );
    },
  );

  it(
    'invoking cancelScan while scanning must transition to idle with no UID captured',
    () => {
      fc.assert(
        fc.property(rfidUidArb, nodeIdArb, (uid, nodeId) => {
          // uid and nodeId are generated but should NOT be captured
          rawMessageHandler = null;
          disconnectHandler = null;

          const onUidCaptured = vi.fn();

          const { result, unmount } = renderHook(() => useRfidScan(onUidCaptured));

          // Start scan — transitions to 'scanning'
          act(() => {
            result.current.startScan();
          });
          expect(result.current.status).toBe('scanning');

          // Invoke cancelScan
          act(() => {
            result.current.cancelScan();
          });

          // Must transition to 'idle'
          expect(result.current.status).toBe('idle');

          // Must NOT have called onUidCaptured
          expect(onUidCaptured).not.toHaveBeenCalled();

          unmount();
        }),
        { numRuns: 100 },
      );
    },
  );
});
