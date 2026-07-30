# Requirements Document

## Introduction

This document defines the backend system requirements for the ESP32-S3 Smart Socket EV Charging Platform (Phase 1). The backend is responsible for receiving real-time telemetry from multiple ESP32-S3 nodes via MQTT, performing Adaptive Load Management (ALM), managing user authentication through RFID, tracking charging sessions, and providing a web dashboard for monitoring and control. The architecture must be modular, cloud-hosted, and capable of scaling to an arbitrary number of ESP32 devices without core code changes.

## Glossary

- **Backend**: The cloud-hosted server application that receives telemetry, executes ALM logic, manages sessions, and serves the web dashboard
- **ESP32_Node**: A single ESP32-S3 microcontroller unit representing one smart socket, identified by a unique node_id
- **MQTT_Broker**: The cloud-hosted MQTT message broker (e.g., Mosquitto, EMQX, HiveMQ) that relays messages between ESP32_Nodes and the Backend
- **ALM_Engine**: The Adaptive Load Management module within the Backend that monitors aggregate load and enforces threshold-based socket control
- **Dashboard**: The web-based user interface served by the Backend for administrators and end users
- **Telemetry_Payload**: A JSON message published by an ESP32_Node containing voltage, current, power, frequency, power factor, temperature, and timestamp readings
- **Total_Transformer_Load**: The sum of active power readings from all currently active (relay ON) ESP32_Nodes
- **Load_Threshold**: The configurable maximum allowed Total_Transformer_Load, set via a dynamic slider on the Dashboard
- **Temperature_Threshold**: The hardcoded safety limit of 40°C per socket; exceeding this triggers an immediate turn-off command
- **Priority_Score**: A calculated value for each active socket based on estimated remaining charge time; higher estimated time yields higher priority (less likely to be turned off)
- **Session**: A continuous period during which a socket is assigned to a user and the relay is active, tracking time and energy consumed
- **RFID_UID**: The unique identifier read from an RFID card, used to authenticate and associate a user with a socket
- **Session_Bill**: The calculated electricity bill generated at the end of each charging session based on total energy consumed and applicable rate
- **Guest_Mode**: A charging mode where a user charges without a registered profile; guest sessions receive the lowest priority score
- **Node_Registry**: The Backend module responsible for dynamically registering, tracking, and managing ESP32_Nodes

## Requirements

### Requirement 1: MQTT Telemetry Ingestion

**User Story:** As the Backend, I want to receive real-time telemetry from all connected ESP32_Nodes via MQTT, so that I can monitor socket states and perform load calculations.

#### Acceptance Criteria

1. WHEN an ESP32_Node publishes a Telemetry_Payload to topic `alm/node/{node_id}/telemetry`, THE Backend SHALL parse and store the voltage, current, power, frequency, power factor, temperature, and timestamp values associated with that node_id.
2. THE Backend SHALL maintain a persistent connection to the MQTT_Broker and subscribe to telemetry topics for all registered ESP32_Nodes.
3. IF the Backend loses connection to the MQTT_Broker, THEN THE Backend SHALL attempt reconnection with exponential backoff and log the disconnection event.
4. IF a Telemetry_Payload contains malformed or missing fields, THEN THE Backend SHALL discard the payload, log a warning with the node_id, and continue processing subsequent messages.
5. THE Backend SHALL use the power value directly from the Telemetry_Payload without performing its own power calculation, as power is measured by the PZEM-004T sensor.
6. THE Backend SHALL support concurrent telemetry ingestion from an unlimited number of ESP32_Nodes without degradation of processing for existing nodes.

### Requirement 2: Device Registration and Management

**User Story:** As an administrator, I want to dynamically add or remove ESP32_Nodes from the system, so that scaling the deployment does not require code changes.

#### Acceptance Criteria

1. WHEN a new ESP32_Node is registered via the Dashboard, THE Node_Registry SHALL create a record with the node_id, assign MQTT topic subscriptions, and begin accepting telemetry from that node.
2. WHEN an ESP32_Node is removed via the Dashboard, THE Node_Registry SHALL unsubscribe from its MQTT topics, mark the node as inactive, and exclude it from ALM calculations.
3. THE Node_Registry SHALL store metadata for each ESP32_Node including node_id, display name, location label, registration date, and active status.
4. THE Backend SHALL allow addition of new ESP32_Nodes through configuration or Dashboard interaction without requiring redeployment or changes to core application code.

### Requirement 3: Temperature Safety Override

**User Story:** As the system, I want to immediately turn off any socket that exceeds the temperature threshold, so that hardware damage and fire hazards are prevented.

#### Acceptance Criteria

1. WHEN a Telemetry_Payload reports a temperature value exceeding 40°C for a given node_id, THE Backend SHALL immediately publish a relay-off command to that ESP32_Node via MQTT topic `alm/node/{node_id}/command`.
2. THE Backend SHALL execute the temperature safety override independently of ALM priority calculations, with higher precedence than any other control logic.
3. WHEN a temperature safety override is triggered, THE Backend SHALL log the event with node_id, recorded temperature, and timestamp.
4. WHILE an ESP32_Node is in temperature-override state, THE Backend SHALL reject any relay-on commands for that node until a subsequent Telemetry_Payload reports temperature below 38°C (2°C hysteresis band).

### Requirement 4: Adaptive Load Management Engine

**User Story:** As an administrator, I want the system to automatically manage total load by turning off low-priority sockets when the aggregate load exceeds the threshold, so that the transformer is protected from overload.

#### Acceptance Criteria

1. THE ALM_Engine SHALL continuously compute Total_Transformer_Load by summing the active power values from the most recent Telemetry_Payload of all active ESP32_Nodes.
2. WHEN Total_Transformer_Load exceeds the Load_Threshold, THE ALM_Engine SHALL identify the active socket with the lowest Priority_Score and publish a relay-off command to that ESP32_Node.
3. WHILE Total_Transformer_Load remains above the Load_Threshold after turning off one socket, THE ALM_Engine SHALL repeat the process of turning off the next lowest-priority active socket until Total_Transformer_Load falls below the Load_Threshold.
4. WHEN the Load_Threshold is updated via the Dashboard slider, THE ALM_Engine SHALL immediately use the new threshold value for subsequent calculations without requiring a restart.
5. THE ALM_Engine SHALL recalculate Total_Transformer_Load each time a new Telemetry_Payload is received from any active node.

### Requirement 5: Priority Calculation

**User Story:** As the system, I want to calculate a priority score for each active socket based on estimated remaining charge time, so that ALM decisions preserve sockets that need the most charging time.

#### Acceptance Criteria

1. WHEN a charging session starts, THE Backend SHALL calculate the Priority_Score using the formula: estimated_charge_time = (battery_capacity × (1 - initial_SOC)) / charger_power_rating.
2. IF the user does not provide an initial SOC value, THEN THE Backend SHALL default the initial SOC to 20% for priority calculation.
3. IF a session is started in Guest_Mode without EV specifications, THEN THE Backend SHALL assign a static lowest Priority_Score of 0 to that socket.
4. IF two or more active sockets have equal Priority_Scores, THEN THE ALM_Engine SHALL select the socket with the longest continuous running duration as the tie-breaker (turned off first).
5. THE Backend SHALL recalculate Priority_Score when session parameters change or when a new session begins on a socket.

### Requirement 6: RFID Authentication

**User Story:** As a user, I want to tap my RFID card on the smart socket to authenticate and start a charging session, so that I can securely access the system without manual login.

#### Acceptance Criteria

1. WHEN an ESP32_Node publishes an RFID_UID to topic `alm/node/{node_id}/rfid`, THE Backend SHALL look up the RFID_UID in the user database.
2. IF the RFID_UID matches a registered user, THEN THE Backend SHALL assign that socket to the user, publish a relay-on command to the ESP32_Node, and create a new Session record.
3. IF the RFID_UID does not match any registered user, THEN THE Backend SHALL publish an access-denied response to the ESP32_Node and log the failed authentication attempt with node_id and RFID_UID.
4. THE Backend SHALL complete RFID authentication and respond to the ESP32_Node within 3 seconds of receiving the RFID_UID message.

### Requirement 7: User Profile Management

**User Story:** As an administrator, I want to create and manage user profiles with EV specifications and RFID card assignments, so that the system can calculate priorities and authenticate users.

#### Acceptance Criteria

1. WHEN a new user profile is created via the Dashboard, THE Backend SHALL store the user's name, EV type (2-wheeler or 4-wheeler), brand, battery capacity (kWh), battery type, charger type, and charger power rating (kW).
2. THE Backend SHALL assign a unique user_id to each new profile and allow association of one or more RFID_UIDs to that user.
3. WHEN user profile details are updated via the Dashboard, THE Backend SHALL persist the changes and use updated values for all subsequent Priority_Score calculations.
4. THE Backend SHALL validate that required fields (name, battery capacity, charger power rating) are present before creating a user profile.
5. IF a required field is missing during profile creation, THEN THE Backend SHALL return a descriptive error message indicating which fields are missing.

### Requirement 8: Charging Session Management

**User Story:** As a user, I want to track my charging sessions with time and energy consumption data, so that I can see my bill at the end of each session.

#### Acceptance Criteria

1. WHEN a socket is assigned to a user and the relay is activated, THE Backend SHALL create a Session record capturing user_id, node_id, start_timestamp, session_type (owner or guest), and initial parameters.
2. WHILE a Session is active, THE Backend SHALL continuously accumulate energy consumed (kWh) and track elapsed session time using incoming Telemetry_Payloads.
3. WHEN the relay is deactivated (user ends session, ALM override, or safety override), THE Backend SHALL finalize the Session record with end_timestamp, total_time, total_energy_consumed, and calculated Session_Bill.
4. WHEN a session ends, THE Dashboard SHALL display the total energy consumed and the session bill amount to the user.
5. THE Backend SHALL calculate the Session_Bill based on total energy consumed (kWh) multiplied by the configured per-unit rate.

### Requirement 9: Session History Management

**User Story:** As a user, I want to view and manage my session history, so that I can review past charging activity.

#### Acceptance Criteria

1. THE Dashboard SHALL display all previous sessions for a user including session_type, start_time, end_time, energy_consumed, and session bill amount.
2. WHEN a user deletes a session log entry from the Dashboard, THE Backend SHALL remove the session from the visible session history.
3. WHEN a user requests to clear all session history, THE Backend SHALL remove all visible session logs.
4. THE Dashboard SHALL allow filtering session history by date range, session_type, and node_id.

### Requirement 10: Relay Command Interface

**User Story:** As the Backend, I want to send relay on/off commands to specific ESP32_Nodes via MQTT, so that I can control socket states for ALM, safety, and user actions.

#### Acceptance Criteria

1. WHEN the Backend determines a socket must be turned on or off, THE Backend SHALL publish a command message to MQTT topic `alm/node/{node_id}/command` with a JSON payload containing the desired relay state and a command timestamp.
2. THE Backend SHALL use QoS level 1 for all command messages to ensure at-least-once delivery to the MQTT_Broker.
3. IF a command acknowledgment is not received from the ESP32_Node within 5 seconds, THEN THE Backend SHALL retry the command up to 3 times before logging a delivery failure.
4. THE Backend SHALL maintain a command log recording all relay commands issued, including node_id, command_type, timestamp, and delivery status.

### Requirement 11: Dashboard Load Threshold Control

**User Story:** As an administrator, I want to dynamically adjust the total transformer load threshold via a slider on the Dashboard, so that I can adapt the system to changing grid conditions without code changes.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a slider control that allows setting the Load_Threshold value in watts (W) or kilowatts (kW).
2. WHEN the administrator adjusts the slider, THE Dashboard SHALL send the updated Load_Threshold to the Backend in real-time.
3. WHEN the Backend receives a new Load_Threshold value, THE ALM_Engine SHALL apply the new threshold immediately to all subsequent load comparisons.
4. THE Backend SHALL persist the current Load_Threshold value so that it survives server restarts.
5. THE Dashboard SHALL display the current Total_Transformer_Load alongside the Load_Threshold for visual comparison.

### Requirement 12: Guest Mode Charging

**User Story:** As a guest user, I want to charge my EV without a registered profile, so that visitors can use the system with reduced priority.

#### Acceptance Criteria

1. WHEN a registered user selects "Charge as Guest" on the Dashboard, THE Backend SHALL prompt for EV specifications (battery capacity, battery type, charger type, charger power rating) for that session only.
2. WHEN guest EV specifications are provided, THE Backend SHALL use those values for Priority_Score calculation for that session.
3. IF guest EV specifications are not provided, THEN THE Backend SHALL assign a Priority_Score of 0 (static lowest priority) to the guest session.
4. THE Backend SHALL create a Session record for guest charges with session_type set to "guest" and associate it with the user's profile for billing purposes.
5. WHEN a guest session ends, THE Backend SHALL display the total energy consumed and session bill amount the same way as owner sessions.

### Requirement 13: Real-Time Dashboard Updates

**User Story:** As an administrator, I want the Dashboard to display live telemetry and system state, so that I can monitor all sockets in real-time.

#### Acceptance Criteria

1. THE Dashboard SHALL display real-time voltage, current, power, frequency, power factor, and temperature readings for each active ESP32_Node.
2. WHEN a new Telemetry_Payload is processed by the Backend, THE Dashboard SHALL update the displayed values for the corresponding node within 2 seconds.
3. THE Dashboard SHALL display the active/inactive status of each registered ESP32_Node.
4. THE Dashboard SHALL display the current Priority_Score and session information for each active socket.
5. IF an ESP32_Node has not sent telemetry for more than 30 seconds, THEN THE Dashboard SHALL indicate that node as "offline" or "stale".

### Requirement 14: Cloud Deployment and Accessibility

**User Story:** As a user, I want to access the Dashboard from anywhere over the internet, so that I am not limited to a local network.

#### Acceptance Criteria

1. THE Backend SHALL be deployed on a cloud platform (e.g., Firebase, AWS, or similar) accessible over the public internet via HTTPS.
2. THE Backend SHALL serve the Dashboard as a web application accessible from any standard web browser without installing additional software.
3. THE MQTT_Broker SHALL be hosted on a cloud service accessible to ESP32_Nodes over the public internet with TLS encryption.
4. THE Backend SHALL authenticate all Dashboard access with user credentials before granting access to any system data or controls.

### Requirement 15: Modular Architecture

**User Story:** As a developer, I want the backend to be structured in independent modules, so that future changes (like switching from WiFi/MQTT to CAN bus) can be integrated without rewriting the entire system.

#### Acceptance Criteria

1. THE Backend SHALL separate concerns into distinct modules: MQTT communication, ALM engine, authentication, session management, device registry, and Dashboard API.
2. THE Backend SHALL define clear interfaces between modules so that replacing one module (e.g., MQTT transport with CAN bus aggregator in Phase 2) does not require changes to other modules.
3. THE Backend SHALL use a configuration-driven approach for transport-layer settings (broker URL, topics, QoS) so that changing communication parameters does not require code modifications.
4. THE Backend SHALL organize code so that each module can be independently tested without requiring the full system to be running.
