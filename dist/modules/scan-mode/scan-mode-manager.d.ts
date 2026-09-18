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
    requesterId: string | null;
    enteredAt: number | null;
    timeoutHandle: NodeJS.Timeout | null;
}
export interface ScanResult {
    rfidUid: string;
    nodeId: string;
}
export declare class ScanModeManager {
    private state;
    private readonly TIMEOUT_MS;
    private onTimeout;
    constructor();
    /**
     * Register a callback invoked when scan mode times out.
     * The callback receives the requesterId that timed out.
     */
    setOnTimeout(callback: (requesterId: string) => void): void;
    /**
     * Enter scan mode for the given client.
     * Returns false if scan mode is already active (global lock).
     */
    enterScanMode(requesterId: string): boolean;
    /**
     * Exit scan mode (cancel, timeout, or result delivered).
     * Clears all state and cancels the timeout timer.
     */
    exitScanMode(): void;
    /**
     * Check if scan mode is currently active.
     */
    isActive(): boolean;
    /**
     * Get the current requester ID (null if scan mode is not active).
     */
    getRequesterId(): string | null;
    /**
     * Handle an incoming RFID event.
     * If scan mode is active, consumes the event and auto-exits scan mode.
     * Returns the ScanResult if consumed, null otherwise (event passes through to normal auth).
     */
    consumeRfidEvent(rfidUid: string, nodeId: string): ScanResult | null;
    /**
     * Handle the 30-second timeout.
     * Notifies the requester via the onTimeout callback and exits scan mode.
     */
    private handleTimeout;
}
//# sourceMappingURL=scan-mode-manager.d.ts.map