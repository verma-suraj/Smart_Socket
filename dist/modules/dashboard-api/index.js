export { createRestRoutes } from './rest-routes.js';
export { firebaseAuthMiddleware } from './auth-middleware.js';
export { WebSocketServer } from './websocket-server.js';
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
export class DashboardApi {
    constructor(deps) {
        this.latestTelemetry = new Map();
        this.nodeRegistry = deps.nodeRegistry;
        this.sessionManager = deps.sessionManager;
        this.almEngine = deps.almEngine;
        this.wsServer = deps.wsServer;
    }
    /**
     * Get all active registered nodes.
     */
    getNodes() {
        return this.nodeRegistry.getAllActiveNodes();
    }
    /**
     * Get the latest telemetry payload for a specific node.
     */
    getNodeTelemetry(nodeId) {
        return this.latestTelemetry.get(nodeId) ?? null;
    }
    /**
     * Get all currently active sessions across all nodes.
     */
    getActiveSessions() {
        const nodes = this.nodeRegistry.getAllActiveNodes();
        const sessions = [];
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
    async getUserSessions(userId, filters) {
        return this.sessionManager.getSessionHistory(userId, filters);
    }
    /**
     * Update the ALM load threshold.
     */
    setThreshold(value) {
        void this.almEngine.setThreshold(value);
    }
    /**
     * Register a new node.
     */
    async registerNode(params) {
        return this.nodeRegistry.registerNode(params);
    }
    /**
     * Emit a telemetry update via WebSocket and store latest payload.
     */
    emitTelemetryUpdate(nodeId, payload) {
        this.latestTelemetry.set(nodeId, payload);
        this.wsServer.emitTelemetryUpdate(nodeId, payload);
    }
    /**
     * Emit a node status change via WebSocket.
     */
    emitNodeStatusChange(nodeId, status) {
        this.wsServer.emitNodeStatusChange(nodeId, status);
    }
    /**
     * Emit an ALM event via WebSocket.
     */
    emitAlmEvent(event) {
        this.wsServer.emitAlmEvent(event);
    }
    /**
     * Emit a session update via WebSocket.
     */
    emitSessionUpdate(session) {
        this.wsServer.emitSessionUpdate(session);
    }
}
//# sourceMappingURL=index.js.map