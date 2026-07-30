import { useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { useTelemetryStore } from '../stores/telemetry.store';
import { useNodeStore } from '../stores/node.store';
import { useSessionStore } from '../stores/session.store';
import { useUIStore } from '../stores/ui.store';
import { webSocketService } from '../services/websocket.service';
import type { WSMessage } from '../types';

/**
 * Determines the WebSocket server URL based on the current environment.
 * In production, derives from window.location; in dev, uses env var or defaults.
 */
function getWebSocketUrl(): string {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL as string;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Hook that wires the WebSocket service to Zustand stores and the notification system.
 *
 * Responsibilities:
 * - Connects WebSocket when the user is authenticated (user + token present)
 * - Routes incoming messages to the correct stores:
 *   • telemetry → TelemetryStore.updateTelemetry
 *   • node_status → NodeStore.updateNodeStatus + UIStore notifications/events
 *   • alm_event → UIStore notifications + event log
 *   • session_update → SessionStore.updateSession + UIStore notifications
 * - Tracks connection status in UIStore
 * - Disconnects WebSocket on logout (user becomes null)
 *
 * Validates: Requirements 2.1, 2.2, 2.5, 2.6, 13.1, 13.2, 13.3
 */
export function useWebSocketIntegration(): void {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);

  // Keep a ref to track whether we've connected so we can properly disconnect on logout
  const isConnectedRef = useRef(false);
  // Track polling interval for connection status
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Get store actions (call outside of the message handler for performance)
    const { updateTelemetry } = useTelemetryStore.getState();
    const { updateNodeStatus } = useNodeStore.getState();
    const { updateSession } = useSessionStore.getState();
    const { addNotification, addEvent, setConnectionStatus } = useUIStore.getState();

    /**
     * Look up node display name from the NodeStore.
     * Falls back to nodeId if not found.
     */
    function getNodeDisplayName(nodeId: string): string {
      const nodeState = useNodeStore.getState();
      const node = nodeState.nodes.get(nodeId);
      return node?.displayName ?? nodeId;
    }

    /**
     * Route a parsed WebSocket message to the appropriate stores.
     */
    function handleMessage(message: WSMessage): void {
      switch (message.type) {
        case 'telemetry': {
          updateTelemetry(message.nodeId, message.payload);
          break;
        }

        case 'node_status': {
          updateNodeStatus(message.nodeId, message.status);
          const nodeName = getNodeDisplayName(message.nodeId);

          // Add event to event log for all node_status changes
          addEvent({
            type: message.status === 'offline' ? 'node_offline' : 'node_override',
            nodeId: message.nodeId,
            nodeName,
            message:
              message.status === 'offline'
                ? `Node "${nodeName}" went offline`
                : message.status === 'override'
                  ? `Node "${nodeName}" entered temperature override`
                  : `Node "${nodeName}" is now online`,
            timestamp: Date.now(),
            severity:
              message.status === 'offline'
                ? 'warning'
                : message.status === 'override'
                  ? 'critical'
                  : 'info',
          });

          // Notification for offline nodes (Req 13.2)
          if (message.status === 'offline') {
            addNotification({
              type: 'warning',
              title: 'Node Offline',
              message: `${nodeName} went offline at ${new Date().toLocaleTimeString()}`,
              autoDismiss: true,
              autoDismissMs: 10000,
            });
          }

          // Notification for override nodes (Req 13.3)
          if (message.status === 'override') {
            addNotification({
              type: 'error',
              title: 'Temperature Override',
              message: `Temperature safety override active on ${nodeName}`,
              autoDismiss: false,
            });
          }
          break;
        }

        case 'alm_event': {
          const { event } = message;
          const nodeName = getNodeDisplayName(event.nodeId);

          // Critical notification for ALM shedding (Req 13.1)
          addNotification({
            type: 'error',
            title: 'ALM Shedding Event',
            message: `Node "${nodeName}" shed: ${event.reason} at ${new Date(event.timestamp).toLocaleTimeString()}`,
            autoDismiss: false,
          });

          // Add to event log
          addEvent({
            type: 'alm_shedding',
            nodeId: event.nodeId,
            nodeName,
            message: `ALM shed node "${nodeName}": ${event.reason}`,
            timestamp: event.timestamp,
            severity: 'critical',
          });
          break;
        }

        case 'session_update': {
          const { session } = message;
          updateSession(session);

          // Notify if session ended
          if (!session.active) {
            const nodeName = getNodeDisplayName(session.nodeId);
            addNotification({
              type: 'info',
              title: 'Session Ended',
              message: `Charging session on ${nodeName} ended. Bill: ₹${session.billAmount?.toFixed(2) ?? '0.00'}`,
              autoDismiss: true,
              autoDismissMs: 5000,
            });

            addEvent({
              type: 'session_ended',
              nodeId: session.nodeId,
              nodeName,
              message: `Session ended on "${nodeName}" — ₹${session.billAmount?.toFixed(2) ?? '0.00'}`,
              timestamp: Date.now(),
              severity: 'info',
            });
          }
          break;
        }
      }
    }

    // When user is authenticated, connect WebSocket
    if (user && token) {
      const wsUrl = getWebSocketUrl();
      webSocketService.connect(wsUrl);
      webSocketService.onMessage(handleMessage);
      isConnectedRef.current = true;

      // Poll connection status and update UIStore
      setConnectionStatus(webSocketService.getStatus());
      statusIntervalRef.current = setInterval(() => {
        setConnectionStatus(webSocketService.getStatus());
      }, 1000);
    } else {
      // User logged out or not authenticated — disconnect
      if (isConnectedRef.current) {
        webSocketService.disconnect();
        isConnectedRef.current = false;
        setConnectionStatus('disconnected');
      }

      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
    }

    // Cleanup on unmount or dependency change
    return () => {
      if (statusIntervalRef.current) {
        clearInterval(statusIntervalRef.current);
        statusIntervalRef.current = null;
      }
      if (isConnectedRef.current) {
        webSocketService.disconnect();
        isConnectedRef.current = false;
      }
    };
  }, [user, token]);
}
