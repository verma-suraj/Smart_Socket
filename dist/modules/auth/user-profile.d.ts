import type { Firestore } from 'firebase-admin/firestore';
import type { UserProfile, UserProfileInput } from '../../models/index.js';
/**
 * Manages user profile CRUD operations against Firestore.
 *
 * Users are stored in the `users` collection with Firestore auto-generated IDs.
 * Each user can have one or more RFID UIDs associated.
 */
export declare class UserProfileManager {
    private readonly firestore;
    private readonly collectionName;
    constructor(firestore: Firestore);
    /**
     * Create a new user profile.
     *
     * Validates that required fields (name, batteryCapacity, chargerPowerRating) are present.
     * Generates a unique userId via Firestore's auto-generated document ID.
     *
     * @throws Error with descriptive message if required fields are missing.
     */
    createUser(profile: UserProfileInput): Promise<UserProfile>;
    /**
     * Update an existing user profile.
     *
     * Merges the provided updates with the existing profile. Only fields present
     * in `updates` are modified; other fields remain unchanged.
     *
     * @throws Error if the user does not exist.
     */
    updateUser(userId: string, updates: Partial<UserProfileInput>): Promise<UserProfile>;
    /**
     * Look up a user by RFID UID.
     *
     * Queries the `users` collection for documents where `rfidUids` array
     * contains the given UID.
     *
     * @returns The UserProfile if found, or null if no match.
     */
    getUserByRfid(rfidUid: string): Promise<UserProfile | null>;
    /**
     * Assign an RFID UID to an existing user.
     *
     * Adds the UID to the user's `rfidUids` array if not already present.
     *
     * @throws Error if the user does not exist.
     */
    assignRfid(userId: string, rfidUid: string): Promise<void>;
    /**
     * List all user profiles from Firestore.
     *
     * Queries the entire `users` collection and returns all documents as UserProfile[].
     */
    listAllUsers(): Promise<UserProfile[]>;
    /**
     * Delete a user profile by userId.
     *
     * Removes the user document from Firestore. Since RFID UIDs are stored
     * within the user document's rfidUids array, deleting the document
     * inherently frees those UIDs for re-assignment.
     *
     * @throws Error if the user does not exist.
     */
    deleteUser(userId: string): Promise<void>;
    /**
     * Check if a user has an active charging session.
     *
     * Iterates over the in-memory active sessions map and checks
     * if any session's userId matches the given userId.
     */
    hasActiveSession(userId: string): boolean;
    /**
     * Validate that required fields are present in the profile input.
     *
     * Required fields: name, batteryCapacity, chargerPowerRating.
     *
     * @throws Error with descriptive message listing missing fields.
     */
    private validateRequiredFields;
}
//# sourceMappingURL=user-profile.d.ts.map