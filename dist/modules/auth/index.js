import { RfidHandler } from './rfid-handler.js';
import { UserProfileManager } from './user-profile.js';
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
export class AuthModule {
    constructor(firestore, options) {
        this.rfidHandler = new RfidHandler(firestore, options?.scanModeManager, options?.wsServer);
        this.userProfileManager = new UserProfileManager(firestore);
    }
    /**
     * Authenticate an RFID UID scanned at a node.
     *
     * Looks up the UID in the `users` collection within a 3-second deadline.
     * Returns an AuthResult indicating success (with userId) or failure (with error).
     * The caller is responsible for acting on the result (relay-on, session creation, etc.).
     */
    async authenticateRfid(nodeId, rfidUid) {
        return this.rfidHandler.authenticate(nodeId, rfidUid);
    }
    /**
     * Create a new user profile with validation.
     *
     * Required fields: name, batteryCapacity, chargerPowerRating.
     * @throws Error with descriptive message if required fields are missing.
     */
    async createUser(profile) {
        return this.userProfileManager.createUser(profile);
    }
    /**
     * Update an existing user profile.
     *
     * @throws Error if the user does not exist.
     */
    async updateUser(userId, updates) {
        return this.userProfileManager.updateUser(userId, updates);
    }
    /**
     * Look up a user by their RFID UID.
     *
     * @returns The UserProfile if found, or null if no match.
     */
    async getUserByRfid(rfidUid) {
        return this.userProfileManager.getUserByRfid(rfidUid);
    }
    /**
     * Assign an RFID UID to an existing user.
     *
     * @throws Error if the user does not exist.
     */
    async assignRfid(userId, rfidUid) {
        return this.userProfileManager.assignRfid(userId, rfidUid);
    }
    /**
     * List all registered user profiles.
     */
    async listAllUsers() {
        return this.userProfileManager.listAllUsers();
    }
    /**
     * Delete a user profile and free associated RFID UIDs.
     *
     * @throws Error if the user does not exist.
     */
    async deleteUser(userId) {
        return this.userProfileManager.deleteUser(userId);
    }
    /**
     * Check if a user has an active charging session.
     */
    hasActiveSession(userId) {
        return this.userProfileManager.hasActiveSession(userId);
    }
}
export { RfidHandler } from './rfid-handler.js';
export { UserProfileManager } from './user-profile.js';
//# sourceMappingURL=index.js.map