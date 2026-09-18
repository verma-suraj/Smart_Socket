/**
 * ScanModeManager — manages the global RFID scan mode state.
 *
 * Only one client can be in scan mode at a time (global lock).
 * When active, incoming RFID events are intercepted and routed to the
 * requesting client instead of flowing through normal authentication.
 *
 * Scan mode auto-exits on:
 * - RFID event consumed (result delivered)
 * - 30-second timeout
 * - Manual cancel via exitScanMode()
 */

export interface ScanModeState {
  active: boolean;
  requesterId: string | null;   // WebSocket client identifier
  enteredAt: number | null;     // Timestamp for timeout calculation
  timeoutHandle: NodeJS.Timeout | null;
}

export interface ScanResult {
  rfidUid: string;
  nodeId: string;
}

export class ScanModeManager {
  private state: ScanModeState;
  private readonly TIMEOUT_MS = 30_000;
  private onTimeout: ((requesterId: string) => void) | null = null;

  constructor() {
    this.state = {
      active: false,
      requesterId: null,
      enteredAt: null,
      timeoutHandle: null,
    };
  }

  /**
   * Register a callback invoked when scan mode times out.
   * The callback receives the requesterId that timed out.
   */
  setOnTimeout(callback: (requesterId: string) => void): void {
    this.onTimeout = callback;
  }

  /**
   * Enter scan mode for the given client.
   * Returns false if scan mode is already active (global lock).
   */
  enterScanMode(requesterId: string): boolean {
    if (this.state.active) {
      return false;
    }

    this.state = {
      active: true,
      requesterId,
      enteredAt: Date.now(),
      timeoutHandle: setTimeout(() => {
        this.handleTimeout();
      }, this.TIMEOUT_MS),
    };

    return true;
  }

  /**
   * Exit scan mode (cancel, timeout, or result delivered).
   * Clears all state and cancels the timeout timer.
   */
  exitScanMode(): void {
    if (this.state.timeoutHandle !== null) {
      clearTimeout(this.state.timeoutHandle);
    }

    this.state = {
      active: false,
      requesterId: null,
      enteredAt: null,
      timeoutHandle: null,
    };
  }

  /**
   * Check if scan mode is currently active.
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Get the current requester ID (null if scan mode is not active).
   */
  getRequesterId(): string | null {
    return this.state.requesterId;
  }

  /**
   * Handle an incoming RFID event.
   * If scan mode is active, consumes the event and auto-exits scan mode.
   * Returns the ScanResult if consumed, null otherwise (event passes through to normal auth).
   */
  consumeRfidEvent(rfidUid: string, nodeId: string): ScanResult | null {
    if (!this.state.active) {
      return null;
    }

    const result: ScanResult = { rfidUid, nodeId };

    // Auto-exit scan mode after consuming the event
    this.exitScanMode();

    return result;
  }

  /**
   * Handle the 30-second timeout.
   * Notifies the requester via the onTimeout callback and exits scan mode.
   */
  private handleTimeout(): void {
    const requesterId = this.state.requesterId;

    // Clear the timeout handle reference before exiting (it already fired)
    this.state.timeoutHandle = null;
    this.exitScanMode();

    if (requesterId && this.onTimeout) {
      this.onTimeout(requesterId);
    }
  }
}
