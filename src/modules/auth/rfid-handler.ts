import type { Firestore } from 'firebase-admin/firestore';
import type { AuthResult } from '../../models/index.js';
import type { ScanModeManager } from '../scan-mode/scan-mode-manager.js';
import type { WebSocketServer } from '../dashboard-api/websocket-server.js';

/** Default RFID authentication timeout in milliseconds (3 seconds). */
const RFID_AUTH_TIMEOUT_MS = 3000;

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
export class RfidHandler {
  constructor(
    private readonly firestore: Firestore,
    private readonly scanModeManager?: ScanModeManager,
    private readonly wsServer?: WebSocketServer,
  ) {}

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
  async authenticate(nodeId: string, rfidUid: string): Promise<AuthResult> {
    // ─── Scan Mode Interception ─────────────────────────────────────────────
    if (this.scanModeManager && this.wsServer) {
      const requesterId = this.scanModeManager.getRequesterId();
      const scanResult = this.scanModeManager.consumeRfidEvent(rfidUid, nodeId);

      if (scanResult && requesterId) {
        // Event consumed by scan mode — route to requester and skip normal auth
        this.wsServer.sendToClient(requesterId, {
          type: 'rfid_scanned',
          rfidUid: scanResult.rfidUid,
          nodeId: scanResult.nodeId,
        });
        return { success: true, userId: undefined, responseTime: 0, intercepted: true };
      }

      // Not intercepted — broadcast rfid_tap for guest mode listeners
      this.wsServer.emitRfidTap(nodeId, rfidUid);
    }

    // ─── Normal RFID Authentication Flow ────────────────────────────────────
    const startTime = Date.now();

    try {
      const result = await Promise.race([
        this.lookupRfidUid(rfidUid),
        this.createTimeout(),
      ]);

      const responseTime = Date.now() - startTime;

      if (result === null) {
        // RFID UID not found in user database
        console.warn(
          `[AuthModule] Access denied: RFID UID "${rfidUid}" not found (node=${nodeId})`
        );
        return {
          success: false,
          error: 'access_denied',
          responseTime,
        };
      }

      if (result === 'TIMEOUT') {
        // Lookup exceeded 3-second deadline
        console.error(
          `[AuthModule] Auth timeout: RFID lookup exceeded ${RFID_AUTH_TIMEOUT_MS}ms (node=${nodeId}, uid=${rfidUid})`
        );
        return {
          success: false,
          error: 'auth_timeout',
          responseTime,
        };
      }

      // Success — user found
      console.log(
        `[AuthModule] Auth success: user=${result} authenticated at node=${nodeId}`
      );
      return {
        success: true,
        userId: result,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';

      console.error(
        `[AuthModule] Auth error for node=${nodeId}, uid=${rfidUid}: ${message}`
      );
      return {
        success: false,
        error: `auth_error: ${message}`,
        responseTime,
      };
    }
  }

  /**
   * Look up an RFID UID in the Firestore `users` collection.
   * Queries for documents where the `rfidUids` array contains the given UID.
   *
   * @returns The userId if found, or null if not found.
   */
  private async lookupRfidUid(rfidUid: string): Promise<string | null> {
    const snapshot = await this.firestore
      .collection('users')
      .where('rfidUids', 'array-contains', rfidUid)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return doc.id;
  }

  /**
   * Create a timeout promise that resolves to 'TIMEOUT' after the deadline.
   */
  private createTimeout(): Promise<'TIMEOUT'> {
    return new Promise((resolve) => {
      setTimeout(() => resolve('TIMEOUT'), RFID_AUTH_TIMEOUT_MS);
    });
  }
}
