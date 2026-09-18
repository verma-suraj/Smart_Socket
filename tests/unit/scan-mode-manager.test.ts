import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScanModeManager } from '../../src/modules/scan-mode/index.js';

describe('ScanModeManager', () => {
  let manager: ScanModeManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new ScanModeManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('enterScanMode', () => {
    it('should activate scan mode and return true when idle', () => {
      const result = manager.enterScanMode('client-1');

      expect(result).toBe(true);
      expect(manager.isActive()).toBe(true);
      expect(manager.getRequesterId()).toBe('client-1');
    });

    it('should return false when scan mode is already active (global lock)', () => {
      manager.enterScanMode('client-1');

      const result = manager.enterScanMode('client-2');

      expect(result).toBe(false);
      expect(manager.getRequesterId()).toBe('client-1');
    });

    it('should return false when the same client tries to enter twice', () => {
      manager.enterScanMode('client-1');

      const result = manager.enterScanMode('client-1');

      expect(result).toBe(false);
    });
  });

  describe('exitScanMode', () => {
    it('should deactivate scan mode and clear state', () => {
      manager.enterScanMode('client-1');

      manager.exitScanMode();

      expect(manager.isActive()).toBe(false);
      expect(manager.getRequesterId()).toBeNull();
    });

    it('should be safe to call when scan mode is not active', () => {
      expect(() => manager.exitScanMode()).not.toThrow();
      expect(manager.isActive()).toBe(false);
    });

    it('should cancel the timeout timer', () => {
      manager.enterScanMode('client-1');
      manager.exitScanMode();

      // Advance time past timeout — should not trigger anything
      const timeoutCb = vi.fn();
      manager.setOnTimeout(timeoutCb);
      vi.advanceTimersByTime(35_000);

      expect(timeoutCb).not.toHaveBeenCalled();
    });
  });

  describe('isActive', () => {
    it('should return false when not in scan mode', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('should return true when in scan mode', () => {
      manager.enterScanMode('client-1');
      expect(manager.isActive()).toBe(true);
    });
  });

  describe('getRequesterId', () => {
    it('should return null when not in scan mode', () => {
      expect(manager.getRequesterId()).toBeNull();
    });

    it('should return the requester ID when in scan mode', () => {
      manager.enterScanMode('client-abc');
      expect(manager.getRequesterId()).toBe('client-abc');
    });
  });

  describe('consumeRfidEvent', () => {
    it('should return ScanResult when scan mode is active', () => {
      manager.enterScanMode('client-1');

      const result = manager.consumeRfidEvent('A1B2C3D4', 'node-5');

      expect(result).toEqual({ rfidUid: 'A1B2C3D4', nodeId: 'node-5' });
    });

    it('should auto-exit scan mode after consuming an event', () => {
      manager.enterScanMode('client-1');

      manager.consumeRfidEvent('A1B2C3D4', 'node-5');

      expect(manager.isActive()).toBe(false);
      expect(manager.getRequesterId()).toBeNull();
    });

    it('should return null when scan mode is not active', () => {
      const result = manager.consumeRfidEvent('A1B2C3D4', 'node-5');

      expect(result).toBeNull();
    });

    it('should return null after scan mode has been exited', () => {
      manager.enterScanMode('client-1');
      manager.exitScanMode();

      const result = manager.consumeRfidEvent('A1B2C3D4', 'node-5');

      expect(result).toBeNull();
    });

    it('should return null on second call after auto-exit', () => {
      manager.enterScanMode('client-1');
      manager.consumeRfidEvent('UID1', 'node-1');

      const result = manager.consumeRfidEvent('UID2', 'node-2');

      expect(result).toBeNull();
    });
  });

  describe('timeout', () => {
    it('should auto-exit scan mode after 30 seconds', () => {
      manager.enterScanMode('client-1');

      vi.advanceTimersByTime(30_000);

      expect(manager.isActive()).toBe(false);
      expect(manager.getRequesterId()).toBeNull();
    });

    it('should invoke onTimeout callback with the requester ID', () => {
      const timeoutCb = vi.fn();
      manager.setOnTimeout(timeoutCb);
      manager.enterScanMode('client-timeout');

      vi.advanceTimersByTime(30_000);

      expect(timeoutCb).toHaveBeenCalledWith('client-timeout');
      expect(timeoutCb).toHaveBeenCalledTimes(1);
    });

    it('should not invoke onTimeout if scan mode exits before timeout', () => {
      const timeoutCb = vi.fn();
      manager.setOnTimeout(timeoutCb);
      manager.enterScanMode('client-1');

      manager.exitScanMode();
      vi.advanceTimersByTime(30_000);

      expect(timeoutCb).not.toHaveBeenCalled();
    });

    it('should not invoke onTimeout if RFID event is consumed before timeout', () => {
      const timeoutCb = vi.fn();
      manager.setOnTimeout(timeoutCb);
      manager.enterScanMode('client-1');

      manager.consumeRfidEvent('UID', 'node-1');
      vi.advanceTimersByTime(30_000);

      expect(timeoutCb).not.toHaveBeenCalled();
    });

    it('should allow re-entering scan mode after timeout', () => {
      manager.enterScanMode('client-1');
      vi.advanceTimersByTime(30_000);

      const result = manager.enterScanMode('client-2');

      expect(result).toBe(true);
      expect(manager.getRequesterId()).toBe('client-2');
    });
  });

  describe('re-entry after exit', () => {
    it('should allow a new client to enter after manual exit', () => {
      manager.enterScanMode('client-1');
      manager.exitScanMode();

      const result = manager.enterScanMode('client-2');

      expect(result).toBe(true);
      expect(manager.getRequesterId()).toBe('client-2');
    });

    it('should allow a new client to enter after RFID consumption', () => {
      manager.enterScanMode('client-1');
      manager.consumeRfidEvent('UID', 'node-1');

      const result = manager.enterScanMode('client-2');

      expect(result).toBe(true);
      expect(manager.getRequesterId()).toBe('client-2');
    });
  });
});
