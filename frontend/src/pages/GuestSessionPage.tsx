import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNodeStore } from '../stores/node.store';
import { useSessionStore } from '../stores/session.store';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import { startGuestSession } from '../services/api.service';
import { filterAvailableNodes } from '../utils/filters';
import { validateGuestSpecs } from '../utils/validators';
import { webSocketService } from '../services/websocket.service';
import type { GuestSpecs, NodeRecord } from '../types';

/** RFID listening state machine for the guest session page */
type RfidListeningState = 'listening' | 'assigned' | 'timeout';

/** Timeout duration in milliseconds (60 seconds) */
const RFID_LISTEN_TIMEOUT_MS = 60_000;

export default function GuestSessionPage() {
  const { nodes, fetchNodes } = useNodeStore();
  const { activeSessions, fetchActiveSessions } = useSessionStore();
  const user = useAuthStore((s) => s.user);
  const addNotification = useUIStore((s) => s.addNotification);
  const updateSession = useSessionStore((s) => s.updateSession);

  // RFID tap state
  const [rfidState, setRfidState] = useState<RfidListeningState>('listening');
  const [assignedNodeId, setAssignedNodeId] = useState('');
  const [rfidError, setRfidError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [batteryCapacity, setBatteryCapacity] = useState('');
  const [batteryType, setBatteryType] = useState('');
  const [chargerType, setChargerType] = useState('');
  const [chargerPowerRating, setChargerPowerRating] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Fetch nodes and sessions on mount
  useEffect(() => {
    fetchNodes();
    fetchActiveSessions();
  }, [fetchNodes, fetchActiveSessions]);

  // Compute available nodes (online + not in override + not occupied)
  const availableNodes: NodeRecord[] = useMemo(() => {
    const nodeArray = Array.from(nodes.values());
    return filterAvailableNodes(nodeArray, activeSessions);
  }, [nodes, activeSessions]);

  // Set of available node IDs for quick lookup
  const availableNodeIds = useMemo(() => {
    return new Set(availableNodes.map((n) => n.nodeId));
  }, [availableNodes]);

  /**
   * Determine why a node is unavailable.
   * Returns a user-friendly reason string.
   */
  const getUnavailableReason = useCallback(
    (nodeId: string): string => {
      const node = nodes.get(nodeId);
      if (!node) {
        return 'Node not found in the system';
      }
      if (!node.active) {
        return 'Node is offline';
      }
      if (node.inTemperatureOverride) {
        return 'Node is in temperature override mode';
      }
      // Check if occupied
      const isOccupied = activeSessions.some((s) => s.active && s.nodeId === nodeId);
      if (isOccupied) {
        return 'Node is currently occupied by another session';
      }
      return 'Node is unavailable';
    },
    [nodes, activeSessions],
  );

  /** Clear the 60s timeout timer */
  const clearListenTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /** Start or restart the 60s timeout */
  const startListenTimeout = useCallback(() => {
    clearListenTimeout();
    timeoutRef.current = setTimeout(() => {
      setRfidState('timeout');
    }, RFID_LISTEN_TIMEOUT_MS);
  }, [clearListenTimeout]);

  /** Handle retry: reset to listening state and restart timer */
  const handleRetry = useCallback(() => {
    setRfidError(null);
    setRfidState('listening');
    startListenTimeout();
  }, [startListenTimeout]);

  // Start the 60s timeout when entering listening state
  useEffect(() => {
    if (rfidState === 'listening') {
      startListenTimeout();
    }
    return () => {
      clearListenTimeout();
    };
  }, [rfidState, startListenTimeout, clearListenTimeout]);

  // Listen for rfid_tap WebSocket messages
  useEffect(() => {
    function handleRawMessage(message: Record<string, unknown>): void {
      if (message.type !== 'rfid_tap') return;
      // Only process if we're in listening state
      if (rfidState !== 'listening') return;

      const nodeId = message.nodeId as string;

      if (availableNodeIds.has(nodeId)) {
        // Node is available — assign it
        clearListenTimeout();
        setRfidError(null);
        setAssignedNodeId(nodeId);
        setRfidState('assigned');
      } else {
        // Node is unavailable — show reason, stay in listening
        const reason = getUnavailableReason(nodeId);
        setRfidError(`Cannot assign node: ${reason}`);
      }
    }

    webSocketService.onRawMessage(handleRawMessage);
    return () => {
      webSocketService.offRawMessage(handleRawMessage);
    };
  }, [rfidState, availableNodeIds, getUnavailableReason, clearListenTimeout]);

  // Get assigned node details
  const assignedNode = useMemo(() => {
    if (!assignedNodeId) return null;
    return nodes.get(assignedNodeId) || null;
  }, [assignedNodeId, nodes]);

  // Check if any guest spec field is filled
  const specsFields = [batteryCapacity, batteryType, chargerType, chargerPowerRating];
  const filledCount = specsFields.filter((f) => f.trim() !== '').length;
  const allEmpty = filledCount === 0;
  const allFilled = filledCount === 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    if (!assignedNodeId) {
      setValidationErrors(['No node assigned. Please tap an RFID card on a node.']);
      return;
    }

    if (!user?.uid) {
      setValidationErrors(['User not authenticated']);
      return;
    }

    // Validate guest specs: all 4 or none
    const partialSpecs: Partial<GuestSpecs> = {};
    if (batteryCapacity.trim()) {
      partialSpecs.batteryCapacity = parseFloat(batteryCapacity);
    }
    if (batteryType.trim()) {
      partialSpecs.batteryType = batteryType.trim();
    }
    if (chargerType.trim()) {
      partialSpecs.chargerType = chargerType.trim();
    }
    if (chargerPowerRating.trim()) {
      partialSpecs.chargerPowerRating = parseFloat(chargerPowerRating);
    }

    const validation = validateGuestSpecs(partialSpecs);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    // Build request params
    const params: { userId: string; nodeId: string; guestSpecs?: GuestSpecs } = {
      userId: user.uid,
      nodeId: assignedNodeId,
    };

    if (allFilled) {
      params.guestSpecs = {
        batteryCapacity: parseFloat(batteryCapacity),
        batteryType: batteryType.trim(),
        chargerType: chargerType.trim(),
        chargerPowerRating: parseFloat(chargerPowerRating),
      };
    }

    setSubmitting(true);
    try {
      const session = await startGuestSession(params);
      // Add to active sessions store
      updateSession(session);
      // Show success notification (auto-dismiss 5s)
      addNotification({
        type: 'success',
        title: 'Guest Session Started',
        message: `Guest charging session started on node ${session.nodeId}`,
        autoDismiss: true,
        autoDismissMs: 5000,
      });
      // Reset form and go back to listening
      setAssignedNodeId('');
      setBatteryCapacity('');
      setBatteryType('');
      setChargerType('');
      setChargerPowerRating('');
      setValidationErrors([]);
      setRfidState('listening');
    } catch (error: unknown) {
      // Extract error message from response body
      let errorMessage = 'Failed to start guest session';
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: { message?: string; error?: string } } };
        errorMessage =
          axiosError.response?.data?.message ||
          axiosError.response?.data?.error ||
          errorMessage;
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      addNotification({
        type: 'error',
        title: 'Guest Session Failed',
        message: errorMessage,
        autoDismiss: false,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Determine which fields are missing for the partial validation message
  const getMissingFieldsMessage = (): string | null => {
    if (allEmpty || allFilled) return null;
    const labels: [string, string][] = [
      [batteryCapacity, 'Battery Capacity'],
      [batteryType, 'Battery Type'],
      [chargerType, 'Charger Type'],
      [chargerPowerRating, 'Charger Power Rating'],
    ];
    const missing = labels.filter(([val]) => val.trim() === '').map(([, label]) => label);
    return `Missing fields: ${missing.join(', ')}`;
  };

  const partialWarning = getMissingFieldsMessage();

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Guest Charging Session</h1>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <ul className="list-disc list-inside text-red-700 text-sm space-y-1">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* RFID Tap Section */}
      {rfidState === 'listening' && (
        <div className="mb-6">
          {/* Pulsing indicator and prompt */}
          <div className="flex flex-col items-center justify-center p-8 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center animate-pulse">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 11c0-1.657-1.343-3-3-3s-3 1.343-3 3m6 0c0-1.657 1.343-3 3-3s3 1.343 3 3m-6 0v4m0-4H9m3 0h3"
                  />
                </svg>
              </div>
              {/* Pulsing ring animation */}
              <div className="absolute inset-0 w-16 h-16 rounded-full bg-blue-400 opacity-30 animate-ping" />
            </div>
            <h2 className="text-lg font-semibold text-blue-800 mb-1">
              Tap RFID card on a node
            </h2>
            <p className="text-sm text-blue-600 text-center">
              Waiting for RFID tap on any available node to assign the socket...
            </p>
          </div>

          {/* RFID error message (unavailable node) */}
          {rfidError && (
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800 font-medium">⚠ {rfidError}</p>
              <p className="text-xs text-amber-600 mt-1">
                Please tap on a different, available node.
              </p>
            </div>
          )}

          {/* Available nodes reference list */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Available Nodes ({availableNodes.length})
            </h3>
            {availableNodes.length > 0 ? (
              <ul className="space-y-2">
                {availableNodes.map((node) => (
                  <li
                    key={node.nodeId}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 border border-gray-200 rounded-md"
                  >
                    <span className="text-sm font-medium text-gray-800">
                      {node.displayName}
                    </span>
                    <span className="text-xs text-gray-500">{node.locationLabel}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">
                No nodes available. All nodes are either offline, occupied, or in temperature
                override.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Timeout state */}
      {rfidState === 'timeout' && (
        <div className="mb-6">
          <div className="flex flex-col items-center justify-center p-8 bg-gray-50 border border-gray-200 rounded-lg">
            <div className="w-16 h-16 rounded-full bg-gray-300 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-700 mb-1">
              Listening timed out
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              No RFID tap was detected within 60 seconds.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="px-5 py-2 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Assigned state — show locked node + guest specs form */}
      {rfidState === 'assigned' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Assigned Node (locked) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assigned Node
            </label>
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-300 rounded-lg">
              <svg
                className="w-5 h-5 text-green-600 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm font-medium text-green-800">
                {assignedNode
                  ? `${assignedNode.displayName} (${assignedNode.locationLabel})`
                  : assignedNodeId}
              </span>
              <svg
                className="w-4 h-4 text-gray-400 ml-auto"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
          </div>

          {/* Guest EV Specs (optional) */}
          <fieldset className="border border-gray-200 rounded-lg p-4">
            <legend className="text-sm font-medium text-gray-700 px-2">
              Guest EV Specifications (Optional)
            </legend>
            <p className="text-xs text-gray-500 mb-4">
              Provide all 4 fields or leave all empty. Partial submissions are not allowed.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Battery Capacity */}
              <div>
                <label htmlFor="battery-capacity" className="block text-sm font-medium text-gray-700 mb-1">
                  Battery Capacity (kWh)
                </label>
                <input
                  id="battery-capacity"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="200"
                  value={batteryCapacity}
                  onChange={(e) => setBatteryCapacity(e.target.value)}
                  placeholder="0.1 - 200"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={submitting}
                />
              </div>

              {/* Battery Type */}
              <div>
                <label htmlFor="battery-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Battery Type
                </label>
                <input
                  id="battery-type"
                  type="text"
                  value={batteryType}
                  onChange={(e) => setBatteryType(e.target.value)}
                  placeholder="e.g., Li-ion"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={submitting}
                />
              </div>

              {/* Charger Type */}
              <div>
                <label htmlFor="charger-type" className="block text-sm font-medium text-gray-700 mb-1">
                  Charger Type
                </label>
                <input
                  id="charger-type"
                  type="text"
                  value={chargerType}
                  onChange={(e) => setChargerType(e.target.value)}
                  placeholder="e.g., Type-2 AC"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={submitting}
                />
              </div>

              {/* Charger Power Rating */}
              <div>
                <label htmlFor="charger-power" className="block text-sm font-medium text-gray-700 mb-1">
                  Charger Power Rating (kW)
                </label>
                <input
                  id="charger-power"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="50"
                  value={chargerPowerRating}
                  onChange={(e) => setChargerPowerRating(e.target.value)}
                  placeholder="0.1 - 50"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={submitting}
                />
              </div>
            </div>

            {/* Partial fields warning */}
            {partialWarning && (
              <p className="mt-3 text-sm text-amber-600">
                ⚠ {partialWarning}
              </p>
            )}
          </fieldset>

          {/* Submit button */}
          <div>
            <button
              type="submit"
              disabled={submitting || (!allEmpty && !allFilled)}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Starting Session...' : 'Start Guest Session'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
