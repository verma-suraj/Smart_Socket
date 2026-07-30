import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock Firebase config before any store imports that depend on authService
vi.mock('../../src/config/firebase', () => ({
  auth: {
    currentUser: null,
  },
  default: {},
}));

// Mock the auth service to prevent Firebase initialization
vi.mock('../../src/services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn(),
    onAuthStateChanged: vi.fn(() => () => {}),
  },
}));

import { useWebSocketIntegration } from '../../src/hooks/useWebSocketIntegration';
import { useAuthStore } from '../../src/stores/auth.store';
import { useTelemetryStore } from '../../src/stores/telemetry.store';
import { useNodeStore } from '../../src/stores/node.store';
import { useSessionStore } from '../../src/stores/session.store';
import { useUIStore } from '../../src/stores/ui.store';
import { webSocketService } from '../../src/services/websocket.service';

// Mock the WebSocket service
vi.mock('../../src/services/websocket.service', () => {
  let messageHandler: ((msg: unknown) => void) | null = null;
  return {
    webSocketService: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onMessage: vi.fn((handler: (msg: unknown) => void) => {
        messageHandler = handler;
      }),
      getStatus: vi.fn(() => 'connected' as const),
      // Expose the handler for test simulation
      __simulateMessage: (msg: unknown) => {
        if (messageHandler) messageHandler(msg);
      },
      __resetHandler: () => {
        messageHandler = null;
      },
    },
  };
});

// Typed access to mock internals
const mockWs = webSocketService as unknown as typeof webSocketService & {
  __simulateMessage: (msg: unknown) => void;
  __resetHandler: () => void;
};

describe('useWebSocketIntegration', () => {
  beforeEach(() => {
    // Reset all stores to initial state
    useAuthStore.setState({ user: null, token: null, loading: false, error: null });
    useTelemetryStore.setState({
      telemetryByNode: new Map(),
      lastUpdateByNode: new Map(),
      totalLoad: 0,
    });
    useNodeStore.setState({
      nodes: new Map(),
      nodeStatuses: new Map(),
      loading: false,
      error: null,
    });
    useSessionStore.setState({
      activeSessions: [],
      historyCache: new Map(),
      loading: false,
      error: null,
    });
    useUIStore.setState({
      notifications: [],
      connectionStatus: 'disconnected',
      eventLog: [],
    });

    vi.clearAllMocks();
    mockWs.__resetHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should NOT connect WebSocket when user is not authenticated', () => {
    renderHook(() => useWebSocketIntegration());
    expect(webSocketService.connect).not.toHaveBeenCalled();
  });

  it('should connect WebSocket when user is authenticated', () => {
    // Simulate logged-in state
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    renderHook(() => useWebSocketIntegration());
    expect(webSocketService.connect).toHaveBeenCalledTimes(1);
    expect(webSocketService.onMessage).toHaveBeenCalledTimes(1);
  });

  it('should disconnect WebSocket when user logs out', () => {
    // Start authenticated
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    const { rerender } = renderHook(() => useWebSocketIntegration());

    // Simulate logout
    act(() => {
      useAuthStore.setState({ user: null, token: null });
    });
    rerender();

    expect(webSocketService.disconnect).toHaveBeenCalled();
  });

  it('should route telemetry messages to TelemetryStore', () => {
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    renderHook(() => useWebSocketIntegration());

    act(() => {
      mockWs.__simulateMessage({
        type: 'telemetry',
        nodeId: 'node-1',
        payload: {
          voltage: 230.5,
          current: 10.25,
          power: 2362.0,
          frequency: 50.0,
          powerFactor: 0.98,
          temperature: 35.5,
          timestamp: Date.now(),
        },
      });
    });

    const telemetryState = useTelemetryStore.getState();
    expect(telemetryState.telemetryByNode.get('node-1')).toBeDefined();
    expect(telemetryState.telemetryByNode.get('node-1')?.voltage).toBe(230.5);
  });

  it('should route node_status messages to NodeStore and add notifications for offline', () => {
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    // Add a node so the display name lookup works
    useNodeStore.setState({
      nodes: new Map([['node-1', { nodeId: 'node-1', displayName: 'Charger A', locationLabel: 'Lot 1', registrationDate: 0, active: true, lastSeenTimestamp: 0, inTemperatureOverride: false }]]),
      nodeStatuses: new Map(),
      loading: false,
      error: null,
    });

    renderHook(() => useWebSocketIntegration());

    act(() => {
      mockWs.__simulateMessage({
        type: 'node_status',
        nodeId: 'node-1',
        status: 'offline',
      });
    });

    // NodeStore should be updated
    const nodeState = useNodeStore.getState();
    expect(nodeState.nodeStatuses.get('node-1')).toBe('offline');

    // UIStore should have a warning notification
    const uiState = useUIStore.getState();
    expect(uiState.notifications.length).toBe(1);
    expect(uiState.notifications[0].type).toBe('warning');
    expect(uiState.notifications[0].title).toBe('Node Offline');

    // Event log should have an entry
    expect(uiState.eventLog.length).toBe(1);
    expect(uiState.eventLog[0].type).toBe('node_offline');
  });

  it('should route node_status override messages with critical notification', () => {
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    useNodeStore.setState({
      nodes: new Map([['node-2', { nodeId: 'node-2', displayName: 'Charger B', locationLabel: 'Lot 2', registrationDate: 0, active: true, lastSeenTimestamp: 0, inTemperatureOverride: false }]]),
      nodeStatuses: new Map(),
      loading: false,
      error: null,
    });

    renderHook(() => useWebSocketIntegration());

    act(() => {
      mockWs.__simulateMessage({
        type: 'node_status',
        nodeId: 'node-2',
        status: 'override',
      });
    });

    const uiState = useUIStore.getState();
    expect(uiState.notifications[0].type).toBe('error');
    expect(uiState.notifications[0].title).toBe('Temperature Override');
    expect(uiState.eventLog[0].severity).toBe('critical');
  });

  it('should route alm_event messages to UIStore notifications and event log', () => {
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    useNodeStore.setState({
      nodes: new Map([['node-1', { nodeId: 'node-1', displayName: 'Charger A', locationLabel: 'Lot 1', registrationDate: 0, active: true, lastSeenTimestamp: 0, inTemperatureOverride: false }]]),
      nodeStatuses: new Map(),
      loading: false,
      error: null,
    });

    renderHook(() => useWebSocketIntegration());

    act(() => {
      mockWs.__simulateMessage({
        type: 'alm_event',
        event: {
          type: 'shedding',
          nodeId: 'node-1',
          reason: 'Load exceeded threshold',
          timestamp: Date.now(),
        },
      });
    });

    const uiState = useUIStore.getState();
    expect(uiState.notifications.length).toBe(1);
    expect(uiState.notifications[0].type).toBe('error');
    expect(uiState.notifications[0].title).toBe('ALM Shedding Event');
    expect(uiState.notifications[0].autoDismiss).toBe(false);
    expect(uiState.eventLog.length).toBe(1);
    expect(uiState.eventLog[0].type).toBe('alm_shedding');
    expect(uiState.eventLog[0].severity).toBe('critical');
  });

  it('should route session_update messages to SessionStore', () => {
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    renderHook(() => useWebSocketIntegration());

    const session = {
      sessionId: 'sess-1',
      userId: 'user-1',
      nodeId: 'node-1',
      sessionType: 'owner' as const,
      startTimestamp: Date.now() - 60000,
      endTimestamp: null,
      initialSOC: 20,
      batteryCapacity: 40,
      chargerPowerRating: 7.4,
      priorityScore: 85,
      totalEnergyConsumed: 5.2,
      totalTime: 60,
      billAmount: null,
      endReason: null,
      active: true,
      guestSpecs: null,
    };

    act(() => {
      mockWs.__simulateMessage({
        type: 'session_update',
        session,
      });
    });

    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSessions.length).toBe(1);
    expect(sessionState.activeSessions[0].sessionId).toBe('sess-1');
  });

  it('should add notification when session ends', () => {
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    useNodeStore.setState({
      nodes: new Map([['node-1', { nodeId: 'node-1', displayName: 'Charger A', locationLabel: 'Lot 1', registrationDate: 0, active: true, lastSeenTimestamp: 0, inTemperatureOverride: false }]]),
      nodeStatuses: new Map(),
      loading: false,
      error: null,
    });

    renderHook(() => useWebSocketIntegration());

    act(() => {
      mockWs.__simulateMessage({
        type: 'session_update',
        session: {
          sessionId: 'sess-2',
          userId: 'user-1',
          nodeId: 'node-1',
          sessionType: 'guest',
          startTimestamp: Date.now() - 3600000,
          endTimestamp: Date.now(),
          initialSOC: 20,
          batteryCapacity: 40,
          chargerPowerRating: 7.4,
          priorityScore: 0,
          totalEnergyConsumed: 12.5,
          totalTime: 3600,
          billAmount: 150.0,
          endReason: 'completed',
          active: false,
          guestSpecs: null,
        },
      });
    });

    const uiState = useUIStore.getState();
    expect(uiState.notifications.length).toBe(1);
    expect(uiState.notifications[0].title).toBe('Session Ended');
    expect(uiState.notifications[0].message).toContain('150.00');
    expect(uiState.notifications[0].autoDismiss).toBe(true);
    expect(uiState.notifications[0].autoDismissMs).toBe(5000);

    // Event log should record session ended
    expect(uiState.eventLog.length).toBe(1);
    expect(uiState.eventLog[0].type).toBe('session_ended');
  });

  it('should update connection status in UIStore', () => {
    useAuthStore.setState({
      user: { uid: 'test-user' } as never,
      token: 'test-token',
    });

    renderHook(() => useWebSocketIntegration());

    // The mock returns 'connected', so UIStore should be set
    const uiState = useUIStore.getState();
    expect(uiState.connectionStatus).toBe('connected');
  });
});
