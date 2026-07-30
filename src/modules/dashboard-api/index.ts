import { INodeRegistry } from '../../interfaces/node-registry.interface.js';
import { ISessionManager } from '../../interfaces/session-manager.interface.js';
import { IAlmEngine } from '../../interfaces/alm-engine.interface.js';
import { IDashboardApi, NodeStatus, AlmEvent } from '../../interfaces/dashboard-api.interface.js';
import { NodeRecord, TelemetryPayload, Session, SessionFilters, RegisterNodeParams } from '../../models/index.js';
import { WebSocketServer } from './websocket-server.js';

export { createRestRoutes } from './rest-routes.js';
export { firebaseAuthMiddleware } from './auth-middleware.js';
export { WebSocketServer } from './websocket-server.js';

/**
 * Dependencies required by the DashboardApi module.
 */
export interface DashboardApiDeps {
  nodeRegistry: INodeRegistry;
  sessionManager: ISessionManager;
  almEngine: IAlmEngine;
  wsServer: WebSocketServer;
}

/**
 * Dashboard API composition module.
 *
 * Implements IDashboardApi by delegating to the appropriate dependencies:
 * - Node queries → INodeRegistry
 * - Telemetry → internal Map of latest payloads
 * - Sessions → ISessionManager + INodeRegistry
 * - ALM config → IAlmEngine
 * - Real-time push → WebSocketServer
 *
 * Validates: Requirements 13.1, 13.2, 13.4, 13.5
 */
export class DashboardApi implements IDashboardApi {
  private readonly nodeRegistry: INodeRegistry;
  private readonly sessionManager: ISessionManager;
  private readonly almEngine: IAlmEngine;
  private readonly wsServer: WebSocketServer;
  private readonly latestTelemetry: Map<string, TelemetryPayload> = new Map();

  constructor(deps: DashboardApiDeps) {
    this.nodeRegistry = deps.nodeRegistry;
    this.sessionManager = deps.sessionManager;
    this.almEngine = deps.almEngine;
    this.wsServer = deps.wsServer;
  }

  /**
   * Get all active registered nodes.
   */
  getNodes(): NodeRecord[] {
    return this.nodeRegistry.getAllActiveNodes();
  }

  /**
   * Get the latest telemetry payload for a specific node.
   */
  getNodeTelemetry(nodeId: string): TelemetryPayload | null {
    return this.latestTelemetry.get(nodeId) ?? null;
  }

  /**
   * Get all currently active sessions across all nodes.
   */
  getActiveSessions(): Session[] {
    const nodes = this.nodeRegistry.getAllActiveNodes();
    const sessions: Session[] = [];

    for (const node of nodes) {
      const session = this.sessionManager.getActiveSession(node.nodeId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Get session history for a specific user with optional filters.
   */
  async getUserSessions(userId: string, filters?: SessionFilters): Promise<Session[]> {
    return this.sessionManager.getSessionHistory(userId, filters);
  }

  /**
   * Update the ALM load threshold.
   */
  setThreshold(value: number): void {
    void this.almEngine.setThreshold(value);
  }

  /**
   * Register a new node.
   */
  async registerNode(params: RegisterNodeParams): Promise<NodeRecord> {
    return this.nodeRegistry.registerNode(params);
  }

  /**
   * Emit a telemetry update via WebSocket and store latest payload.
   */
  emitTelemetryUpdate(nodeId: string, payload: TelemetryPayload): void {
    this.latestTelemetry.set(nodeId, payload);
    this.wsServer.emitTelemetryUpdate(nodeId, payload);
  }

  /**
   * Emit a node status change via WebSocket.
   */
  emitNodeStatusChange(nodeId: string, status: NodeStatus): void {
    this.wsServer.emitNodeStatusChange(nodeId, status);
  }

  /**
   * Emit an ALM event via WebSocket.
   */
  emitAlmEvent(event: AlmEvent): void {
    this.wsServer.emitAlmEvent(event);
  }

  /**
   * Emit a session update via WebSocket.
   */
  emitSessionUpdate(session: Session): void {
    this.wsServer.emitSessionUpdate(session);
  }
}
