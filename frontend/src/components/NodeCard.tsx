import { useNavigate } from 'react-router-dom';
import type { NodeRecord, NodeStatus } from '../types';

export interface NodeCardProps {
  node: NodeRecord;
  /** Real-time status from WebSocket, overrides derived status if present */
  realtimeStatus?: NodeStatus;
}

/**
 * Derives the display status from a NodeRecord's fields.
 * Priority: inTemperatureOverride → override, active → online, else → offline
 */
function deriveStatus(node: NodeRecord): NodeStatus {
  if (node.inTemperatureOverride) return 'override';
  if (node.active) return 'online';
  return 'offline';
}

function getStatusConfig(status: NodeStatus) {
  switch (status) {
    case 'online':
      return {
        dotClass: 'bg-green-500',
        label: 'Online',
        labelClass: 'text-green-700',
      };
    case 'offline':
      return {
        dotClass: 'bg-gray-400',
        label: 'Offline',
        labelClass: 'text-gray-500',
      };
    case 'override':
      return {
        dotClass: 'bg-amber-500',
        label: 'Override',
        labelClass: 'text-amber-700',
      };
  }
}

/**
 * NodeCard displays a single node's summary info with status indicator.
 * Clicking the card navigates to the node's detail/telemetry view.
 */
export function NodeCard({ node, realtimeStatus }: NodeCardProps) {
  const navigate = useNavigate();
  const status = realtimeStatus ?? deriveStatus(node);
  const config = getStatusConfig(status);

  return (
    <button
      type="button"
      onClick={() => navigate(`/nodes/${node.nodeId}`)}
      className="w-full text-left p-4 rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-gray-300 transition-shadow cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label={`View details for ${node.displayName}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900 truncate">
            {node.displayName}
          </h3>
          <p className="text-sm text-gray-500 mt-1 truncate">
            {node.locationLabel}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {status === 'override' ? (
            <svg
              className="w-4 h-4 text-amber-500"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <span
              className={`inline-block w-3 h-3 rounded-full ${config.dotClass}`}
              aria-hidden="true"
            />
          )}
          <span className={`text-xs font-medium ${config.labelClass}`}>
            {config.label}
          </span>
        </div>
      </div>
    </button>
  );
}
