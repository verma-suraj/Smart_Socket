import type { Firestore } from 'firebase-admin/firestore';
import { config } from '../../config/index.js';

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
export class ThresholdManager {
  /** Firestore collection name for system configuration. */
  private static readonly CONFIG_COLLECTION = 'config';

  /** Firestore document ID for the ALM config entry. */
  private static readonly CONFIG_DOC_ID = 'alm';

  /** In-memory threshold value (watts). */
  private threshold: number;

  constructor(private readonly firestore: Firestore) {
    // Initialize with default from config; loadThreshold() should be called at startup
    // to hydrate from Firestore.
    this.threshold = config.alm.defaultThreshold;
  }

  /**
   * Get the current threshold value (in watts).
   * Returns the in-memory value for fast access.
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Set a new threshold value. Updates the in-memory value immediately
   * (Requirement 4.4, 11.3) and persists to Firestore (Requirement 11.4).
   *
   * @param value - New threshold in watts
   * @param updatedBy - Identifier of who set the threshold (default: 'system')
   */
  async setThreshold(value: number, updatedBy: string = 'system'): Promise<void> {
    // Update in-memory value immediately so subsequent evaluations use it
    this.threshold = value;

    // Persist to Firestore for crash recovery / restart durability
    await this.firestore
      .collection(ThresholdManager.CONFIG_COLLECTION)
      .doc(ThresholdManager.CONFIG_DOC_ID)
      .set(
        {
          loadThreshold: value,
          updatedAt: Date.now(),
          updatedBy,
        },
        { merge: true }
      );

    console.log(
      `[ThresholdManager] Threshold updated to ${value}W by ${updatedBy}`
    );
  }

  /**
   * Load the persisted threshold from Firestore on startup.
   * Falls back to the default value from config if no persisted value exists.
   *
   * Should be called during application initialization.
   */
  async loadThreshold(): Promise<void> {
    try {
      const doc = await this.firestore
        .collection(ThresholdManager.CONFIG_COLLECTION)
        .doc(ThresholdManager.CONFIG_DOC_ID)
        .get();

      if (doc.exists) {
        const data = doc.data();
        if (data && typeof data.loadThreshold === 'number') {
          this.threshold = data.loadThreshold;
          console.log(
            `[ThresholdManager] Loaded threshold from Firestore: ${this.threshold}W`
          );
          return;
        }
      }

      // No persisted value found — use default
      this.threshold = config.alm.defaultThreshold;
      console.log(
        `[ThresholdManager] No persisted threshold found, using default: ${this.threshold}W`
      );
    } catch (error) {
      // On Firestore failure, retain the default threshold
      console.error(
        '[ThresholdManager] Failed to load threshold from Firestore, using default:',
        error
      );
      this.threshold = config.alm.defaultThreshold;
    }
  }
}
