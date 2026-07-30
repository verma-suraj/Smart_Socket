import { useUIStore } from '../stores/ui.store';
import { formatTimestamp } from '../utils/formatters';
import type { SystemEvent } from '../types';

/** Map event type enum to a human-readable label */
function eventTypeLabel(type: SystemEvent['type']): string {
  switch (type) {
    case 'alm_shedding':
      return 'ALM Shedding';
    case 'node_offline':
      return 'Node Offline';
    case 'node_override':
      return 'Temperature Override';
    case 'session_ended':
      return 'Session Ended';
    default:
      return type;
  }
}

/** Severity icon (unique SVG per level) */
function SeverityIcon({ severity }: { severity: SystemEvent['severity'] }) {
  switch (severity) {
    case 'info':
      return (
        <svg
          className="w-5 h-5 text-blue-500 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
          />
        </svg>
      );
    case 'warning':
      return (
        <svg
          className="w-5 h-5 text-yellow-500 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86l-8.58 14.86A1 1 0 002.57 20h18.86a1 1 0 00.86-1.28l-8.58-14.86a1 1 0 00-1.72 0z"
          />
        </svg>
      );
    case 'critical':
      return (
        <svg
          className="w-5 h-5 text-red-500 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    default:
      return null;
  }
}

/** Background/border color classes per severity */
function severityRowClasses(severity: SystemEvent['severity']): string {
  switch (severity) {
    case 'info':
      return 'border-l-4 border-blue-400 bg-blue-50';
    case 'warning':
      return 'border-l-4 border-yellow-400 bg-yellow-50';
    case 'critical':
      return 'border-l-4 border-red-400 bg-red-50';
    default:
      return '';
  }
}

/** Severity label badge classes */
function severityBadgeClasses(severity: SystemEvent['severity']): string {
  switch (severity) {
    case 'info':
      return 'text-blue-700 bg-blue-100';
    case 'warning':
      return 'text-yellow-700 bg-yellow-100';
    case 'critical':
      return 'text-red-700 bg-red-100';
    default:
      return '';
  }
}

export default function EventLogPage() {
  const eventLog = useUIStore((state) => state.eventLog);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Event Log</h1>
      <p className="text-sm text-gray-500">
        Showing the most recent {eventLog.length} system event{eventLog.length !== 1 ? 's' : ''} (max 50).
      </p>

      {eventLog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg
            className="w-12 h-12 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6"
            />
          </svg>
          <p className="text-lg font-medium">No events recorded</p>
          <p className="text-sm">System events will appear here as they occur.</p>
        </div>
      ) : (
        <ul className="space-y-2" role="list" aria-label="System event log">
          {eventLog.map((event) => (
            <li
              key={event.id}
              className={`rounded-md p-3 ${severityRowClasses(event.severity)}`}
            >
              <div className="flex items-start gap-3">
                <SeverityIcon severity={event.severity} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${severityBadgeClasses(event.severity)}`}>
                      {event.severity}
                    </span>
                    <span className="text-xs font-medium text-gray-700">
                      {eventTypeLabel(event.type)}
                    </span>
                    {event.nodeName && (
                      <span className="text-xs text-gray-500">
                        — {event.nodeName}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-800">{event.message}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {formatTimestamp(event.timestamp)}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
