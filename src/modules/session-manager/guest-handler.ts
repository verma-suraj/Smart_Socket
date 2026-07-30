import type { Session, GuestSpecs } from '../../models/index.js';
import type { CreateSessionParams } from '../../interfaces/session-manager.interface.js';
import * as lifecycle from './session-lifecycle.js';

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
export class GuestHandler {
  /**
   * Validate the input for a guest session.
   *
   * @param input - The guest session input to validate
   * @returns Validation result with any error messages
   */
  validateInput(input: GuestSessionInput): GuestValidationResult {
    const errors: string[] = [];

    if (!input.userId || typeof input.userId !== 'string' || input.userId.trim() === '') {
      errors.push('userId is required');
    }

    if (!input.nodeId || typeof input.nodeId !== 'string' || input.nodeId.trim() === '') {
      errors.push('nodeId is required');
    }

    // Validate guestSpecs fields if provided
    if (input.guestSpecs) {
      if (typeof input.guestSpecs.batteryCapacity !== 'number' || input.guestSpecs.batteryCapacity <= 0) {
        errors.push('guestSpecs.batteryCapacity must be a positive number');
      }
      if (!input.guestSpecs.batteryType || typeof input.guestSpecs.batteryType !== 'string' || input.guestSpecs.batteryType.trim() === '') {
        errors.push('guestSpecs.batteryType is required when providing guest specs');
      }
      if (!input.guestSpecs.chargerType || typeof input.guestSpecs.chargerType !== 'string' || input.guestSpecs.chargerType.trim() === '') {
        errors.push('guestSpecs.chargerType is required when providing guest specs');
      }
      if (typeof input.guestSpecs.chargerPowerRating !== 'number' || input.guestSpecs.chargerPowerRating <= 0) {
        errors.push('guestSpecs.chargerPowerRating must be a positive number');
      }
    }

    // Validate initialSOC if provided
    if (input.initialSOC !== undefined) {
      if (typeof input.initialSOC !== 'number' || input.initialSOC < 0 || input.initialSOC > 1) {
        errors.push('initialSOC must be a number between 0 and 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

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
  initiateGuestSession(input: GuestSessionInput): Session {
    // Step 1: Validate input
    const validation = this.validateInput(input);
    if (!validation.valid) {
      throw new Error(`Guest session validation failed: ${validation.errors.join('; ')}`);
    }

    // Step 2: Package guest specs (or null if not provided)
    const guestSpecs: GuestSpecs | null = input.guestSpecs
      ? {
          batteryCapacity: input.guestSpecs.batteryCapacity,
          batteryType: input.guestSpecs.batteryType,
          chargerType: input.guestSpecs.chargerType,
          chargerPowerRating: input.guestSpecs.chargerPowerRating,
        }
      : null;

    // Step 3: Build CreateSessionParams
    // When guestSpecs are provided, use their values for priority calculation
    // When no specs, batteryCapacity and chargerPowerRating are 0 (priority will be 0)
    const params: CreateSessionParams = {
      userId: input.userId,
      nodeId: input.nodeId,
      sessionType: 'guest',
      batteryCapacity: guestSpecs ? guestSpecs.batteryCapacity : 0,
      chargerPowerRating: guestSpecs ? guestSpecs.chargerPowerRating : 0,
      initialSOC: input.initialSOC,
      guestSpecs,
    };

    // Step 4: Delegate session creation to session-lifecycle
    // This handles priority calculation internally:
    // - With guestSpecs: uses formula (batteryCapacity × (1 - SOC)) / chargerPowerRating
    // - Without guestSpecs: assigns priority 0
    const session = lifecycle.createSession(params);

    return session;
  }
}

/**
 * Factory function to create a GuestHandler instance.
 */
export function createGuestHandler(): GuestHandler {
  return new GuestHandler();
}
