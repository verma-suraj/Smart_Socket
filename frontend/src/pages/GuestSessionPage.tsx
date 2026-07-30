import { useState, useEffect, useMemo } from 'react';
import { useNodeStore } from '../stores/node.store';
import { useSessionStore } from '../stores/session.store';
import { useAuthStore } from '../stores/auth.store';
import { useUIStore } from '../stores/ui.store';
import { startGuestSession } from '../services/api.service';
import { filterAvailableNodes } from '../utils/filters';
import { validateGuestSpecs } from '../utils/validators';
import type { GuestSpecs, NodeRecord } from '../types';

export default function GuestSessionPage() {
  const { nodes, fetchNodes } = useNodeStore();
  const { activeSessions, fetchActiveSessions } = useSessionStore();
  const user = useAuthStore((s) => s.user);
  const addNotification = useUIStore((s) => s.addNotification);
  const updateSession = useSessionStore((s) => s.updateSession);

  // Form state
  const [selectedNodeId, setSelectedNodeId] = useState('');
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

  // Check if any guest spec field is filled
  const specsFields = [batteryCapacity, batteryType, chargerType, chargerPowerRating];
  const filledCount = specsFields.filter((f) => f.trim() !== '').length;
  const allEmpty = filledCount === 0;
  const allFilled = filledCount === 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors([]);

    if (!selectedNodeId) {
      setValidationErrors(['Please select a node']);
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
      nodeId: selectedNodeId,
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
      // Reset form
      setSelectedNodeId('');
      setBatteryCapacity('');
      setBatteryType('');
      setChargerType('');
      setChargerPowerRating('');
      setValidationErrors([]);
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <ul className="list-disc list-inside text-red-700 text-sm space-y-1">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Node Selector */}
        <div>
          <label htmlFor="node-select" className="block text-sm font-medium text-gray-700 mb-1">
            Select Node <span className="text-red-500">*</span>
          </label>
          <select
            id="node-select"
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={submitting}
          >
            <option value="">-- Select an available node --</option>
            {availableNodes.map((node) => (
              <option key={node.nodeId} value={node.nodeId}>
                {node.displayName} ({node.locationLabel})
              </option>
            ))}
          </select>
          {availableNodes.length === 0 && (
            <p className="mt-1 text-sm text-gray-500">
              No nodes available. All nodes are either offline, occupied, or in temperature override.
            </p>
          )}
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
            disabled={submitting || !selectedNodeId || (!allEmpty && !allFilled)}
            className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Starting Session...' : 'Start Guest Session'}
          </button>
        </div>
      </form>
    </div>
  );
}
