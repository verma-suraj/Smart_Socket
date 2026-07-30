import type { Firestore } from 'firebase-admin/firestore';
import type { UserProfile, UserProfileInput } from '../../models/index.js';

/**
 * Manages user profile CRUD operations against Firestore.
 *
 * Users are stored in the `users` collection with Firestore auto-generated IDs.
 * Each user can have one or more RFID UIDs associated.
 */
export class UserProfileManager {
  private readonly collectionName = 'users';

  constructor(private readonly firestore: Firestore) {}

  /**
   * Create a new user profile.
   *
   * Validates that required fields (name, batteryCapacity, chargerPowerRating) are present.
   * Generates a unique userId via Firestore's auto-generated document ID.
   *
   * @throws Error with descriptive message if required fields are missing.
   */
  async createUser(profile: UserProfileInput): Promise<UserProfile> {
    this.validateRequiredFields(profile);

    const now = Date.now();
    const docRef = this.firestore.collection(this.collectionName).doc();

    const userProfile: UserProfile = {
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
  async updateUser(userId: string, updates: Partial<UserProfileInput>): Promise<UserProfile> {
    const docRef = this.firestore.collection(this.collectionName).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error(`User not found: userId="${userId}"`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      ...updates,
      updatedAt: now,
    };

    await docRef.update(updateData);

    // Return the full updated profile
    const updatedDoc = await docRef.get();
    const data = updatedDoc.data() as UserProfile;

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
  async getUserByRfid(rfidUid: string): Promise<UserProfile | null> {
    const snapshot = await this.firestore
      .collection(this.collectionName)
      .where('rfidUids', 'array-contains', rfidUid)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as UserProfile;
  }

  /**
   * Assign an RFID UID to an existing user.
   *
   * Adds the UID to the user's `rfidUids` array if not already present.
   *
   * @throws Error if the user does not exist.
   */
  async assignRfid(userId: string, rfidUid: string): Promise<void> {
    const docRef = this.firestore.collection(this.collectionName).doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      throw new Error(`User not found: userId="${userId}"`);
    }

    const data = doc.data() as UserProfile;
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
   * Validate that required fields are present in the profile input.
   *
   * Required fields: name, batteryCapacity, chargerPowerRating.
   *
   * @throws Error with descriptive message listing missing fields.
   */
  private validateRequiredFields(profile: UserProfileInput): void {
    const missingFields: string[] = [];

    if (!profile.name || profile.name.trim() === '') {
      missingFields.push('name');
    }

    if (
      profile.batteryCapacity === undefined ||
      profile.batteryCapacity === null ||
      typeof profile.batteryCapacity !== 'number' ||
      profile.batteryCapacity <= 0
    ) {
      missingFields.push('batteryCapacity');
    }

    if (
      profile.chargerPowerRating === undefined ||
      profile.chargerPowerRating === null ||
      typeof profile.chargerPowerRating !== 'number' ||
      profile.chargerPowerRating <= 0
    ) {
      missingFields.push('chargerPowerRating');
    }

    if (missingFields.length > 0) {
      throw new Error(
        `Missing required fields: ${missingFields.join(', ')}. ` +
        `Please provide valid values for: ${missingFields.map((f) => `"${f}"`).join(', ')}.`
      );
    }
  }
}
