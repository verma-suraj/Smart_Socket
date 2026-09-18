/**
 * Result of an RFID authentication attempt.
 */
export interface AuthResult {
    success: boolean;
    userId?: string;
    error?: string;
    responseTime: number;
    /** True when the RFID event was intercepted by scan mode instead of normal auth. */
    intercepted?: boolean;
}
/**
 * Input for creating or updating a user profile.
 */
export interface UserProfileInput {
    name: string;
    evType: "2-wheeler" | "4-wheeler";
    brand: string;
    batteryCapacity: number;
    batteryType: string;
    chargerType: string;
    chargerPowerRating: number;
    rfidUids: string[];
}
/**
 * Stored user profile.
 */
export interface UserProfile {
    userId: string;
    name: string;
    evType: "2-wheeler" | "4-wheeler";
    brand: string;
    batteryCapacity: number;
    batteryType: string;
    chargerType: string;
    chargerPowerRating: number;
    rfidUids: string[];
    createdAt: number;
    updatedAt: number;
}
//# sourceMappingURL=user.d.ts.map