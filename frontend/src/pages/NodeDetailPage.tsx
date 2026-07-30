import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTelemetryStore } from '../stores/telemetry.store';
import { useUIStore } from '../stores/ui.store';
import { getNodeTelemetry } from '../services/api.service';
import { TelemetryPanel } from '../components/TelemetryPanel';
import { ConnectionStatus } from '../components/ConnectionStatus';
import type { TelemetryPayload } from '../types';

/**
 * NodeDetailPage displays the real-time telemetry panel for a specific node.
 *
 * - Fetches initial telemetry from the REST API on mount
 * - Subscribes to real-time telemetry updates from the telemetry store
 * - Shows error state if the initial fetch fails
 * - Displays connection status indicator
 */
export default function NodeDetailPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const [initialTelemetry, setInitialTelemetry] = useState<TelemetryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time telemetry from the store
  const realtimeTelemetry = useTelemetryStore((state) =>
    nodeId ? state.telemetryByNode.get(nodeId) ?? null : null,
  );

  const connectionStatus = useUIStore((state) => state.connectionStatus);

  // Fetch telemetry on mount
  useEffect(() => {
    if (!nodeId) return;

    let cancelled = false;

    async function fetchTelemetry() {
      setLoading(true);
      setError(null);
      try {
        const result = await getNodeTelemetry(nodeId!);
        if (!cancelled) {
          setInitialTelemetry(result.telemetry);

          // Seed the telemetry store with initial data
          useTelemetryStore.getState().updateTelemetry(nodeId!, result.telemetry);
        }
      } catch {
        if (!cancelled) {
          setError('Telemetry data is unavailable. Please try again later.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTelemetry();

    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  // Use real-time telemetry if available, otherwise fall back to initial fetch
  const telemetry = realtimeTelemetry ?? initialTelemetry;

  if (!nodeId) {
    return (
      <div className="p-4">
        <p className="text-red-600">No node ID specified.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Node Detail: {nodeId}</h1>
        <ConnectionStatus />
      </div>

      {/* Connection status warning */}
      {connectionStatus === 'disconnected' && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700"
          role="alert"
        >
          WebSocket connection is disconnected. Real-time updates are paused.
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600">Loading telemetry...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center" role="alert">
          <p className="text-red-700 font-medium">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              getNodeTelemetry(nodeId)
                .then((result) => {
                  setInitialTelemetry(result.telemetry);
                  useTelemetryStore.getState().updateTelemetry(nodeId, result.telemetry);
                })
                .catch(() => {
                  setError('Telemetry data is unavailable. Please try again later.');
                })
                .finally(() => setLoading(false));
            }}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Telemetry Panel */}
      {telemetry && !loading && !error && (
        <TelemetryPanel nodeId={nodeId} telemetry={telemetry} />
      )}
    </div>
  );
}
