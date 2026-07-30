import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock Firebase config before any store imports that depend on authService
vi.mock('../../src/config/firebase', () => ({
  auth: { currentUser: null },
  default: {},
}));

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

// Mock the WebSocket service with message simulation capability
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
      __simulateMessage: (msg: unknown) => {
        if (messageHandler) messageHandler(msg);
      },
      __resetHandler: () => {
        messageHandler = null;
      },
    },
  };
});

const mockWs = webSocketService as unknown as typeof webSocketService & {
  __simulateMessage: (msg: unknown) => void;
  __resetHandler: () => void;
};

/**
 * Integration tests for real-time data flow through the WebSocket integration hook.
 * Tests that incoming WS messages correctly update corresponding Zustand stores.
 *
 * Validates: Requirements 3.3, 4.2, 6.3, 6.4, 5.6, 13.1
 */
describe('Real-time Data Flow Integration', () => {
  beforeEach(() => {
    // Reset all stores to initial state
    useAuthStore.setState({ user: null, token: null, loading: false, error: null });
    useTelemetryStore.setState({
      telemetryByNode: new Map(),
      lastUpdateByNode: new Map(),
      totalLoad: 0,
    });
    useNodeStore.setState({
      nodes: new Map([
        [
          'node-alpha',
          {
            nodeId: 'node-alpha',
            displayName: 'Alpha Charger',
            locationLabel: 'Parking A',
            registrationDate: 1700000000000,
            active: true,
            lastSeenTimestamp: Date.now(),
            inTemperatureOverride: false,
          },
        ],
        [
          'node-beta',
          {
            nodeId: 'node-beta',
            displayName: 'Beta Charger',
            locationLabel: 'Parking B',
            registrationDate: 1700000000000,
            active: true,
            lastSeenTimestamp: Date.now(),
            inTemperatureOverride: false,
          },
        ],
      ]),
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

    // Authenticate user to enable WS connection
    useAuthStore.setState({
      user: { uid: 'integration-test-user' } as never,
      token: 'integration-test-token',
    });

    vi.clearAllMocks();
    mockWs.__resetHandler();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Test 1: Telemetry WS message updates TelemetryStore with correct values.
   * Validates: Requirement 4.2 - telemetry WS message updates displayed values
   */
  it('should update TelemetryStore with correct values when telemetry message is received', () => {
    renderHook(() => useWebSocketIntegration());

    const telemetryPayload = {
      voltage: 232.7,
      current: 15.42,
      power: 3588.3,
      frequency: 49.9,
      powerFactor: 0.97,
      temperature: 37.2,
      timestamp: 1700001000000,
    };

    act(() => {
      mockWs.__simulateMessage({
        type: 'telemetry',
        nodeId: 'node-alpha',
        payload: telemetryPayload,
      });
    });

    const state = useTelemetryStore.getState();

    // Verify the telemetry data is stored for the correct node
    expect(state.telemetryByNode.get('node-alpha')).toEqual(telemetryPayload);

    // Verify individual field values are correct
    const stored = state.telemetryByNode.get('node-alpha')!;
    expect(stored.voltage).toBe(232.7);
    expect(stored.current).toBe(15.42);
    expect(stored.power).toBe(3588.3);
    expect(stored.frequency).toBe(49.9);
    expect(stored.powerFactor).toBe(0.97);
    expect(stored.temperature).toBe(37.2);
    expect(stored.timestamp).toBe(1700001000000);

    // Verify lastUpdate timestamp is recorded
    expect(state.lastUpdateByNode.get('node-alpha')).toBeDefined();
    expect(state.lastUpdateByNode.get('node-alpha')).toBeGreaterThan(0);

    // Verify totalLoad is recomputed
    expect(state.totalLoad).toBe(3588.3);
  });

  /**
   * Test 2: node_status WS message updates NodeStore status correctly.
   * Validates: Requirement 3.3 - node_status message updates NodeCard indicator
   */
  it('should update NodeStore status when node_status message is received', () => {
    renderHook(() => useWebSocketIntegration());

    act(() => {
      mockWs.__simulateMessage({
        type: 'node_status',
        nodeId: 'node-alpha',
        status: 'offline',
      });
    });

    const nodeState = useNodeStore.getState();
    expect(nodeState.nodeStatuses.get('node-alpha')).toBe('offline');

    // Send another status update for a different node
    act(() => {
      mockWs.__simulateMessage({
        type: 'node_status',
        nodeId: 'node-beta',
        status: 'override',
      });
    });

    const updatedState = useNodeStore.getState();
    expect(updatedState.nodeStatuses.get('node-beta')).toBe('override');

    // Verify first node status unchanged
    expect(updatedState.nodeStatuses.get('node-alpha')).toBe('offline');
  });

  /**
   * Test 3: session_update WS message adds/updates session in active sessions list.
   * Validates: Requirement 6.3 - session_update updates Session_View values
   */
  it('should add and update sessions in SessionStore when session_update messages arrive', () => {
    renderHook(() => useWebSocketIntegration());

    const activeSession = {
      sessionId: 'sess-rt-1',
      userId: 'user-1',
      nodeId: 'node-alpha',
      sessionType: 'owner' as const,
      startTimestamp: Date.now() - 120000,
      endTimestamp: null,
      initialSOC: 30,
      batteryCapacity: 60,
      chargerPowerRating: 7.4,
      priorityScore: 92,
      totalEnergyConsumed: 2.4,
      totalTime: 120,
      billAmount: null,
      endReason: null,
      active: true,
      guestSpecs: null,
    };

    // Add a new active session
    act(() => {
      mockWs.__simulateMessage({
        type: 'session_update',
        session: activeSession,
      });
    });

    let sessionState = useSessionStore.getState();
    expect(sessionState.activeSessions).toHaveLength(1);
    expect(sessionState.activeSessions[0].sessionId).toBe('sess-rt-1');
    expect(sessionState.activeSessions[0].totalEnergyConsumed).toBe(2.4);

    // Update the session with new energy values
    act(() => {
      mockWs.__simulateMessage({
        type: 'session_update',
        session: {
          ...activeSession,
          totalEnergyConsumed: 4.8,
          totalTime: 240,
        },
      });
    });

    sessionState = useSessionStore.getState();
    expect(sessionState.activeSessions).toHaveLength(1);
    expect(sessionState.activeSessions[0].totalEnergyConsumed).toBe(4.8);
    expect(sessionState.activeSessions[0].totalTime).toBe(240);
  });

  /**
   * Test 4: session_update with active=false removes session and triggers notification.
   * Validates: Requirement 6.4 - ended session removed from list + notification with bill
   */
  it('should remove session from active list and display notification when session ends', () => {
    renderHook(() => useWebSocketIntegration());

    // First, add an active session
    const activeSession = {
      sessionId: 'sess-rt-2',
      userId: 'user-2',
      nodeId: 'node-alpha',
      sessionType: 'guest' as const,
      startTimestamp: Date.now() - 7200000,
      endTimestamp: null,
      initialSOC: 10,
      batteryCapacity: 40,
      chargerPowerRating: 3.3,
      priorityScore: 45,
      totalEnergyConsumed: 8.1,
      totalTime: 7200,
      billAmount: null,
      endReason: null,
      active: true,
      guestSpecs: null,
    };

    act(() => {
      mockWs.__simulateMessage({
        type: 'session_update',
        session: activeSession,
      });
    });

    expect(useSessionStore.getState().activeSessions).toHaveLength(1);

    // Now end the session
    act(() => {
      mockWs.__simulateMessage({
        type: 'session_update',
        session: {
          ...activeSession,
          endTimestamp: Date.now(),
          totalEnergyConsumed: 10.5,
          totalTime: 7500,
          billAmount: 210.0,
          endReason: 'completed',
          active: false,
        },
      });
    });

    // Session should be removed from active list
    const sessionState = useSessionStore.getState();
    expect(sessionState.activeSessions).toHaveLength(0);

    // Notification should be displayed with bill amount
    const uiState = useUIStore.getState();
    expect(uiState.notifications).toHaveLength(1);
    expect(uiState.notifications[0].title).toBe('Session Ended');
    expect(uiState.notifications[0].message).toContain('210.00');
    expect(uiState.notifications[0].message).toContain('Alpha Charger');
    expect(uiState.notifications[0].autoDismiss).toBe(true);
    expect(uiState.notifications[0].autoDismissMs).toBe(5000);

    // Event log should also record the session end
    expect(uiState.eventLog).toHaveLength(1);
    expect(uiState.eventLog[0].type).toBe('session_ended');
  });

  /**
   * Test 5: alm_event WS message triggers notification with node name and reason.
   * Validates: Requirement 5.6, 13.1 - ALM event notification with node and reason
   */
  it('should create notification with node name and reason when alm_event is received', () => {
    renderHook(() => useWebSocketIntegration());

    const almTimestamp = Date.now();

    act(() => {
      mockWs.__simulateMessage({
        type: 'alm_event',
        event: {
          type: 'shedding',
          nodeId: 'node-beta',
          reason: 'Total load exceeded 50kW threshold',
          timestamp: almTimestamp,
        },
      });
    });

    const uiState = useUIStore.getState();

    // Notification should be created
    expect(uiState.notifications).toHaveLength(1);
    const notification = uiState.notifications[0];
    expect(notification.type).toBe('error');
    expect(notification.title).toBe('ALM Shedding Event');
    expect(notification.message).toContain('Beta Charger');
    expect(notification.message).toContain('Total load exceeded 50kW threshold');
    expect(notification.autoDismiss).toBe(false); // ALM critical stays until dismissed
  });

  /**
   * Test 6: alm_event WS message creates event log entry.
   * Validates: Requirement 13.1 - ALM event logged with severity and details
   */
  it('should create event log entry when alm_event is received', () => {
    renderHook(() => useWebSocketIntegration());

    const almTimestamp = 1700005000000;

    act(() => {
      mockWs.__simulateMessage({
        type: 'alm_event',
        event: {
          type: 'shedding',
          nodeId: 'node-alpha',
          reason: 'Priority-based load shedding',
          timestamp: almTimestamp,
        },
      });
    });

    const uiState = useUIStore.getState();

    // Event log should have an entry
    expect(uiState.eventLog).toHaveLength(1);
    const event = uiState.eventLog[0];
    expect(event.type).toBe('alm_shedding');
    expect(event.nodeId).toBe('node-alpha');
    expect(event.nodeName).toBe('Alpha Charger');
    expect(event.message).toContain('Alpha Charger');
    expect(event.message).toContain('Priority-based load shedding');
    expect(event.timestamp).toBe(almTimestamp);
    expect(event.severity).toBe('critical');
  });
});
