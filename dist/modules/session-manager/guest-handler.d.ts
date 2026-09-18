import type { Session } from '../../models/index.js';
/**
 * Input parameters for initiating a guest charging session.
 */
export interface GuestSessionInput {
    /** The registered user's ID (required for billing association) */
    userId: string;
    /** The node/socket to charge on (required) */
    nodeId: string;
    /** Optional EV specifications for priority calculation */
    guestSpecs?: {
        batteryCapacity: number;
        batteryType: string;
        chargerType: string;
        chargerPowerRating: number;
    } | null;
    /** Optional initial state-of-charge (0-1) */
    initialSOC?: number;
}
/**
 * Result of validating guest session input.
 */
export interface GuestValidationResult {
    valid: boolean;
    errors: string[];
}
/**
 * GuestHandler orchestrates the guest charging flow.
 *
 * Responsibilities:
 * - Validate guest session input (userId, nodeId required)
 * - Package optional EV specs as GuestSpecs for priority calculation
 * - If no specs provided, ensure priority defaults to 0
 * - Delegate actual session creation to session-lifecycle
 * - Associate session with user profile for billing
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */
export declare class GuestHandler {
    /**
     * Validate the input for a guest session.
     *
     * @param input - The guest session input to validate
     * @returns Validation result with any error messages
     */
    validateInput(input: GuestSessionInput): GuestValidationResult;
    /**
     * Initiate a guest charging session.
     *
     * This method:
     * 1. Validates the input (userId, nodeId required)
     * 2. Packages optional EV specs as GuestSpecs
     * 3. If no specs provided, passes null so priority defaults to 0
     * 4. Creates a session with session_type "guest" associated with the user's profile
     *
     * @param input - Guest session parameters
     * @returns The created Session record
     * @throws Error if validation fails
     *
     * Requirements: 12.1, 12.2, 12.3, 12.4
     */
    initiateGuestSession(input: GuestSessionInput): Session;
}
/**
 * Factory function to create a GuestHandler instance.
 */
export declare function createGuestHandler(): GuestHandler;
//# sourceMappingURL=guest-handler.d.ts.map