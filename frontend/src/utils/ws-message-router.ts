/**
 * WebSocket message parsing and routing utility.
 * Pure function that NEVER throws an exception.
 */

type MessageHandlers = {
  telemetry: (message: unknown) => void;
  node_status: (message: unknown) => void;
  alm_event: (message: unknown) => void;
  session_update: (message: unknown) => void;
};

const VALID_TYPES = ['telemetry', 'node_status', 'alm_event', 'session_update'] as const;

/**
 * Parse raw JSON string and route to the appropriate handler based on the `type` field.
 *
 * - If not valid JSON → return false (no error thrown)
 * - If valid JSON but no recognized `type` field → return false
 * - If valid message with recognized type → call corresponding handler, return true
 * - Should NEVER throw an exception
 */
export function parseAndRoute(raw: string, handlers: MessageHandlers): boolean {
  try {
    const parsed = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object') {
      return false;
    }

    const type = parsed.type;

    if (!VALID_TYPES.includes(type)) {
      return false;
    }

    handlers[type as (typeof VALID_TYPES)[number]](parsed);
    return true;
  } catch {
    return false;
  }
}
