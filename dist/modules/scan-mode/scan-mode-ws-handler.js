/**
 * Wires the ScanModeManager to WebSocket message handlers.
 *
 * Handles:
 * - `enter_scan_mode` messages — enters scan mode or rejects if already active
 * - `cancel_scan_mode` messages — exits scan mode (only by the requester)
 * - Client disconnect — auto-exits scan mode if the disconnecting client is the requester
 * - Timeout notification — sends `scan_mode_timeout` to the requester when the 30s timer fires
 *
 * Validates: Requirements 4.1, 4.4, 4.5, 4.6, 4.7
 */
export function wireScanModeWebSocket(scanModeManager, wsServer) {
    // Set up the timeout callback to notify the requester
    scanModeManager.setOnTimeout((requesterId) => {
        wsServer.sendToClient(requesterId, { type: 'scan_mode_timeout' });
    });
    // Handle incoming WebSocket messages related to scan mode
    wsServer.onClientMessage((clientId, message) => {
        if (message.type === 'enter_scan_mode') {
            const entered = scanModeManager.enterScanMode(clientId);
            if (entered) {
                wsServer.sendToClient(clientId, { type: 'scan_mode_entered' });
            }
            else {
                wsServer.sendToClient(clientId, {
                    type: 'scan_in_progress',
                    error: 'Another scan is already in progress',
                });
            }
        }
        if (message.type === 'cancel_scan_mode') {
            // Only the current requester can cancel scan mode
            if (scanModeManager.getRequesterId() === clientId) {
                scanModeManager.exitScanMode();
                wsServer.sendToClient(clientId, { type: 'scan_mode_cancelled' });
            }
        }
    });
    // Handle client disconnect — auto-exit scan mode if the requester disconnects
    wsServer.onClientDisconnect((clientId) => {
        if (scanModeManager.getRequesterId() === clientId) {
            scanModeManager.exitScanMode();
        }
    });
}
//# sourceMappingURL=scan-mode-ws-handler.js.map