import type { Firestore } from 'firebase-admin/firestore';
import type { AuthResult } from '../../models/index.js';
import type { ScanModeManager } from '../scan-mode/scan-mode-manager.js';
import type { WebSocketServer } from '../dashboard-api/websocket-server.js';
/**
 * Handles RFID-based authentication by looking up UIDs in the Firestore `users` collection.
 *
 * The lookup is constrained by a 3-second deadline (Promise.race with timeout).
 * On success, returns the matched userId. On failure or timeout, returns an
 * access-denied result. The caller (wiring layer) is responsible for triggering
 * relay-on and session creation based on the AuthResult.
 *
 * When ScanModeManager and WebSocketServer are provided, incoming RFID events
 * are first checked against scan mode. If scan mode is active, the event is
 * intercepted and routed to the scan requester; otherwise, an rfid_tap broadcast
 * is emitted for guest mode listeners before proceeding with normal auth.
 */
export declare class RfidHandler {
    private readonly firestore;
    private readonly scanModeManager?;
    private readonly wsServer?;
    constructor(firestore: Firestore, scanModeManager?: ScanModeManager | undefined, wsServer?: WebSocketServer | undefined);
    /**
     * Authenticate an RFID UID scanned at a specific node.
     *
     * Before the normal auth flow, checks if scan mode is active:
     * - If active: intercepts the event, sends rfid_scanned to the requester, and returns early.
     * - If not active: broadcasts rfid_tap for guest mode listeners, then proceeds with auth.
     *
     * @param nodeId - The node where the RFID was scanned.
     * @param rfidUid - The RFID UID to authenticate.
     * @returns AuthResult indicating success, failure, or interception.
     */
    authenticate(nodeId: string, rfidUid: string): Promise<AuthResult>;
    /**
     * Look up an RFID UID in the Firestore `users` collection.
     * Queries for documents where the `rfidUids` array contains the given UID.
     *
     * @returns The userId if found, or null if not found.
     */
    private lookupRfidUid;
    /**
     * Create a timeout promise that resolves to 'TIMEOUT' after the deadline.
     */
    private createTimeout;
}
//# sourceMappingURL=rfid-handler.d.ts.map