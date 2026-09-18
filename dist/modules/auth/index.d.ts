import type { Firestore } from 'firebase-admin/firestore';
import type { IAuthModule } from '../../interfaces/auth-module.interface.js';
import type { AuthResult, UserProfile, UserProfileInput } from '../../models/index.js';
import type { ScanModeManager } from '../scan-mode/scan-mode-manager.js';
import type { WebSocketServer } from '../dashboard-api/websocket-server.js';
/**
 * Options for configuring the AuthModule with optional scan mode integration.
 */
export interface AuthModuleOptions {
    scanModeManager?: ScanModeManager;
    wsServer?: WebSocketServer;
}
/**
 * Auth Module — composes RFID authentication and user profile management.
 *
 * Implements the IAuthModule interface by delegating to:
 * - RfidHandler: RFID UID lookup with 3-second timeout
 * - UserProfileManager: User profile CRUD operations
 *
 * The module does NOT directly call MQTT or session services.
 * The wiring layer inspects the AuthResult and triggers relay-on / session creation.
 */
export declare class AuthModule implements IAuthModule {
    private readonly rfidHandler;
    private readonly userProfileManager;
    constructor(firestore: Firestore, options?: AuthModuleOptions);
    /**
     * Authenticate an RFID UID scanned at a node.
     *
     * Looks up the UID in the `users` collection within a 3-second deadline.
     * Returns an AuthResult indicating success (with userId) or failure (with error).
     * The caller is responsible for acting on the result (relay-on, session creation, etc.).
     */
    authenticateRfid(nodeId: string, rfidUid: string): Promise<AuthResult>;
    /**
     * Create a new user profile with validation.
     *
     * Required fields: name, batteryCapacity, chargerPowerRating.
     * @throws Error with descriptive message if required fields are missing.
     */
    createUser(profile: UserProfileInput): Promise<UserProfile>;
    /**
     * Update an existing user profile.
     *
     * @throws Error if the user does not exist.
     */
    updateUser(userId: string, updates: Partial<UserProfileInput>): Promise<UserProfile>;
    /**
     * Look up a user by their RFID UID.
     *
     * @returns The UserProfile if found, or null if no match.
     */
    getUserByRfid(rfidUid: string): Promise<UserProfile | null>;
    /**
     * Assign an RFID UID to an existing user.
     *
     * @throws Error if the user does not exist.
     */
    assignRfid(userId: string, rfidUid: string): Promise<void>;
    /**
     * List all registered user profiles.
     */
    listAllUsers(): Promise<UserProfile[]>;
    /**
     * Delete a user profile and free associated RFID UIDs.
     *
     * @throws Error if the user does not exist.
     */
    deleteUser(userId: string): Promise<void>;
    /**
     * Check if a user has an active charging session.
     */
    hasActiveSession(userId: string): boolean;
}
export { RfidHandler } from './rfid-handler.js';
export { UserProfileManager } from './user-profile.js';
//# sourceMappingURL=index.d.ts.map