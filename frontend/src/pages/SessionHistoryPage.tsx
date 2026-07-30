import { useEffect, useState, useCallback } from 'react';
import { useSessionStore } from '../stores/session.store';
import { useAuthStore } from '../stores/auth.store';
import { useNodeStore } from '../stores/node.store';
import { useUIStore } from '../stores/ui.store';
import { deleteSession } from '../services/api.service';
import { sortSessionsByStartTime } from '../utils/filters';
import { formatDuration } from '../utils/formatters';
import SessionFilter from '../components/SessionFilter';
import type { Session, SessionFilters } from '../types';

/**
 * SessionHistoryPage displays the authenticated user's past charging sessions
 * with filtering, sorting (descending by startTimestamp), and delete functionality.
 */
export default function SessionHistoryPage() {
  const user = useAuthStore((state) => state.user);
  const { historyCache, loading, error, fetchUserSessions } = useSessionStore();
  const nodes = useNodeStore((state) => state.nodes);
  const fetchNodes = useNodeStore((state) => state.fetchNodes);
  const addNotification = useUIStore((state) => state.addNotification);

  const [currentFilters, setCurrentFilters] = useState<SessionFilters>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const userId = user?.uid || '';

  // Build cache key matching the store's cache key format
  const cacheKey = Object.keys(currentFilters).length === 0
    ? userId
    : `${userId}:${JSON.stringify(currentFilters)}`;

  const sessions: Session[] = historyCache.get(cacheKey) || [];
  const sortedSessions = sortSessionsByStartTime(sessions);

  // Fetch sessions on mount and when filters change
  const loadSessions = useCallback(() => {
    if (userId) {
      const filters = Object.keys(currentFilters).length > 0 ? currentFilters : undefined;
      fetchUserSessions(userId, filters);
    }
  }, [userId, currentFilters, fetchUserSessions]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Fetch nodes for filter dropdown
  useEffect(() => {
    if (nodes.size === 0) {
      fetchNodes();
    }
  }, [nodes.size, fetchNodes]);

  const handleApplyFilters = (filters: SessionFilters) => {
    setCurrentFilters(filters);
  };

  const handleDeleteClick = (sessionId: string) => {
    setDeleteConfirm(sessionId);
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  const handleDeleteConfirm = async (sessionId: string) => {
    setDeleteConfirm(null);
    setDeleting(sessionId);
    try {
      await deleteSession(sessionId);
      // Remove from session store on successful 204
      useSessionStore.getState().removeSession(sessionId);
      // Also remove from the history cache directly
      const newCache = new Map(useSessionStore.getState().historyCache);
      for (const [key, cachedSessions] of newCache.entries()) {
        newCache.set(key, cachedSessions.filter((s) => s.sessionId !== sessionId));
      }
      useSessionStore.setState({ historyCache: newCache });
      addNotification({
        type: 'success',
        title: 'Session Deleted',
        message: 'The session was successfully deleted.',
        autoDismiss: true,
        autoDismissMs: 5000,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete session';
      addNotification({
        type: 'error',
        title: 'Delete Failed',
        message,
        autoDismiss: false,
      });
    } finally {
      setDeleting(null);
    }
  };

  const getNodeName = (nodeId: string): string => {
    const node = nodes.get(nodeId);
    return node?.displayName || nodeId;
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString();
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  const formatEnergy = (kwh: number): string => {
    return kwh.toFixed(2);
  };

  const formatBill = (amount: number | null): string => {
    if (amount === null) return '—';
    return `₹${amount.toFixed(2)}`;
  };

  // Loading state
  if (loading && sessions.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Session History</h1>
        <SessionFilter onApplyFilters={handleApplyFilters} />
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading sessions...</span>
        </div>
      </div>
    );
  }

  // Error state with retry
  if (error && sessions.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Session History</h1>
        <SessionFilter onApplyFilters={handleApplyFilters} />
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-red-500 dark:text-red-400 mb-2">
            <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <button
            type="button"
            onClick={loadSessions}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Session History</h1>

      <SessionFilter onApplyFilters={handleApplyFilters} />

      {/* Empty state */}
      {sortedSessions.length === 0 && !loading && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
          <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg font-medium">No sessions found</p>
          <p className="text-sm">No sessions match the current filters.</p>
        </div>
      )}

      {/* Session table */}
      {sortedSessions.length > 0 && (
        <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg shadow">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Start Time</th>
                <th className="px-4 py-3">End Time</th>
                <th className="px-4 py-3">Node</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Energy (kWh)</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Bill</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {sortedSessions.map((session) => (
                <tr
                  key={session.sessionId}
                  className="hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-900 dark:text-gray-100"
                >
                  <td className="px-4 py-3 whitespace-nowrap">{formatDate(session.startTimestamp)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatTime(session.startTimestamp)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {session.endTimestamp ? formatTime(session.endTimestamp) : '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{getNodeName(session.nodeId)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        session.sessionType === 'owner'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                      }`}
                    >
                      {session.sessionType}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatEnergy(session.totalEnergyConsumed)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatDuration(session.totalTime)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatBill(session.billAmount)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(session.sessionId)}
                      disabled={deleting === session.sessionId}
                      className="rounded px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                      aria-label={`Delete session from ${formatDate(session.startTimestamp)}`}
                    >
                      {deleting === session.sessionId ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog (modal overlay for accessibility) */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
            <h2 id="delete-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Delete Session
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete this session? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleDeleteCancel}
                className="rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConfirm(deleteConfirm)}
                disabled={deleting !== null}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
