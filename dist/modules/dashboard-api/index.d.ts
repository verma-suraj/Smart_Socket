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
export declare class DashboardApi implements IDashboardApi {
    private readonly nodeRegistry;
    private readonly sessionManager;
    private readonly almEngine;
    private readonly wsServer;
    private readonly latestTelemetry;
    constructor(deps: DashboardApiDeps);
    /**
     * Get all active registered nodes.
     */
    getNodes(): NodeRecord[];
    /**
     * Get the latest telemetry payload for a specific node.
     */
    getNodeTelemetry(nodeId: string): TelemetryPayload | null;
    /**
     * Get all currently active sessions across all nodes.
     */
    getActiveSessions(): Session[];
    /**
     * Get session history for a specific user with optional filters.
     */
    getUserSessions(userId: string, filters?: SessionFilters): Promise<Session[]>;
    /**
     * Update the ALM load threshold.
     */
    setThreshold(value: number): void;
    /**
     * Register a new node.
     */
    registerNode(params: RegisterNodeParams): Promise<NodeRecord>;
    /**
     * Emit a telemetry update via WebSocket and store latest payload.
     */
    emitTelemetryUpdate(nodeId: string, payload: TelemetryPayload): void;
    /**
     * Emit a node status change via WebSocket.
     */
    emitNodeStatusChange(nodeId: string, status: NodeStatus): void;
    /**
     * Emit an ALM event via WebSocket.
     */
    emitAlmEvent(event: AlmEvent): void;
    /**
     * Emit a session update via WebSocket.
     */
    emitSessionUpdate(session: Session): void;
}
//# sourceMappingURL=index.d.ts.map