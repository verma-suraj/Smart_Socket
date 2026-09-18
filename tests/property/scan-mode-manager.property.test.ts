import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { ScanModeManager } from '../../src/modules/scan-mode/scan-mode-manager.js';
import type { ScanResult } from '../../src/modules/scan-mode/scan-mode-manager.js';

/**
 * Property-based tests for the ScanModeManager module.
 * Feature: rfid-tap-and-user-management
 */

describe('Feature: rfid-tap-and-user-management, Property 2: Scan Mode Intercepts RFID Events', () => {
  /**
   * **Validates: Requirements 1.2, 1.7, 4.2**
   *
   * For any RFID UID string and node ID, when `isActive()` is true,
   * calling `consumeRfidEvent(rfidUid, nodeId)` MUST return a non-null
   * `ScanResult` with `rfidUid` and `nodeId` matching the inputs.
   */
  let manager: ScanModeManager;

  beforeEach(() => {
    manager = new ScanModeManager();
  });

  it('consumeRfidEvent returns non-null ScanResult matching inputs when scan mode is active', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),  // requesterId
        fc.hexaString({ minLength: 4, maxLength: 16 }), // rfidUid (hex string like real RFID UIDs)
        fc.string({ minLength: 1, maxLength: 30 }),  // nodeId
        (requesterId, rfidUid, nodeId) => {
          // Arrange: enter scan mode so isActive() is true
          manager = new ScanModeManager();
          const entered = manager.enterScanMode(requesterId);
          expect(entered).toBe(true);
          expect(manager.isActive()).toBe(true);

          // Act: consume an RFID event
          const result: ScanResult | null = manager.consumeRfidEvent(rfidUid, nodeId);

          // Assert: result must be non-null and match inputs
          expect(result).not.toBeNull();
          expect(result!.rfidUid).toBe(rfidUid);
          expect(result!.nodeId).toBe(nodeId);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: rfid-tap-and-user-management, Property 3: Scan Mode Auto-Exits on Result Delivery', () => {
  /**
   * **Validates: Requirements 4.3**
   *
   * For any RFID UID consumed during active scan mode (i.e., consumeRfidEvent
   * returns non-null), immediately after that call, isActive() MUST return false.
   */
  let manager: ScanModeManager;

  beforeEach(() => {
    manager = new ScanModeManager();
  });

  it('after consumeRfidEvent returns non-null, isActive() must return false', () => {
    fc.assert(
      fc.property(
        // Generate a requester ID (non-empty string)
        fc.string({ minLength: 1, maxLength: 50 }),
        // Generate an RFID UID (non-empty hex-like string)
        fc.hexaString({ minLength: 1, maxLength: 16 }),
        // Generate a node ID (non-empty string)
        fc.string({ minLength: 1, maxLength: 30 }),
        (requesterId, rfidUid, nodeId) => {
          // Enter scan mode
          const entered = manager.enterScanMode(requesterId);
          expect(entered).toBe(true);
          expect(manager.isActive()).toBe(true);

          // Consume an RFID event — should return non-null
          const result = manager.consumeRfidEvent(rfidUid, nodeId);
          expect(result).not.toBeNull();

          // After consuming the event, scan mode MUST be inactive
          expect(manager.isActive()).toBe(false);

          // Also verify requester is cleared
          expect(manager.getRequesterId()).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe('Feature: rfid-tap-and-user-management, Property 4: Post-Exit RFID Events Pass Through', () => {
  /**
   * **Validates: Requirements 1.10, 4.6**
   *
   * For any RFID UID and node ID, after exitScanMode() has been called (or after
   * scan mode auto-exits from result delivery), calling consumeRfidEvent(rfidUid, nodeId)
   * MUST return null, indicating the event is not intercepted and flows to normal
   * authentication.
   */
  let manager: ScanModeManager;

  beforeEach(() => {
    manager = new ScanModeManager();
  });

  it('after explicit exitScanMode(), consumeRfidEvent must return null', () => {
    fc.assert(
      fc.property(
        // Requester ID used to enter scan mode
        fc.string({ minLength: 1, maxLength: 50 }),
        // RFID UID arriving after exit
        fc.hexaString({ minLength: 1, maxLength: 16 }),
        // Node ID arriving after exit
        fc.string({ minLength: 1, maxLength: 30 }),
        (requesterId, rfidUid, nodeId) => {
          // Enter scan mode then explicitly exit
          manager.enterScanMode(requesterId);
          manager.exitScanMode();

          // Scan mode is no longer active
          expect(manager.isActive()).toBe(false);

          // RFID event after exit must pass through (return null)
          const result = manager.consumeRfidEvent(rfidUid, nodeId);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('after auto-exit from consumeRfidEvent, subsequent consumeRfidEvent must return null', () => {
    fc.assert(
      fc.property(
        // Requester ID
        fc.string({ minLength: 1, maxLength: 50 }),
        // First RFID event that triggers auto-exit
        fc.hexaString({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        // Second RFID event arriving after auto-exit
        fc.hexaString({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 30 }),
        (requesterId, firstUid, firstNodeId, secondUid, secondNodeId) => {
          // Enter scan mode
          manager.enterScanMode(requesterId);

          // First event is consumed (triggers auto-exit)
          const firstResult = manager.consumeRfidEvent(firstUid, firstNodeId);
          expect(firstResult).not.toBeNull();

          // Scan mode should now be inactive
          expect(manager.isActive()).toBe(false);

          // Second event must pass through (return null)
          const secondResult = manager.consumeRfidEvent(secondUid, secondNodeId);
          expect(secondResult).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('consumeRfidEvent returns null when scan mode was never entered', () => {
    fc.assert(
      fc.property(
        // RFID UID
        fc.hexaString({ minLength: 1, maxLength: 16 }),
        // Node ID
        fc.string({ minLength: 1, maxLength: 30 }),
        (rfidUid, nodeId) => {
          // Never entered scan mode — events must always pass through
          const result = manager.consumeRfidEvent(rfidUid, nodeId);
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
