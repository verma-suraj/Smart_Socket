import express from 'express';
import { createServer } from 'http';
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { config } from './config/index.js';
import { MqttTransport } from './modules/mqtt-transport/index.js';
import { TemperatureMonitor } from './modules/temperature-monitor/index.js';
import { AlmEngine } from './modules/alm-engine/index.js';
import { PriorityCalculator } from './modules/priority-calculator/index.js';
import { SessionManager } from './modules/session-manager/index.js';
import { AuthModule } from './modules/auth/index.js';
import { NodeRegistry } from './modules/node-registry/index.js';
import { DashboardApi, WebSocketServer, createRestRoutes, firebaseAuthMiddleware, } from './modules/dashboard-api/index.js';
import { ScanModeManager } from './modules/scan-mode/scan-mode-manager.js';
import { wireScanModeWebSocket } from './modules/scan-mode/scan-mode-ws-handler.js';
import { createCommandLogger } from './modules/command-log/index.js';
import { logger } from './modules/logger/index.js';
/**
 * Application bootstrap — initializes all modules, wires event handlers,
 * and starts the Express + WebSocket servers.
 *
 * Validates: Requirements 15.1, 15.2
 */
export async function bootstrap() {
    // ─── 1. Firebase Admin SDK Initialization ─────────────────────────────────
    if (!admin.apps.length) {
        const initOptions = {
            projectId: config.firebase.projectId,
        };
        if (config.firebase.serviceAccountPath) {
            const serviceAccount = JSON.parse(readFileSync(config.firebase.serviceAccountPath, 'utf-8'));
            initOptions.credential = admin.credential.cert(serviceAccount);
        }
        admin.initializeApp(initOptions);
    }
    const firestore = admin.firestore();
    // ─── 2. Module Instantiation ──────────────────────────────────────────────
    const mqttTransport = new MqttTransport();
    const temperatureMonitor = new TemperatureMonitor(firestore);
    const almEngine = new AlmEngine(firestore, temperatureMonitor);
    const priorityCalculator = new PriorityCalculator();
    const sessionManager = new SessionManager(firestore);
    const commandLogger = createCommandLogger(firestore);
    const scanModeManager = new ScanModeManager();
    // WebSocketServer is instantiated below; AuthModule receives it via options
    const wsServer = new WebSocketServer();
    const authModule = new AuthModule(firestore, {
        scanModeManager,
        wsServer,
    });
    const nodeRegistry = new NodeRegistry(firestore, {
        onRegister: (nodeId) => {
            mqttTransport.subscribe(nodeId);
            console.log(`[App] Node registered, subscribed to MQTT topics: ${nodeId}`);
        },
        onDeregister: (nodeId) => {
            mqttTransport.unsubscribe(nodeId);
            almEngine.removeNodePriority(nodeId);
            console.log(`[App] Node deregistered, unsubscribed from MQTT: ${nodeId}`);
        },
    });
    const dashboardApi = new DashboardApi({
        nodeRegistry,
        sessionManager,
        almEngine,
        wsServer,
    });
    // ─── 3a. Command publish + logging wrapper ────────────────────────────────
    // Single choke point for all relay commands so every command is persisted to
    // the Firestore `commandLog` collection (fire-and-forget) and logged.
    const publishAndLog = async (nodeId, command) => {
        let deliveryStatus;
        try {
            deliveryStatus = await mqttTransport.publishCommand(nodeId, command);
        }
        catch (error) {
            logger.error('App', 'Relay command publish failed', {
                nodeId,
                relayState: command.relay_state,
                reason: command.reason,
                error,
            });
            // Record the failed attempt so it is still visible in the command log.
            const failed = { delivered: false, attempts: 0, timestamp: Date.now() };
            commandLogger.logCommand(nodeId, command, failed);
            throw error;
        }
        commandLogger.logCommand(nodeId, command, deliveryStatus);
        logger.info('App', 'Relay command published', {
            nodeId,
            relayState: command.relay_state,
            reason: command.reason,
            delivered: deliveryStatus.delivered,
            attempts: deliveryStatus.attempts,
        });
        return deliveryStatus;
    };
    // ─── 3. Telemetry Timestamps (for energy delta calculations) ──────────────
    const lastTelemetryTimestamps = new Map();
    // ─── 4. Wire MQTT Telemetry Events ───────────────────────────────────────
    mqttTransport.onTelemetry(async (nodeId, payload) => {
        try {
            // (1) Temperature safety check
            const safetyAction = temperatureMonitor.checkTemperature(nodeId, payload.temperature);
            if (safetyAction.action === 'shutdown') {
                // Publish relay-off for safety
                const shutdownCommand = {
                    relay_state: 'off',
                    timestamp: Date.now(),
                    reason: 'safety',
                };
                await publishAndLog(nodeId, shutdownCommand);
                // Finalize the active session if one exists
                const activeSession = sessionManager.getActiveSession(nodeId);
                if (activeSession) {
                    await sessionManager.finalizeSession(nodeId, 'safety_override');
                    almEngine.removeNodePriority(nodeId);
                }
                console.log(`[App] Temperature shutdown for node=${nodeId} at ${payload.temperature}°C`);
            }
            // (2) Update ALM load and evaluate shedding
            almEngine.updateLoad(nodeId, payload.power);
            const shedResults = await almEngine.evaluateAndShed();
            for (const shed of shedResults) {
                const shedCommand = {
                    relay_state: 'off',
                    timestamp: Date.now(),
                    reason: 'alm',
                };
                await publishAndLog(shed.nodeId, shedCommand);
                // Finalize the shed session
                const shedSession = sessionManager.getActiveSession(shed.nodeId);
                if (shedSession) {
                    await sessionManager.finalizeSession(shed.nodeId, 'alm_override');
                    almEngine.removeNodePriority(shed.nodeId);
                }
                // Emit ALM event to dashboard
                dashboardApi.emitAlmEvent({
                    type: 'shedding',
                    nodeId: shed.nodeId,
                    reason: shed.reason,
                    timestamp: shed.timestamp,
                });
                console.log(`[App] ALM shed node=${shed.nodeId} reason=${shed.reason}`);
            }
            // (3) Update session energy using time delta
            const now = Date.now();
            const lastTimestamp = lastTelemetryTimestamps.get(nodeId);
            if (lastTimestamp) {
                const durationMs = now - lastTimestamp;
                sessionManager.updateSessionEnergy(nodeId, payload.power, durationMs);
            }
            lastTelemetryTimestamps.set(nodeId, now);
            // (4) Update node registry lastSeen
            nodeRegistry.updateLastSeen(nodeId, now);
            // (5) Emit telemetry to dashboard WebSocket
            dashboardApi.emitTelemetryUpdate(nodeId, payload);
        }
        catch (error) {
            console.error(`[App] Error processing telemetry for node=${nodeId}:`, error);
        }
    });
    // ─── 5. Wire MQTT RFID Events ────────────────────────────────────────────
    mqttTransport.onRfidScan(async (nodeId, rfidUid) => {
        try {
            // (1) Authenticate the RFID UID (scan mode interception happens inside RfidHandler)
            const authResult = await authModule.authenticateRfid(nodeId, rfidUid);
            // If the event was intercepted by scan mode, skip normal auth flow
            if (authResult.intercepted) {
                console.log(`[App] RFID event intercepted by scan mode: node=${nodeId} uid=${rfidUid}`);
                return;
            }
            // ─── Same-card logout enforcement ─────────────────────────────────────
            // If a session is already active on this node, a tap must ONLY be honored
            // when it comes from the exact card that started the session. Any other
            // card is rejected (no login, no logout).
            const existingSession = sessionManager.getActiveSession(nodeId);
            if (existingSession) {
                if (existingSession.rfidUid && existingSession.rfidUid === rfidUid) {
                    // Same card tapped again → end the session (logout).
                    await sessionManager.finalizeSession(nodeId, 'user_ended');
                    almEngine.removeNodePriority(nodeId);
                    const relayOffCommand = {
                        relay_state: 'off',
                        timestamp: Date.now(),
                        reason: 'user',
                    };
                    await publishAndLog(nodeId, relayOffCommand);
                    logger.info('App', 'RFID logout: session ended by owning card', { nodeId, rfidUid });
                }
                else {
                    // A different card (or an ownerless session) — reject the tap.
                    console.warn(`[App] RFID logout denied: node=${nodeId} uid=${rfidUid} does not own the active session ` +
                        `(owner=${existingSession.rfidUid ?? 'unknown'})`);
                }
                return;
            }
            if (authResult.success && authResult.userId) {
                // Check temperature override before activating
                if (temperatureMonitor.isInOverrideState(nodeId)) {
                    console.log(`[App] RFID auth success but node=${nodeId} in temperature override, blocking activation`);
                    return;
                }
                // Look up user profile for session parameters + display name
                const userProfile = await authModule.getUserByRfid(rfidUid);
                // Publish relay-on command (include the user's name for the node LCD)
                const relayOnCommand = {
                    relay_state: 'on',
                    timestamp: Date.now(),
                    reason: 'auth',
                    userName: userProfile?.name ?? '',
                };
                await publishAndLog(nodeId, relayOnCommand);
                const batteryCapacity = userProfile?.batteryCapacity ?? 0;
                const chargerPowerRating = userProfile?.chargerPowerRating ?? 0;
                const initialSOC = config.session.defaultSOC;
                // Create a new session
                const session = await sessionManager.createSession({
                    userId: authResult.userId,
                    nodeId,
                    sessionType: 'owner',
                    batteryCapacity,
                    chargerPowerRating,
                    initialSOC,
                    guestSpecs: null,
                    rfidUid,
                });
                // Calculate and set priority for ALM
                const priorityScore = priorityCalculator.calculatePriority({
                    batteryCapacity,
                    initialSOC,
                    chargerPowerRating,
                    isGuest: false,
                    guestSpecsProvided: false,
                });
                almEngine.setNodePriority(nodeId, priorityScore, session.startTimestamp);
                // Reset telemetry timestamp for fresh energy tracking
                lastTelemetryTimestamps.set(nodeId, Date.now());
                // Emit session update to dashboard
                dashboardApi.emitSessionUpdate(session);
                logger.info('App', 'RFID auth success: session started', {
                    nodeId,
                    userId: authResult.userId,
                    rfidUid,
                    priorityScore,
                });
            }
            else {
                // Auth failed — tell the node to show the "please open dashboard" hint
                const denyCommand = {
                    relay_state: 'off',
                    timestamp: Date.now(),
                    reason: 'auth_denied',
                };
                await publishAndLog(nodeId, denyCommand);
                logger.warn('App', 'RFID auth denied', { nodeId, rfidUid, error: authResult.error });
            }
        }
        catch (error) {
            console.error(`[App] Error processing RFID scan for node=${nodeId}:`, error);
        }
    });
    // ─── 6. Initialize Persisted State ───────────────────────────────────────
    await temperatureMonitor.loadPersistedState();
    await almEngine.initialize();
    await nodeRegistry.loadFromFirestore();
    // ─── 7. Connect MQTT Transport ───────────────────────────────────────────
    await mqttTransport.connect();
    console.log(`[App] MQTT transport connected to ${config.mqtt.brokerUrl}`);
    // Subscribe to MQTT topics for all active nodes (must be AFTER connect()).
    const activeNodes = nodeRegistry.getAllActiveNodes();
    for (const node of activeNodes) {
        mqttTransport.subscribe(node.nodeId);
        console.log(`[App] Subscribed to telemetry/rfid for active node: ${node.nodeId}`);
    }
    // ─── 8. Express App Setup ─────────────────────────────────────────────────
    const app = express();
    // JSON body parsing
    app.use(express.json());
    // Health check endpoint (no auth required)
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: Date.now() });
    });
    // Apply Firebase auth middleware to /api routes
    app.use('/api', firebaseAuthMiddleware);
    // Mount REST routes
    const restRouter = createRestRoutes({
        nodeRegistry,
        sessionManager,
        authModule,
        almEngine,
        dashboardApi,
        publishCommand: (nodeId, command) => publishAndLog(nodeId, command),
    });
    app.use('/api', restRouter);
    // ─── 9. HTTP + WebSocket Server ───────────────────────────────────────────
    const httpServer = createServer(app);
    wsServer.attach(httpServer);
    // Wire scan mode WebSocket handlers (must be after wsServer.attach)
    wireScanModeWebSocket(scanModeManager, wsServer);
    await new Promise((resolve) => {
        httpServer.listen(config.server.port, config.server.host, () => {
            console.log(`[App] Server listening on ${config.server.host}:${config.server.port}`);
            resolve();
        });
    });
    // ─── 10. Graceful Shutdown ────────────────────────────────────────────────
    const shutdown = async () => {
        console.log('[App] Shutting down gracefully...');
        // Close WebSocket connections
        wsServer.close();
        // Disconnect MQTT
        await mqttTransport.disconnect();
        // Close HTTP server
        await new Promise((resolve, reject) => {
            httpServer.close((err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
        console.log('[App] Shutdown complete.');
    };
    // Register signal handlers
    const onSignal = () => {
        shutdown()
            .then(() => process.exit(0))
            .catch((err) => {
            console.error('[App] Shutdown error:', err);
            process.exit(1);
        });
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    return { httpServer, shutdown };
}
//# sourceMappingURL=app.js.map