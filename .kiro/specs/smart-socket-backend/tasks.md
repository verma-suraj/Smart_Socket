# Implementation Plan: Smart Socket Backend

## Overview

This plan implements the ESP32-S3 Smart Socket EV Charging Platform backend as a Node.js + TypeScript application deployed on Cloud Run. The system receives MQTT telemetry from ESP32 nodes, performs Adaptive Load Management, handles RFID authentication, manages charging sessions with billing, and serves a real-time dashboard via REST + WebSocket. Implementation follows a bottom-up approach: core data models and interfaces first, then individual modules, then integration wiring.

## Tasks

- [x] 1. Set up project structure, dependencies, and core interfaces
  - [x] 1.1 Initialize Node.js + TypeScript project with build configuration
    - Create `package.json` with dependencies: `mqtt`, `firebase-admin`, `express`, `ws`, `fast-check` (dev), `vitest` (dev), `typescript`
    - Create `tsconfig.json` with strict mode, ES2020 target, module resolution
    - Create directory structure: `src/`, `src/modules/`, `src/models/`, `src/config/`, `tests/unit/`, `tests/property/`, `tests/integration/`
    - _Requirements: 15.1, 15.4_

  - [x] 1.2 Define core TypeScript interfaces and data models
    - Create `src/models/telemetry.ts` — `TelemetryPayload`, `RelayCommand`, `DeliveryStatus` interfaces
    - Create `src/models/session.ts` — `Session`, `FinalizedSession`, `SessionEndReason`, `GuestSpecs`, `SessionFilters` interfaces
    - Create `src/models/user.ts` — `UserProfile`, `UserProfileInput`, `AuthResult` interfaces
    - Create `src/models/node.ts` — `NodeRecord`, `RegisterNodeParams`, `NodeDocument` interfaces
    - Create `src/models/config.ts` — `ConfigDocument`, `CommandLogDocument` interfaces
    - Create `src/models/index.ts` barrel export
    - _Requirements: 15.1, 15.2_

  - [x] 1.3 Define module interfaces (contracts)
    - Create `src/interfaces/mqtt-transport.interface.ts` — `IMqttTransport`
    - Create `src/interfaces/alm-engine.interface.ts` — `IAlmEngine`
    - Create `src/interfaces/temperature-monitor.interface.ts` — `ITemperatureMonitor`
    - Create `src/interfaces/priority-calculator.interface.ts` — `IPriorityCalculator`
    - Create `src/interfaces/session-manager.interface.ts` — `ISessionManager`
    - Create `src/interfaces/auth-module.interface.ts` — `IAuthModule`
    - Create `src/interfaces/node-registry.interface.ts` — `INodeRegistry`
    - Create `src/interfaces/dashboard-api.interface.ts` — `IDashboardApi`
    - _Requirements: 15.2, 15.3_

  - [x] 1.4 Create configuration module
    - Create `src/config/index.ts` with environment-driven config (broker URL, QoS, topics, Firestore project ID, thresholds)
    - Support `.env` loading for local development
    - _Requirements: 15.3_

- [x] 2. Implement MQTT Transport Layer
  - [x] 2.1 Implement MQTT connection manager with exponential backoff
    - Create `src/modules/mqtt-transport/connection-manager.ts`
    - Implement `connect()`, `disconnect()`, auto-reconnect with backoff: min(2^N × 1000, 60000) ms
    - Emit connection state events (connected, disconnected, reconnecting)
    - _Requirements: 1.2, 1.3_

  - [x] 2.2 Implement telemetry payload parser and validator
    - Create `src/modules/mqtt-transport/payload-parser.ts`
    - Validate all required fields (v, i, p, f, pf, t, ts) exist and are numeric
    - Return parsed `TelemetryPayload` or error indicator on malformed data
    - Use power value directly from payload (no V×I calculation)
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 2.3 Write property tests for telemetry parser
    - **Property 1: Telemetry Parsing Round-Trip**
    - **Property 2: Malformed Payload Rejection**
    - **Validates: Requirements 1.1, 1.4, 1.5**

  - [x] 2.4 Write property test for reconnection backoff
    - **Property 3: Reconnection Exponential Backoff**
    - **Validates: Requirements 1.3**

  - [x] 2.5 Implement subscription manager and publisher
    - Create `src/modules/mqtt-transport/subscription-manager.ts` — dynamic subscribe/unsubscribe per node
    - Create `src/modules/mqtt-transport/publisher.ts` — QoS 1 publishing with 5s ACK timeout, 3 retries
    - Create `src/modules/mqtt-transport/index.ts` — compose `MqttTransport` class implementing `IMqttTransport`
    - _Requirements: 1.2, 10.1, 10.2, 10.3_

  - [x] 2.6 Write property test for command retry logic
    - **Property 19: Command Message Format and Retry**
    - **Validates: Requirements 10.1, 10.2, 10.3**

- [x] 3. Checkpoint - Ensure MQTT layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement Temperature Safety Monitor
  - [x] 4.1 Implement temperature monitor with hysteresis state machine
    - Create `src/modules/temperature-monitor/index.ts`
    - Implement `checkTemperature()`: return shutdown action if T > 40°C
    - Implement override state tracking per node (in-memory + Firestore persistence)
    - Implement `canReactivate()`: allow only when T < 38°C
    - Block relay-on commands while in override state
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Write property tests for temperature safety
    - **Property 4: Temperature Safety Override Trigger**
    - **Property 5: Temperature Hysteresis State Machine**
    - **Validates: Requirements 3.1, 3.2, 3.4**

  - [x] 4.3 Write unit tests for temperature monitor boundary conditions
    - Test exact boundaries: 40.0°C, 40.01°C, 39.99°C, 38.0°C, 37.99°C
    - Test state transitions across multiple readings
    - _Requirements: 3.1, 3.4_

- [x] 5. Implement Priority Calculator
  - [x] 5.1 Implement priority score calculation
    - Create `src/modules/priority-calculator/index.ts`
    - Implement formula: `(battery_capacity × (1 - initial_SOC)) / charger_power_rating`
    - Default SOC to 0.20 when not provided
    - Return priority 0 for guest without specs
    - Implement tie-breaker: longest continuous running duration shed first
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 5.2 Write property tests for priority calculation
    - **Property 9: Priority Score Formula Correctness**
    - **Property 10: Guest Without Specs Priority Is Zero**
    - **Validates: Requirements 5.1, 5.2, 5.3, 12.2, 12.3**

- [x] 6. Implement ALM Engine
  - [x] 6.1 Implement load aggregator and threshold manager
    - Create `src/modules/alm-engine/load-aggregator.ts` — sum active power, exclude inactive/override nodes
    - Create `src/modules/alm-engine/threshold-manager.ts` — get/set threshold, persist to Firestore
    - _Requirements: 4.1, 4.4, 11.3, 11.4_

  - [x] 6.2 Implement load shedding controller
    - Create `src/modules/alm-engine/shedding-controller.ts`
    - Sort active sockets by priority (lowest first), shed iteratively until load ≤ threshold
    - Handle tie-breaker logic (longest duration shed first)
    - Create `src/modules/alm-engine/index.ts` — compose `AlmEngine` class implementing `IAlmEngine`
    - _Requirements: 4.2, 4.3, 4.5_

  - [x] 6.3 Write property tests for ALM engine
    - **Property 6: Total Load Aggregation**
    - **Property 7: ALM Shedding Selects Lowest Priority**
    - **Property 8: ALM Post-Condition — Load Below Threshold**
    - **Validates: Requirements 4.1, 4.2, 4.3, 5.4**

  - [x] 6.4 Write unit tests for ALM edge cases
    - Test zero active nodes scenario
    - Test all nodes same priority (tie-breaker)
    - Test threshold update mid-evaluation
    - _Requirements: 4.1, 4.2, 4.4_

- [x] 7. Checkpoint - Ensure ALM and safety tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Auth Module (RFID + User Profiles)
  - [x] 8.1 Implement RFID authentication lookup
    - Create `src/modules/auth/rfid-handler.ts`
    - Look up RFID_UID in Firestore `users` collection (query on `rfidUids` array)
    - Return `AuthResult` with success/failure within 3-second deadline
    - On success: trigger relay-on and session creation
    - On failure/timeout: return access-denied, log attempt
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 8.2 Implement user profile CRUD
    - Create `src/modules/auth/user-profile.ts`
    - Implement `createUser()` with field validation (name, battery_capacity, charger_power_rating required)
    - Implement `updateUser()`, `getUserByRfid()`, `assignRfid()`
    - Return descriptive error messages for missing required fields
    - Create `src/modules/auth/index.ts` — compose `AuthModule` implementing `IAuthModule`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 8.3 Write property tests for auth module
    - **Property 11: RFID Authentication — Registered User Success Path**
    - **Property 12: RFID Authentication — Unregistered UID Denial**
    - **Property 13: User Profile Validation**
    - **Property 14: User Profile Round-Trip**
    - **Validates: Requirements 6.2, 6.3, 7.1, 7.2, 7.4, 7.5**

- [x] 9. Implement Session Manager
  - [x] 9.1 Implement session lifecycle (create, update, finalize)
    - Create `src/modules/session-manager/session-lifecycle.ts`
    - `createSession()`: capture user_id, node_id, start_timestamp, session_type, initial parameters, priority score
    - `updateSessionEnergy()`: accumulate kWh from power × duration (watts × ms / 3,600,000)
    - `finalizeSession()`: set end_timestamp, total_time, total_energy, calculate bill (energy × rate)
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [x] 9.2 Implement session history (query, filter, delete)
    - Create `src/modules/session-manager/session-history.ts`
    - `getSessionHistory()`: query with filters (date range, session_type, node_id)
    - `deleteSession()`: remove single session from history
    - `clearHistory()`: remove all sessions for a user
    - Create `src/modules/session-manager/index.ts` — compose `SessionManager` implementing `ISessionManager`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 9.3 Write property tests for session manager
    - **Property 15: Energy Accumulation Correctness**
    - **Property 16: Session Bill Calculation**
    - **Property 17: Session Deletion Removes From History**
    - **Property 18: Session Filter Correctness**
    - **Validates: Requirements 8.2, 8.3, 8.5, 9.2, 9.4**

- [x] 10. Implement Node Registry
  - [x] 10.1 Implement node registration, deregistration, and health monitoring
    - Create `src/modules/node-registry/index.ts`
    - `registerNode()`: create Firestore record, trigger MQTT subscription
    - `deregisterNode()`: mark inactive, trigger MQTT unsubscription, exclude from ALM
    - `updateLastSeen()`: update timestamp on telemetry receipt
    - `getStaleNodes()`: return nodes with lastSeen > 30s ago
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 13.5_

  - [x] 10.2 Write property tests for node registry
    - **Property 20: Node Staleness Detection**
    - **Property 22: Node Deregistration Exclusion**
    - **Validates: Requirements 2.2, 13.5**

- [x] 11. Checkpoint - Ensure all module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement Dashboard API (REST + WebSocket)
  - [x] 12.1 Implement REST API endpoints
    - Create `src/modules/dashboard-api/rest-routes.ts`
    - GET `/api/nodes` — list all nodes with status
    - GET `/api/nodes/:nodeId/telemetry` — latest telemetry for a node
    - GET `/api/sessions/active` — all active sessions
    - GET `/api/sessions/user/:userId` — user session history with filter query params
    - POST `/api/nodes` — register a new node
    - DELETE `/api/nodes/:nodeId` — deregister a node
    - PUT `/api/config/threshold` — update load threshold
    - POST `/api/users` — create user profile
    - PUT `/api/users/:userId` — update user profile
    - POST `/api/sessions/guest` — start guest session
    - DELETE `/api/sessions/:sessionId` — delete session from history
    - _Requirements: 11.1, 11.2, 13.1, 13.3, 13.4, 14.2_

  - [x] 12.2 Implement Firebase Auth middleware for Dashboard API
    - Create `src/modules/dashboard-api/auth-middleware.ts`
    - Validate Firebase ID token on all API requests
    - Reject unauthenticated requests with 401 status
    - _Requirements: 14.4_

  - [x] 12.3 Write property test for dashboard authentication
    - **Property 21: Dashboard Authentication Enforcement**
    - **Validates: Requirements 14.4**

  - [x] 12.4 Implement WebSocket server for real-time push
    - Create `src/modules/dashboard-api/websocket-server.ts`
    - Emit telemetry updates on each processed payload
    - Emit node status changes (online, offline, override)
    - Emit ALM events (shedding decisions)
    - Emit session updates (start, end, energy progress)
    - Create `src/modules/dashboard-api/index.ts` — compose Dashboard API module
    - _Requirements: 13.1, 13.2, 13.4, 13.5_

- [x] 13. Implement Guest Mode Charging Flow
  - [x] 13.1 Implement guest session handling
    - Create `src/modules/session-manager/guest-handler.ts`
    - Handle "Charge as Guest" initiation from Dashboard (via REST endpoint)
    - Prompt for optional EV specs; if provided, use for priority calculation
    - If no specs provided, assign priority 0
    - Create session with session_type "guest" and associate with user profile
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 14. Wire all modules together in the application entry point
  - [x] 14.1 Create main application bootstrap
    - Create `src/app.ts` — initialize Firebase Admin SDK, MQTT transport, all modules
    - Wire MQTT telemetry events → temperature monitor → ALM engine → session energy updates → node registry
    - Wire MQTT RFID events → auth module → session manager → relay commands
    - Wire Dashboard API → ALM engine, session manager, node registry
    - Start Express server + WebSocket server
    - _Requirements: 15.1, 15.2_

  - [x] 14.2 Create Dockerfile and Cloud Run deployment config
    - Create `Dockerfile` for Node.js production build
    - Create `cloudbuild.yaml` or deployment script
    - _Requirements: 14.1, 14.3_

  - [x] 14.3 Create command logging module
    - Create `src/modules/command-log/index.ts`
    - Log all relay commands to Firestore `commandLog` collection
    - Record node_id, command_type, reason, timestamp, delivery_status, attempts
    - _Requirements: 10.4_

- [x] 15. Checkpoint - Ensure all integration wiring works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Write integration tests
  - [x] 16.1 Write MQTT end-to-end integration test
    - Connect to test broker, publish telemetry, verify processing pipeline
    - _Requirements: 1.1, 1.2_

  - [x] 16.2 Write RFID → Session flow integration test
    - Publish RFID scan, verify auth + session creation + relay command issued
    - _Requirements: 6.2, 8.1_

  - [x] 16.3 Write ALM → MQTT command flow integration test
    - Set threshold low, push high power telemetry, verify relay-off command published to lowest priority
    - _Requirements: 4.2, 4.3, 10.1_

  - [x] 16.4 Write Dashboard WebSocket integration test
    - Connect WebSocket client, push telemetry, verify real-time update received within 2 seconds
    - _Requirements: 13.2_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses **TypeScript** with **Vitest** for testing and **fast-check** for property-based tests
- All modules communicate through defined interfaces, enabling Phase 2 transport swap (CAN bus)
- Firebase Admin SDK is used server-side; Firebase Auth tokens are validated on Dashboard API requests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1", "2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5"] },
    { "id": 4, "tasks": ["2.6", "4.1", "5.1"] },
    { "id": 5, "tasks": ["4.2", "4.3", "5.2", "6.1"] },
    { "id": 6, "tasks": ["6.2"] },
    { "id": 7, "tasks": ["6.3", "6.4", "8.1", "8.2"] },
    { "id": 8, "tasks": ["8.3", "9.1", "9.2"] },
    { "id": 9, "tasks": ["9.3", "10.1"] },
    { "id": 10, "tasks": ["10.2", "12.1", "12.2"] },
    { "id": 11, "tasks": ["12.3", "12.4", "13.1"] },
    { "id": 12, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 13, "tasks": ["16.1", "16.2", "16.3", "16.4"] }
  ]
}
```
