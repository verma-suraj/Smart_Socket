import type { Firestore } from 'firebase-admin/firestore';
/**
 * Threshold Manager — manages the Load_Threshold value used by the ALM engine.
 * Holds the threshold in memory for fast access and persists changes to Firestore
 * so the value survives server restarts.
 *
 * Implements:
 *   - Requirement 4.4: New threshold applied immediately without restart
 *   - Requirement 11.3: New threshold applied to all subsequent load comparisons
 *   - Requirement 11.4: Persist threshold so it survives server restarts
 */
export declare class ThresholdManager {
    private readonly firestore;
    /** Firestore collection name for system configuration. */
    private static readonly CONFIG_COLLECTION;
    /** Firestore document ID for the ALM config entry. */
    private static readonly CONFIG_DOC_ID;
    /** In-memory threshold value (watts). */
    private threshold;
    constructor(firestore: Firestore);
    /**
     * Get the current threshold value (in watts).
     * Returns the in-memory value for fast access.
     */
    getThreshold(): number;
    /**
     * Set a new threshold value. Updates the in-memory value immediately
     * (Requirement 4.4, 11.3) and persists to Firestore (Requirement 11.4).
     *
     * @param value - New threshold in watts
     * @param updatedBy - Identifier of who set the threshold (default: 'system')
     */
    setThreshold(value: number, updatedBy?: string): Promise<void>;
    /**
     * Load the persisted threshold from Firestore on startup.
     * Falls back to the default value from config if no persisted value exists.
     *
     * Should be called during application initialization.
     */
    loadThreshold(): Promise<void>;
}
//# sourceMappingURL=threshold-manager.d.ts.map