import { getActiveSessionsMap } from '../session-manager/session-lifecycle.js';
/**
 * Manages user profile CRUD operations against Firestore.
 *
 * Users are stored in the `users` collection with Firestore auto-generated IDs.
 * Each user can have one or more RFID UIDs associated.
 */
export class UserProfileManager {
    constructor(firestore) {
        this.firestore = firestore;
        this.collectionName = 'users';
    }
    /**
     * Create a new user profile.
     *
     * Validates that required fields (name, batteryCapacity, chargerPowerRating) are present.
     * Generates a unique userId via Firestore's auto-generated document ID.
     *
     * @throws Error with descriptive message if required fields are missing.
     */
    async createUser(profile) {
        this.validateRequiredFields(profile);
        const now = Date.now();
        const docRef = this.firestore.collection(this.collectionName).doc();
        const userProfile = {
            userId: docRef.id,
            name: profile.name,
            evType: profile.evType,
            brand: profile.brand,
            batteryCapacity: profile.batteryCapacity,
            batteryType: profile.batteryType,
            chargerType: profile.chargerType,
            chargerPowerRating: profile.chargerPowerRating,
            rfidUids: profile.rfidUids ?? [],
            createdAt: now,
            updatedAt: now,
        };
        await docRef.set(userProfile);
        console.log(`[AuthModule] User created: userId=${userProfile.userId}, name="${userProfile.name}"`);
        return userProfile;
    }
    /**
     * Update an existing user profile.
     *
     * Merges the provided updates with the existing profile. Only fields present
     * in `updates` are modified; other fields remain unchanged.
     *
     * @throws Error if the user does not exist.
     */
    async updateUser(userId, updates) {
        const docRef = this.firestore.collection(this.collectionName).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            throw new Error(`User not found: userId="${userId}"`);
        }
        const now = Date.now();
        const updateData = {
            ...updates,
            updatedAt: now,
        };
        await docRef.update(updateData);
        // Return the full updated profile
        const updatedDoc = await docRef.get();
        const data = updatedDoc.data();
        console.log(`[AuthModule] User updated: userId=${userId}`);
        return data;
    }
    /**
     * Look up a user by RFID UID.
     *
     * Queries the `users` collection for documents where `rfidUids` array
     * contains the given UID.
     *
     * @returns The UserProfile if found, or null if no match.
     */
    async getUserByRfid(rfidUid) {
        const snapshot = await this.firestore
            .collection(this.collectionName)
            .where('rfidUids', 'array-contains', rfidUid)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return null;
        }
        return snapshot.docs[0].data();
    }
    /**
     * Assign an RFID UID to an existing user.
     *
     * Adds the UID to the user's `rfidUids` array if not already present.
     *
     * @throws Error if the user does not exist.
     */
    async assignRfid(userId, rfidUid) {
        const docRef = this.firestore.collection(this.collectionName).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            throw new Error(`User not found: userId="${userId}"`);
        }
        const data = doc.data();
        const currentUids = data.rfidUids ?? [];
        if (currentUids.includes(rfidUid)) {
            // UID already assigned — no-op
            return;
        }
        await docRef.update({
            rfidUids: [...currentUids, rfidUid],
            updatedAt: Date.now(),
        });
        console.log(`[AuthModule] RFID assigned: uid="${rfidUid}" → userId=${userId}`);
    }
    /**
     * List all user profiles from Firestore.
     *
     * Queries the entire `users` collection and returns all documents as UserProfile[].
     */
    async listAllUsers() {
        const snapshot = await this.firestore.collection(this.collectionName).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    /**
     * Delete a user profile by userId.
     *
     * Removes the user document from Firestore. Since RFID UIDs are stored
     * within the user document's rfidUids array, deleting the document
     * inherently frees those UIDs for re-assignment.
     *
     * @throws Error if the user does not exist.
     */
    async deleteUser(userId) {
        const docRef = this.firestore.collection(this.collectionName).doc(userId);
        const doc = await docRef.get();
        if (!doc.exists) {
            throw new Error(`User not found: userId="${userId}"`);
        }
        await docRef.delete();
        console.log(`[AuthModule] User deleted: userId=${userId}`);
    }
    /**
     * Check if a user has an active charging session.
     *
     * Iterates over the in-memory active sessions map and checks
     * if any session's userId matches the given userId.
     */
    hasActiveSession(userId) {
        const activeSessions = getActiveSessionsMap();
        for (const session of activeSessions.values()) {
            if (session.userId === userId && session.active) {
                return true;
            }
        }
        return false;
    }
    /**
     * Validate that required fields are present in the profile input.
     *
     * Required fields: name, batteryCapacity, chargerPowerRating.
     *
     * @throws Error with descriptive message listing missing fields.
     */
    validateRequiredFields(profile) {
        const missingFields = [];
        if (!profile.name || profile.name.trim() === '') {
            missingFields.push('name');
        }
        if (profile.batteryCapacity === undefined ||
            profile.batteryCapacity === null ||
            typeof profile.batteryCapacity !== 'number' ||
            profile.batteryCapacity <= 0) {
            missingFields.push('batteryCapacity');
        }
        if (profile.chargerPowerRating === undefined ||
            profile.chargerPowerRating === null ||
            typeof profile.chargerPowerRating !== 'number' ||
            profile.chargerPowerRating <= 0) {
            missingFields.push('chargerPowerRating');
        }
        if (missingFields.length > 0) {
            throw new Error(`Missing required fields: ${missingFields.join(', ')}. ` +
                `Please provide valid values for: ${missingFields.map((f) => `"${f}"`).join(', ')}.`);
        }
    }
}
//# sourceMappingURL=user-profile.js.map