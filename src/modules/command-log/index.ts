import type { Firestore } from 'firebase-admin/firestore';
import type { RelayCommand, DeliveryStatus, CommandLogDocument } from '../../models/index.js';

/**
 * CommandLogger — logs all relay commands to Firestore `commandLog` collection.
 *
 * Designed to be called after every publishCommand operation. Uses fire-and-forget
 * semantics: logging failures are caught and console.error'd without disrupting
 * the relay command flow.
 *
 * Implements:
 *   - Requirement 10.4: Log every relay command with node_id, command_type, reason,
 *     timestamp, delivery_status, and attempts.
 */
export class CommandLogger {
  private readonly firestore: Firestore;
  private readonly collectionName = 'commandLog';

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  /**
   * Log a relay command to Firestore.
   *
   * Fire-and-forget: does not block the caller. Errors are caught and logged
   * to console.error without throwing.
   *
   * @param nodeId - The target node identifier
   * @param command - The relay command that was issued
   * @param deliveryStatus - The delivery outcome of the command
   */
  logCommand(
    nodeId: string,
    command: RelayCommand,
    deliveryStatus: DeliveryStatus
  ): void {
    const commandId = this.generateCommandId();
    const commandType: CommandLogDocument['commandType'] =
      command.relay_state === 'on' ? 'relay_on' : 'relay_off';

    const mappedStatus: CommandLogDocument['deliveryStatus'] =
      deliveryStatus.delivered ? 'delivered' : 'failed';

    const doc: CommandLogDocument = {
      commandId,
      nodeId,
      commandType,
      reason: command.reason,
      timestamp: command.timestamp,
      deliveryStatus: mappedStatus,
      attempts: deliveryStatus.attempts,
      relayState: command.relay_state,
    };

    // Fire-and-forget: write to Firestore without awaiting
    this.firestore
      .collection(this.collectionName)
      .doc(commandId)
      .set(doc)
      .catch((error) => {
        console.error('[CommandLogger] Failed to log command:', error);
      });
  }

  /**
   * Query command history for a specific node, ordered by timestamp descending.
   *
   * @param nodeId - The node to query history for
   * @param limit - Maximum number of records to return (default: 50)
   * @returns Array of CommandLogDocument entries
   */
  async getCommandHistory(
    nodeId: string,
    limit: number = 50
  ): Promise<CommandLogDocument[]> {
    const snapshot = await this.firestore
      .collection(this.collectionName)
      .where('nodeId', '==', nodeId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc) => doc.data() as CommandLogDocument);
  }

  /**
   * Generate a unique command ID using crypto.randomUUID.
   */
  private generateCommandId(): string {
    return crypto.randomUUID();
  }
}

/**
 * Factory function to create a CommandLogger instance.
 */
export function createCommandLogger(firestore: Firestore): CommandLogger {
  return new CommandLogger(firestore);
}
