import { Router } from 'express';
/**
 * Creates an Express Router with all dashboard REST API endpoints.
 * Uses dependency injection for all module interactions.
 */
export function createRestRoutes(deps) {
    const router = Router();
    const { nodeRegistry, sessionManager, authModule, almEngine, dashboardApi, publishCommand } = deps;
    // ─── Node Endpoints ────────────────────────────────────────────────────────
    /**
     * GET /api/nodes
     * List all nodes with status.
     */
    router.get('/nodes', (_req, res) => {
        try {
            const nodes = dashboardApi.getNodes();
            res.json({ nodes });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to retrieve nodes' });
        }
    });
    /**
     * GET /api/nodes/:nodeId/telemetry
     * Get latest telemetry for a specific node.
     */
    router.get('/nodes/:nodeId/telemetry', (req, res) => {
        try {
            const nodeId = req.params.nodeId;
            const telemetry = dashboardApi.getNodeTelemetry(nodeId);
            if (!telemetry) {
                res.status(404).json({ error: `No telemetry found for node ${nodeId}` });
                return;
            }
            res.json({ nodeId, telemetry });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to retrieve telemetry' });
        }
    });
    /**
     * POST /api/nodes
     * Register a new node.
     */
    router.post('/nodes', async (req, res) => {
        try {
            const { nodeId, displayName, locationLabel } = req.body;
            if (!nodeId || !displayName || !locationLabel) {
                res.status(400).json({ error: 'Missing required fields: nodeId, displayName, locationLabel' });
                return;
            }
            const node = await nodeRegistry.registerNode({ nodeId, displayName, locationLabel });
            res.status(201).json({ node });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to register node' });
        }
    });
    /**
     * DELETE /api/nodes/:nodeId
     * Deregister a node.
     */
    router.delete('/nodes/:nodeId', async (req, res) => {
        try {
            const nodeId = req.params.nodeId;
            await nodeRegistry.deregisterNode(nodeId);
            res.status(204).send();
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to deregister node' });
        }
    });
    // ─── Session Endpoints ─────────────────────────────────────────────────────
    /**
     * GET /api/sessions/active
     * Get all active sessions.
     */
    router.get('/sessions/active', (_req, res) => {
        try {
            const sessions = dashboardApi.getActiveSessions();
            res.json({ sessions });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to retrieve active sessions' });
        }
    });
    /**
     * GET /api/sessions/user/:userId
     * Get user session history with optional filter query params.
     * Query params: startDate, endDate, sessionType, nodeId
     */
    router.get('/sessions/user/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const filters = {};
            const startDate = req.query.startDate;
            const endDate = req.query.endDate;
            const sessionType = req.query.sessionType;
            const filterNodeId = req.query.nodeId;
            if (startDate) {
                filters.startDate = Number(startDate);
            }
            if (endDate) {
                filters.endDate = Number(endDate);
            }
            if (sessionType === 'owner' || sessionType === 'guest') {
                filters.sessionType = sessionType;
            }
            if (filterNodeId) {
                filters.nodeId = filterNodeId;
            }
            const sessions = await sessionManager.getSessionHistory(userId, filters);
            res.json({ sessions });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to retrieve session history' });
        }
    });
    /**
     * POST /api/sessions/guest
     * Start a guest session.
     * Body: { userId, nodeId, batteryCapacity, chargerPowerRating, initialSOC?, guestSpecs? }
     */
    router.post('/sessions/guest', async (req, res) => {
        try {
            const { userId, nodeId, batteryCapacity, chargerPowerRating, initialSOC, guestSpecs } = req.body;
            if (!userId || !nodeId) {
                res.status(400).json({ error: 'Missing required fields: userId, nodeId' });
                return;
            }
            const params = {
                userId,
                nodeId,
                sessionType: 'guest',
                batteryCapacity: batteryCapacity ?? 0,
                chargerPowerRating: chargerPowerRating ?? 0,
                initialSOC,
                guestSpecs: guestSpecs ?? null,
            };
            const session = await sessionManager.createSession(params);
            res.status(201).json({ session });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to start guest session' });
        }
    });
    /**
     * DELETE /api/sessions/:sessionId
     * Delete a session from history.
     */
    router.delete('/sessions/:sessionId', async (req, res) => {
        try {
            const sessionId = req.params.sessionId;
            await sessionManager.deleteSession(sessionId);
            res.status(204).send();
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to delete session' });
        }
    });
    /**
     * POST /api/nodes/:nodeId/stop
     * Stop charging on a node: publish a relay-off command and finalize the
     * active session (so the node LCD shows its summary screen).
     */
    router.post('/nodes/:nodeId/stop', async (req, res) => {
        try {
            const nodeId = req.params.nodeId;
            await publishCommand(nodeId, {
                relay_state: 'off',
                timestamp: Date.now(),
                reason: 'user',
            });
            const active = sessionManager.getActiveSession(nodeId);
            const finalized = active
                ? await sessionManager.finalizeSession(nodeId, 'user_ended')
                : null;
            res.json({ stopped: true, nodeId, session: finalized });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to stop charging' });
        }
    });
    // ─── Config Endpoints ──────────────────────────────────────────────────────
    /**
     * PUT /api/config/threshold
     * Update the ALM load threshold.
     * Body: { threshold: number } (also accepts legacy { value: number })
     */
    router.put('/config/threshold', async (req, res) => {
        try {
            // Accept `threshold` (frontend key); fall back to legacy `value`.
            const raw = req.body?.threshold ?? req.body?.value;
            if (raw === undefined || typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
                res.status(400).json({ error: 'Invalid threshold value: must be a positive number' });
                return;
            }
            await almEngine.setThreshold(raw);
            res.json({ threshold: raw });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to update threshold' });
        }
    });
    // ─── User Endpoints ────────────────────────────────────────────────────────
    /**
     * POST /api/users
     * Create a new user profile.
     * Body: UserProfileInput
     */
    router.post('/users', async (req, res) => {
        try {
            const { name, evType, brand, batteryCapacity, batteryType, chargerType, chargerPowerRating, rfidUids } = req.body;
            if (!name || !evType || !brand || batteryCapacity === undefined || !batteryType || !chargerType || chargerPowerRating === undefined) {
                res.status(400).json({ error: 'Missing required user profile fields' });
                return;
            }
            const profile = await authModule.createUser({
                name,
                evType,
                brand,
                batteryCapacity,
                batteryType,
                chargerType,
                chargerPowerRating,
                rfidUids: rfidUids ?? [],
            });
            res.status(201).json({ user: profile });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to create user profile' });
        }
    });
    /**
     * PUT /api/users/:userId
     * Update an existing user profile.
     * Body: Partial<UserProfileInput>
     */
    router.put('/users/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const updates = req.body;
            if (!updates || Object.keys(updates).length === 0) {
                res.status(400).json({ error: 'No update fields provided' });
                return;
            }
            const profile = await authModule.updateUser(userId, updates);
            res.json({ user: profile });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to update user profile' });
        }
    });
    /**
     * GET /api/users
     * List all registered user profiles.
     */
    router.get('/users', async (_req, res) => {
        try {
            const profiles = await authModule.listAllUsers();
            const users = profiles.map((p) => ({
                userId: p.userId,
                name: p.name,
                evType: p.evType,
                brand: p.brand,
                rfidUids: p.rfidUids,
                createdAt: p.createdAt,
            }));
            res.json({ users });
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to retrieve users' });
        }
    });
    /**
     * DELETE /api/users/:userId
     * Delete a user profile.
     * Returns 409 if user has an active session, 404 if user not found, 204 on success.
     */
    router.delete('/users/:userId', async (req, res) => {
        try {
            const userId = req.params.userId;
            const force = req.query.force === 'true';
            if (!force && authModule.hasActiveSession(userId)) {
                res.status(409).json({ error: 'Cannot delete user with active session' });
                return;
            }
            if (force) {
                // End any active session for this user and stop the physical socket(s).
                const nodeIds = await sessionManager.forceEndUserSessions(userId);
                for (const nodeId of nodeIds) {
                    await publishCommand(nodeId, {
                        relay_state: 'off',
                        timestamp: Date.now(),
                        reason: 'user',
                    }).catch(() => { });
                }
            }
            await authModule.deleteUser(userId);
            res.status(204).send();
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('User not found')) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });
    return router;
}
//# sourceMappingURL=rest-routes.js.map