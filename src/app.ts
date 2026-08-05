import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

import { config } from './config/index.js';
import { MqttTransport } from './modules/mqtt-transport/index.js';
import { TemperatureMonitor } from './modules/temperature-monitor/index.js';
import { AlmEngine } from './modules/alm-engine/index.js';
import { PriorityCalculator } from './modules/priority-calculator/index.js';
import { SessionManager } from './modules/session-manager/index.js';
import { AuthModule } from './modules/auth/index.js';
import { NodeRegistry } from './modules/node-registry/index.js';
import {
  DashboardApi,
  WebSocketServer,
  createRestRoutes,
  firebaseAuthMiddleware,
} from './modules/dashboard-api/index.js';

import type { TelemetryPayload, RelayCommand } from './models/index.js';

/**
 * Application bootstrap — initializes all modules, wires event handlers,
 * and starts the Express + WebSocket servers.
 *
 * Validates: Requirements 15.1, 15.2
 */
export async function bootstrap(): Promise<{
  httpServer: HttpServer;
  shutdown: () => Promise<void>;
}> {
  // ─── 1. Firebase Admin SDK Initialization ─────────────────────────────────

  if (!admin.apps.length) {
    const initOptions: admin.AppOptions = {
      projectId: config.firebase.projectId,
    };

    if (config.firebase.serviceAccountPath) {
      const serviceAccount = JSON.parse(
        readFileSync(config.firebase.serviceAccountPath, 'utf-8')
      );
      initOptions.credential = admin.credential.cert(serviceAccount);
    }

    admin.initializeApp(initOptions);
  }

  const firestore: Firestore = admin.firestore();

  // ─── 2. Module Instantiation ──────────────────────────────────────────────

  const mqttTransport = new MqttTransport();
  const temperatureMonitor = new TemperatureMonitor(firestore);
  const almEngine = new AlmEngine(firestore, temperatureMonitor);
  const priorityCalculator = new PriorityCalculator();
  const sessionManager = new SessionManager();
  const authModule = new AuthModule(firestore);

  const nodeRegistry = new NodeRegistry(firestore, {
    onRegister: (nodeId: string) => {
      mqttTransport.subscribe(nodeId);
      console.log(`[App] Node registered, subscribed to MQTT topics: ${nodeId}`);
    },
    onDeregister: (nodeId: string) => {
      mqttTransport.unsubscribe(nodeId);
      almEngine.removeNodePriority(nodeId);
      console.log(`[App] Node deregistered, unsubscribed from MQTT: ${nodeId}`);
    },
  });

  const wsServer = new WebSocketServer();

  const dashboardApi = new DashboardApi({
    nodeRegistry,
    sessionManager,
    almEngine,
    wsServer,
  });

  // ─── 3. Telemetry Timestamps (for energy delta calculations) ──────────────

  const lastTelemetryTimestamps: Map<string, number> = new Map();

  // ─── 4. Wire MQTT Telemetry Events ───────────────────────────────────────

  mqttTransport.onTelemetry(async (nodeId: string, payload: TelemetryPayload) => {
    try {
      // (1) Temperature safety check
      const safetyAction = temperatureMonitor.checkTemperature(nodeId, payload.temperature);

      if (safetyAction.action === 'shutdown') {
        // Publish relay-off for safety
        const shutdownCommand: RelayCommand = {
          relay_state: 'off',
          timestamp: Date.now(),
          reason: 'safety',
        };
        await mqttTransport.publishCommand(nodeId, shutdownCommand);

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
        const shedCommand: RelayCommand = {
          relay_state: 'off',
          timestamp: Date.now(),
          reason: 'alm',
        };
        await mqttTransport.publishCommand(shed.nodeId, shedCommand);

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
    } catch (error) {
      console.error(`[App] Error processing telemetry for node=${nodeId}:`, error);
    }
  });

  // ─── 5. Wire MQTT RFID Events ────────────────────────────────────────────

  mqttTransport.onRfidScan(async (nodeId: string, rfidUid: string) => {
    try {
      // (1) Authenticate the RFID UID
      const authResult = await authModule.authenticateRfid(nodeId, rfidUid);

      if (authResult.success && authResult.userId) {
        // Check temperature override before activating
        if (temperatureMonitor.isInOverrideState(nodeId)) {
          console.log(`[App] RFID auth success but node=${nodeId} in temperature override, blocking activation`);
          return;
        }

        // Look up user profile for session parameters + display name
        const userProfile = await authModule.getUserByRfid(rfidUid);

        // Publish relay-on command (include the user's name for the node LCD)
        const relayOnCommand: RelayCommand = {
          relay_state: 'on',
          timestamp: Date.now(),
          reason: 'auth',
          userName: userProfile?.name ?? '',
        };
        await mqttTransport.publishCommand(nodeId, relayOnCommand);

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

        console.log(`[App] RFID auth success: node=${nodeId} user=${authResult.userId} priority=${priorityScore}`);
      } else {
        // Auth failed — tell the node to show the "please open dashboard" hint
        const denyCommand: RelayCommand = {
          relay_state: 'off',
          timestamp: Date.now(),
          reason: 'auth_denied',
        };
        await mqttTransport.publishCommand(nodeId, denyCommand);
        console.log(`[App] RFID auth denied: node=${nodeId} uid=${rfidUid} error=${authResult.error}`);
      }
    } catch (error) {
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
    publishCommand: (nodeId, command) => mqttTransport.publishCommand(nodeId, command),
  });
  app.use('/api', restRouter);

  // ─── 9. HTTP + WebSocket Server ───────────────────────────────────────────

  const httpServer = createServer(app);
  wsServer.attach(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(config.server.port, config.server.host, () => {
      console.log(`[App] Server listening on ${config.server.host}:${config.server.port}`);
      resolve();
    });
  });

  // ─── 10. Graceful Shutdown ────────────────────────────────────────────────

  const shutdown = async (): Promise<void> => {
    console.log('[App] Shutting down gracefully...');

    // Close WebSocket connections
    wsServer.close();

    // Disconnect MQTT
    await mqttTransport.disconnect();

    // Close HTTP server
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => {
        if (err) reject(err);
        else resolve();
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
