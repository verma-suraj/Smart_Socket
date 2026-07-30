import { useEffect, useCallback } from 'react';
import { useSessionStore } from '../stores/session.store';
import { useNodeStore } from '../stores/node.store';
import { useUIStore } from '../stores/ui.store';
import { webSocketService } from '../services/websocket.service';
import SessionCard from '../components/SessionCard';
import type { WSMessage, Session } from '../types';

/**
 * Active Sessions Page
 *
 * Displays all currently active charging sessions sorted by start time (descending).
 * Subscribes to session_update WebSocket messages:
 * - Updates energy/duration values for active sessions
 * - Removes ended sessions and shows a bill notification for 5 seconds
 *
 * Handles loading, error (with retry), and empty states.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7
 */
export default function ActiveSessionsPage() {
  const { activeSessions, loading, error, fetchActiveSessions } = useSessionStore();
  const nodes = useNodeStore((state) => state.nodes);
  const fetchNodes = useNodeStore((state) => state.fetchNodes);
  const addNotification = useUIStore((state) => state.addNotification);
  const updateSession = useSessionStore((state) => state.updateSession);

  // Fetch active sessions and nodes on mount
  useEffect(() => {
    fetchActiveSessions();
    // Fetch nodes if not already loaded (for display names)
    if (nodes.size === 0) {
      fetchNodes();
    }
  }, [fetchActiveSessions, fetchNodes, nodes.size]);

  // Subscribe to session_update WebSocket messages
  const handleWSMessage = useCallback(
    (message: WSMessage) => {
      if (message.type !== 'session_update') return;

      const session: Session = message.session;

      if (!session.active) {
        // Session ended: remove from list and show bill notification
        updateSession(session);
        const nodeName =
          nodes.get(session.nodeId)?.displayName || session.nodeId;
        addNotification({
          type: 'info',
          title: 'Session Ended',
          message: `Session on ${nodeName} ended. Bill: ₹${session.billAmount?.toFixed(2) ?? '0.00'}`,
          autoDismiss: true,
          autoDismissMs: 5000,
        });
      } else {
        // Update existing session energy/duration values
        updateSession(session);
      }
    },
    [updateSession, addNotification, nodes],
  );

  useEffect(() => {
    webSocketService.onMessage(handleWSMessage);
  }, [handleWSMessage]);

  // Sort sessions by startTimestamp descending (most recent first)
  const sortedSessions = [...activeSessions].sort(
    (a, b) => b.startTimestamp - a.startTimestamp,
  );

  // Helper to get node display name
  const getNodeName = (nodeId: string): string => {
    return nodes.get(nodeId)?.displayName || nodeId;
  };

  // Helper to get user display name (using userId as fallback)
  const getUserName = (session: Session): string => {
    return session.userId;
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Active Sessions</h1>
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            <p className="text-sm text-gray-500">Loading active sessions...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state with retry
  if (error) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Active Sessions</h1>
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center max-w-md">
            <p className="text-red-700 font-medium mb-2">Failed to load sessions</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
          <button
            onClick={fetchActiveSessions}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (sortedSessions.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-4">Active Sessions</h1>
        <div className="flex flex-col items-center justify-center py-12">
          <div className="text-center">
            <p className="text-gray-500 text-lg">No active charging sessions</p>
            <p className="text-sm text-gray-400 mt-1">
              Sessions will appear here when charging begins.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Session list
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Active Sessions</h1>
        <span className="text-sm text-gray-500">
          {sortedSessions.length} active session{sortedSessions.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {sortedSessions.map((session) => (
          <SessionCard
            key={session.sessionId}
            session={session}
            nodeName={getNodeName(session.nodeId)}
            userName={getUserName(session)}
          />
        ))}
      </div>
    </div>
  );
}
