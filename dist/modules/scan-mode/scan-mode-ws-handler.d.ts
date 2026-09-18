import { ScanModeManager } from './scan-mode-manager.js';
import { WebSocketServer } from '../dashboard-api/websocket-server.js';
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
export declare function wireScanModeWebSocket(scanModeManager: ScanModeManager, wsServer: WebSocketServer): void;
//# sourceMappingURL=scan-mode-ws-handler.d.ts.map