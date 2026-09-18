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
export declare class CommandLogger {
    private readonly firestore;
    private readonly collectionName;
    constructor(firestore: Firestore);
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
    logCommand(nodeId: string, command: RelayCommand, deliveryStatus: DeliveryStatus): void;
    /**
     * Query command history for a specific node, ordered by timestamp descending.
     *
     * @param nodeId - The node to query history for
     * @param limit - Maximum number of records to return (default: 50)
     * @returns Array of CommandLogDocument entries
     */
    getCommandHistory(nodeId: string, limit?: number): Promise<CommandLogDocument[]>;
    /**
     * Generate a unique command ID using crypto.randomUUID.
     */
    private generateCommandId;
}
/**
 * Factory function to create a CommandLogger instance.
 */
export declare function createCommandLogger(firestore: Firestore): CommandLogger;
//# sourceMappingURL=index.d.ts.map