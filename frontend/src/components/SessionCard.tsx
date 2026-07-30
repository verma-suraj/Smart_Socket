import { useState, useEffect } from 'react';
import { formatDuration, formatTimestamp } from '../utils/formatters';
import type { Session } from '../types';

interface SessionCardProps {
  session: Session;
  nodeName: string;
  userName: string;
}

/**
 * Displays a single active session with live elapsed timer.
 * Shows node name, user, session type, start time, live HH:MM:SS timer,
 * energy consumed, and priority score.
 */
export default function SessionCard({ session, nodeName, userName }: SessionCardProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() =>
    Math.floor((Date.now() - session.startTimestamp) / 1000),
  );

  // Live timer: updates every 1 second
  useEffect(() => {
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - session.startTimestamp) / 1000);
      setElapsedSeconds(elapsed < 0 ? 0 : elapsed);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [session.startTimestamp]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      {/* Header: node name and session type badge */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 truncate">{nodeName}</h3>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            session.sessionType === 'owner'
              ? 'bg-blue-100 text-blue-800'
              : 'bg-purple-100 text-purple-800'
          }`}
        >
          {session.sessionType === 'owner' ? 'Owner' : 'Guest'}
        </span>
      </div>

      {/* User name */}
      <p className="text-sm text-gray-600 mb-3">
        <span className="font-medium">User:</span> {userName}
      </p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Start time */}
        <div>
          <p className="text-xs text-gray-500">Start Time</p>
          <p className="text-sm font-medium text-gray-800">
            {formatTimestamp(session.startTimestamp)}
          </p>
        </div>

        {/* Live timer */}
        <div>
          <p className="text-xs text-gray-500">Elapsed</p>
          <p className="text-sm font-mono font-medium text-green-700">
            {formatDuration(elapsedSeconds)}
          </p>
        </div>

        {/* Energy consumed */}
        <div>
          <p className="text-xs text-gray-500">Energy</p>
          <p className="text-sm font-medium text-gray-800">
            {session.totalEnergyConsumed.toFixed(2)} kWh
          </p>
        </div>

        {/* Priority score */}
        <div>
          <p className="text-xs text-gray-500">Priority</p>
          <p className="text-sm font-medium text-gray-800">{session.priorityScore}</p>
        </div>
      </div>
    </div>
  );
}
