# Requirements Document

## Introduction

This document defines the frontend requirements for the Smart Socket Dashboard — a React Single Page Application (SPA) that serves as the primary web interface for the ESP32-S3 Smart Socket EV Charging Platform. The Dashboard connects to the existing backend via REST API and WebSocket, authenticates users through Firebase Auth, and provides real-time monitoring, session management, user profile management, and Adaptive Load Management (ALM) threshold control. The application is hosted on Firebase Hosting and accessible from any modern web browser.

## Glossary

- **Dashboard**: The React SPA frontend application that provides the web user interface for the Smart Socket platform
- **Backend_API**: The existing REST API served by the backend at `/api/*` endpoints, requiring Firebase Auth tokens for access
- **WebSocket_Server**: The existing WebSocket server on the backend that pushes real-time telemetry, node status, ALM events, and session updates to connected clients
- **Firebase_Auth**: The Firebase Authentication service used for user login, session management, and generating ID tokens for API authorization
- **Node_Card**: A UI component representing a single ESP32 node, displaying its telemetry readings and status
- **Telemetry_Panel**: The section of the Dashboard displaying real-time sensor readings (voltage, current, power, frequency, power factor, temperature) for a node
- **Session_View**: The UI component displaying active or historical charging session information including energy consumed and bill amount
- **Threshold_Slider**: The UI control that allows administrators to adjust the ALM load threshold value
- **Auth_Token**: The Firebase ID token attached to all API requests as a Bearer token in the Authorization header
- **Node_Status_Indicator**: A visual indicator showing whether a node is online, offline, or in temperature override state
- **User_Profile_Form**: The form component for creating or editing user profiles with EV specifications and RFID card assignments
- **Guest_Charging_Form**: The form component for initiating a guest mode charging session with optional EV specifications

## Requirements

### Requirement 1: Firebase Authentication Integration

**User Story:** As a user, I want to log in securely using Firebase Auth, so that only authorized users can access the dashboard and system controls.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a login screen that authenticates users via Firebase_Auth using email/password credentials.
2. WHEN the user successfully authenticates, THE Dashboard SHALL store the Auth_Token and attach it as a Bearer token in the Authorization header on all subsequent Backend_API requests.
3. WHEN the Auth_Token expires, THE Dashboard SHALL automatically refresh the token using Firebase_Auth SDK without requiring the user to log in again. IF token refresh fails after 3 attempts, THEN THE Dashboard SHALL redirect the user to the login screen and clear all stored tokens.
4. IF the user is not authenticated, THEN THE Dashboard SHALL redirect all navigation attempts to the login screen.
5. WHEN the user clicks the logout button, THE Dashboard SHALL revoke the local session, clear stored tokens, and redirect to the login screen.
6. THE Dashboard SHALL display the currently authenticated user's name or email in the navigation header, truncated to 30 characters with an ellipsis if the value exceeds that length.
7. IF the user submits invalid credentials on the login screen, THEN THE Dashboard SHALL display an error message indicating that authentication failed and allow the user to retry without clearing the email input field.
8. IF any Backend_API request returns a 401 Unauthorized response during an active session, THEN THE Dashboard SHALL clear stored tokens and redirect the user to the login screen.

### Requirement 2: WebSocket Connection Management

**User Story:** As a user, I want the dashboard to maintain a persistent WebSocket connection to the backend, so that I receive live updates without manually refreshing the page.

#### Acceptance Criteria

1. WHEN the user successfully authenticates, THE Dashboard SHALL establish a WebSocket connection to the WebSocket_Server.
2. THE Dashboard SHALL listen for four message types on the WebSocket connection: `telemetry`, `node_status`, `alm_event`, and `session_update`.
3. IF the WebSocket connection is lost, THEN THE Dashboard SHALL display a connection status indicator showing "disconnected" and attempt automatic reconnection with exponential backoff starting at 1 second, doubling on each attempt, capped at a maximum delay of 30 seconds, for up to 10 consecutive attempts.
4. WHEN the WebSocket connection is re-established, THE Dashboard SHALL update the connection status indicator to "connected", reset the reconnection attempt counter to zero, and resume processing incoming messages.
5. WHEN the user logs out, THE Dashboard SHALL close the WebSocket connection by sending a close frame and release all associated resources.
6. THE Dashboard SHALL parse incoming WebSocket messages as JSON and route them to the appropriate UI component based on the message type field.
7. IF an incoming WebSocket message cannot be parsed as valid JSON or does not contain a recognized message type, THEN THE Dashboard SHALL discard the message and continue processing subsequent messages.
8. IF the Dashboard exhausts all 10 reconnection attempts without success, THEN THE Dashboard SHALL display a persistent error notification indicating the connection could not be restored and provide a manual reconnect action.

### Requirement 3: Node Overview Display

**User Story:** As an administrator, I want to see all registered nodes at a glance with their current status, so that I can quickly identify which sockets are active, offline, or in override.

#### Acceptance Criteria

1. THE Dashboard SHALL display a collection of all registered ESP32 nodes by fetching data from `GET /api/nodes` on initial load, rendering one Node_Card per node returned in the response.
2. THE Dashboard SHALL display each node as a Node_Card showing the node's display name, location label, and current Node_Status_Indicator (online, offline, or override).
3. WHEN a `node_status` WebSocket message is received, THE Dashboard SHALL update the corresponding Node_Card's Node_Status_Indicator within 1 second of message receipt without requiring a full page reload.
4. IF a node has status "override", THEN THE Node_Card SHALL display a visual warning indicator (a color or icon visually distinct from the "online" and "offline" indicators) to highlight the temperature safety condition.
5. WHEN the user clicks on a Node_Card, THE Dashboard SHALL navigate to the detailed Telemetry_Panel for that node.
6. IF the `GET /api/nodes` request fails or returns a non-200 response, THEN THE Dashboard SHALL display an error message indicating that node data could not be loaded and provide a retry option.
7. IF the `GET /api/nodes` response returns an empty node list, THEN THE Dashboard SHALL display a placeholder message indicating that no nodes are currently registered.
8. IF the WebSocket connection is lost, THEN THE Dashboard SHALL attempt to reconnect automatically within 5 seconds and display a connection status indicator to the user until the connection is restored.

### Requirement 4: Real-Time Telemetry Display

**User Story:** As an administrator, I want to see live sensor readings for each node, so that I can monitor voltage, current, power, frequency, power factor, and temperature in real time.

#### Acceptance Criteria

1. WHEN the user navigates to a node's detail view, THE Dashboard SHALL fetch the latest telemetry from `GET /api/nodes/:nodeId/telemetry` and display voltage (V), current (A), power (W), frequency (Hz), power factor, and temperature (°C) values.
2. WHEN a `telemetry` WebSocket message is received for the currently viewed node, THE Telemetry_Panel SHALL update the displayed values within 1 second of message receipt.
3. THE Telemetry_Panel SHALL display each telemetry reading with its unit label and format numerical values to the following decimal precision: voltage: 1 decimal place, current: 2 decimal places, power: 1 decimal place, frequency: 1 decimal place, power factor: 2 decimal places, temperature: 1 decimal place.
4. IF the temperature reading exceeds 38°C, THEN THE Telemetry_Panel SHALL visually distinguish the temperature value from normal readings using a warning-level color that is different from both the normal text color and the critical-level color used above 40°C.
5. IF the temperature reading exceeds 40°C, THEN THE Telemetry_Panel SHALL visually distinguish the temperature value from the warning-level color using a critical-level color and display a "Temperature Override Active" label adjacent to the temperature reading.
6. THE Telemetry_Panel SHALL display the timestamp of the last received telemetry reading in the format "YYYY-MM-DD HH:MM:SS" using the user's local timezone.
7. IF the `GET /api/nodes/:nodeId/telemetry` request fails or returns a non-success status, THEN THE Telemetry_Panel SHALL display an error message indicating that telemetry data is unavailable and SHALL NOT display stale or placeholder numerical values.
8. IF no new telemetry WebSocket message is received for the currently viewed node within 30 seconds of the last received message, THEN THE Telemetry_Panel SHALL display a visual indicator that the data may be stale, showing the elapsed time since the last update.
9. IF the WebSocket connection is lost, THEN THE Telemetry_Panel SHALL display a connectivity status indicator showing the connection is disconnected and SHALL attempt to reconnect automatically within 5 seconds.

### Requirement 5: ALM Threshold Slider Control

**User Story:** As an administrator, I want to adjust the load threshold using a slider, so that I can dynamically adapt the system's maximum allowed load based on current grid conditions.

#### Acceptance Criteria

1. THE Dashboard SHALL display a Threshold_Slider control that allows setting the Load_Threshold value in watts (W) within a range of 1 W to 100,000 W, with a step granularity of 1 W.
2. THE Threshold_Slider SHALL display the current Load_Threshold value in watts and the current Total_Transformer_Load value in watts side by side for visual comparison, updating the Total_Transformer_Load display each time a `telemetry` WebSocket message is received.
3. WHEN the administrator releases the Threshold_Slider at a position representing a value different from the current Load_Threshold, THE Dashboard SHALL send the updated value to `PUT /api/config/threshold` with the new threshold in the request body.
4. IF the API request to update the threshold fails or does not receive a response within 5 seconds, THEN THE Dashboard SHALL revert the slider to its previous position and display an error notification indicating the threshold update was unsuccessful.
5. THE Threshold_Slider SHALL enforce a minimum value of 1 W and a maximum value of 100,000 W, and SHALL prevent submission if the entered value is outside this range.
6. WHEN an `alm_event` WebSocket message is received, THE Dashboard SHALL display a notification for 10 seconds indicating the node identifier that was shed and the reason for shedding, and the notification SHALL remain visible until the 10-second duration elapses or the administrator manually dismisses it.

### Requirement 6: Active Sessions Display

**User Story:** As an administrator, I want to see all currently active charging sessions, so that I can monitor ongoing charges and their energy consumption in real time.

#### Acceptance Criteria

1. THE Dashboard SHALL display a list of all active charging sessions by fetching data from `GET /api/sessions/active` on initial load, sorted by start time in descending order (most recent first).
2. THE Dashboard SHALL display each active session's node display name, user name, session type (owner or guest), start time, elapsed duration, current energy consumed (kWh), and priority score.
3. WHEN a `session_update` WebSocket message is received for an active session, THE Dashboard SHALL update the corresponding Session_View with the new energy and duration values within 1 second.
4. WHEN a `session_update` WebSocket message indicates a session has ended (active = false), THE Dashboard SHALL remove the session from the active sessions list and display a notification showing the final bill amount for 5 seconds before auto-dismissing.
5. THE Dashboard SHALL display elapsed session duration as a live-updating timer formatted as HH:MM:SS, refreshing every 1 second.
6. IF the `GET /api/sessions/active` request fails or returns a non-200 status, THEN THE Dashboard SHALL display an error message indicating the sessions could not be loaded and provide a retry option.
7. IF no active sessions exist, THEN THE Dashboard SHALL display an empty-state message indicating that no charging sessions are currently active.

### Requirement 7: Session History View

**User Story:** As a user, I want to view my past charging sessions with filtering options, so that I can review my charging activity and bills.

#### Acceptance Criteria

1. THE Dashboard SHALL display a user's session history by fetching data from `GET /api/sessions/user/:userId` with the authenticated user's ID, sorted by session start time in descending order (most recent first).
2. THE Dashboard SHALL display each historical session's date, start time, end time, node name, session type, total energy consumed (kWh), total duration, and bill amount.
3. THE Dashboard SHALL provide filter controls for date range, session type (owner/guest), and node selection, with all filters unset by default so that all sessions are displayed on initial load.
4. WHEN the user applies a filter, THE Dashboard SHALL re-fetch session data from the Backend_API with the corresponding query parameters (startDate, endDate, sessionType, nodeId) and display the filtered results within 2 seconds of the request.
5. WHEN the user clicks a delete button on a session entry, THE Dashboard SHALL send a `DELETE /api/sessions/:sessionId` request and remove the entry from the displayed list upon receiving an HTTP 204 response.
6. IF the delete request fails with a non-204 response or network error, THEN THE Dashboard SHALL display an error notification indicating the deletion failed and keep the session entry visible in the list.
7. IF the session history fetch request fails with a non-200 response or network error, THEN THE Dashboard SHALL display an error message indicating that session history could not be loaded and provide a retry option.
8. IF the session history fetch returns an empty list, THEN THE Dashboard SHALL display an empty-state message indicating no sessions match the current filters.

### Requirement 8: User Profile Management

**User Story:** As a user, I want to create and edit my profile with EV specifications and RFID card assignments, so that the system can calculate my charging priority and authenticate my RFID card.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a User_Profile_Form for creating new user profiles with fields: name (text, maximum 100 characters), EV type (2-wheeler/4-wheeler select), brand (text, maximum 50 characters), battery capacity (numeric, 0.1 to 200 kWh), battery type (text, maximum 50 characters), charger type (text, maximum 50 characters), charger power rating (numeric, 0.1 to 50 kW), and RFID UIDs (dynamic list, maximum 5 entries per user).
2. WHEN the user submits the profile creation form, THE Dashboard SHALL send a `POST /api/users` request with the form data.
3. WHEN the user edits an existing profile and submits changes, THE Dashboard SHALL send a `PUT /api/users/:userId` request with only the modified fields.
4. THE User_Profile_Form SHALL validate that required fields (name, EV type, brand, battery capacity, battery type, charger type, charger power rating) are non-empty and that numeric fields (battery capacity, charger power rating) contain values greater than zero before enabling the submit button.
5. IF the API request for profile creation or update fails, THEN THE Dashboard SHALL display an error notification containing the error message returned by the Backend_API and preserve all user-entered form data so no input is lost.
6. THE User_Profile_Form SHALL allow adding and removing multiple RFID UIDs as a dynamic list, displaying each UID as an individual removable entry.
7. IF a user submits a profile with an RFID UID that is already assigned to another user, THEN THE Backend_API SHALL reject the request and return an error message indicating the RFID UID is already in use.
8. WHEN the Backend_API receives a `POST /api/users` or `PUT /api/users/:userId` request, THE Backend_API SHALL validate that battery capacity is between 0.1 and 200 kWh and charger power rating is between 0.1 and 50 kW, and reject the request with an error message indicating the invalid field if validation fails.

### Requirement 9: Node Registration and Deregistration

**User Story:** As an administrator, I want to register new ESP32 nodes and remove existing ones through the dashboard, so that I can manage the system's hardware inventory without code changes.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a node registration form with fields: node ID (1–64 characters, alphanumeric and hyphens only), display name (1–128 characters), and location label (1–128 characters).
2. WHEN the administrator submits the registration form with valid input, THE Dashboard SHALL send a `POST /api/nodes` request and add the new node to the displayed node list upon receiving a 201 response.
3. IF the administrator submits the registration form with a node ID that already exists, THEN THE Dashboard SHALL display an error notification indicating the node ID is already registered and preserve the form input.
4. THE Dashboard SHALL provide a deregistration action (button or menu option) on each Node_Card.
5. WHEN the administrator activates the deregistration action on a Node_Card, THE Dashboard SHALL display a confirmation dialog identifying the node by display name and node ID before executing the deletion.
6. WHEN the administrator confirms node deregistration in the confirmation dialog, THE Dashboard SHALL send a `DELETE /api/nodes/:nodeId` request and remove the node from the displayed list upon receiving a 204 response.
7. IF the registration or deregistration request fails, THEN THE Dashboard SHALL display an error notification for at least 5 seconds indicating the nature of the failure and the affected node.
8. IF the administrator submits the registration form with any field empty or violating its format constraint, THEN THE Dashboard SHALL display inline validation errors on the invalid fields and prevent form submission.

### Requirement 10: Guest Mode Charging Initiation

**User Story:** As a registered user, I want to start a guest charging session from the dashboard, so that visitors can charge their EVs without a full profile setup.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a Guest_Charging_Form that allows selecting a target node from the list of registered nodes that are currently online and not occupied by an active session, and optionally entering guest EV specifications (battery capacity in kWh between 0.1 and 200, battery type, charger type, charger power rating in kW between 0.1 and 50).
2. WHEN the user submits the Guest_Charging_Form, THE Dashboard SHALL send a `POST /api/sessions/guest` request with the authenticated user's ID, selected node ID, and any provided EV specifications.
3. IF guest EV specifications are partially provided (some fields filled but not all four: battery capacity, battery type, charger type, charger power rating), THEN THE Dashboard SHALL prevent form submission and indicate which fields are missing.
4. IF guest EV specifications are left entirely empty, THEN THE Dashboard SHALL submit the request without the guestSpecs field, resulting in the backend assigning a priority score of 0 (lowest priority).
5. WHEN the guest session is created successfully (HTTP 201 response), THE Dashboard SHALL display the new session in the active sessions list and show a success notification that auto-dismisses after 5 seconds.
6. IF the guest session creation fails (HTTP 4xx or 5xx response), THEN THE Dashboard SHALL display an error notification containing the failure reason returned in the response body.
7. IF the selected node already has an active session or is in temperature override state, THEN THE Dashboard SHALL exclude that node from the selectable options in the Guest_Charging_Form.

### Requirement 11: Responsive Layout and Navigation

**User Story:** As a user, I want the dashboard to be usable on smartphones, tablets, and desktops with clear navigation, so that I can access all features regardless of my device.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a navigation structure with access to: Node Overview, Active Sessions, Session History, User Profile, Node Management, and ALM Threshold Control.
2. THE Dashboard SHALL render all content within the viewport width without requiring horizontal scrolling on viewport widths from 320px (smartphone) to 1920px (desktop), with all interactive elements fully visible and operable without content overlap or truncation.
3. WHILE the viewport width is 1024px or greater, THE Dashboard SHALL display a sidebar or top navigation bar showing all navigation items. WHILE the viewport width is less than 1024px, THE Dashboard SHALL collapse the navigation into a hamburger menu that expands to reveal all navigation items when activated.
4. THE Dashboard SHALL display the current page title and breadcrumb navigation for any view accessed through a parent view (e.g., Node Overview > Node Detail, Session History > Session Detail).
5. WHILE data is being fetched from the Backend_API, THE Dashboard SHALL display a loading indicator (spinner or skeleton screen) in the content area where data will appear.
6. IF a data fetch from the Backend_API does not complete within 10 seconds, THEN THE Dashboard SHALL display an error message indicating the request timed out and provide an option to retry the request.
7. THE Dashboard SHALL ensure all interactive navigation elements (links, buttons, hamburger menu) have a minimum touch target size of 44×44 CSS pixels on viewports below 1024px.
8. WHILE the viewport width is less than 768px (smartphone), THE Dashboard SHALL stack content vertically in a single-column layout, with Node_Cards, Session_Views, and form elements occupying the full available width.
9. WHILE the viewport width is less than 768px, THE Dashboard SHALL use a bottom navigation bar for primary navigation items (Node Overview, Active Sessions, Session History) and place secondary items (User Profile, Node Management, ALM Control) in the hamburger menu.
10. THE Dashboard SHALL use responsive font sizes that remain legible on smartphone screens (minimum 14px body text) and scale appropriately across all supported viewport widths.

### Requirement 12: Error Handling and Notifications

**User Story:** As a user, I want to see clear error messages and status notifications, so that I understand when operations succeed or fail.

#### Acceptance Criteria

1. WHEN an API request fails with a network error or does not receive a response within 10 seconds, THE Dashboard SHALL display an error notification indicating the connection problem and suggest the user check their internet connection.
2. WHEN an API request fails with a 4xx status code and the response body contains an error message, THE Dashboard SHALL display that error message in the notification, truncated to a maximum of 200 characters.
3. IF an API request fails with a 4xx status code and the response body is empty or does not contain an error message, THEN THE Dashboard SHALL display a notification indicating the request was rejected.
4. WHEN an API request fails with a 5xx status code, THE Dashboard SHALL display an error notification indicating a server error occurred and that the user should try again later.
5. WHEN a create, update, or delete operation completes successfully, THE Dashboard SHALL display a success notification confirming the completed action.
6. THE Dashboard SHALL auto-dismiss success notifications after 5 seconds, while error notifications SHALL remain visible until the user explicitly closes them via a dismiss control on the notification.
7. THE Dashboard SHALL display a maximum of 5 notifications simultaneously; when the limit is reached, the oldest notification SHALL be removed to make room for the newest one.
8. IF the user's Auth_Token becomes invalid (401 response), THEN THE Dashboard SHALL redirect the user to the login screen with a message indicating the session has expired.
9. IF multiple API requests fail simultaneously with the same error type (network error, same status code), THEN THE Dashboard SHALL consolidate them into a single notification rather than displaying duplicate notifications.

### Requirement 13: ALM Event and Status Notifications

**User Story:** As an administrator, I want to be notified of ALM shedding events and node status changes in real time, so that I can respond to system events without constantly watching the dashboard.

#### Acceptance Criteria

1. WHEN an `alm_event` WebSocket message is received, THE Dashboard SHALL display a notification containing the affected node display name, the shedding reason, and a timestamp, within 2 seconds of message receipt, and the notification SHALL remain visible until manually dismissed by the user.
2. WHEN a `node_status` WebSocket message indicates a node has gone offline, THE Dashboard SHALL display a warning-level notification containing the node display name and a timestamp within 2 seconds of message receipt, and the notification SHALL auto-dismiss after 10 seconds or upon manual dismissal.
3. WHEN a `node_status` WebSocket message indicates a node has entered override state, THE Dashboard SHALL display a critical-level notification indicating the temperature safety override, the node display name, and a timestamp within 2 seconds of message receipt, and the notification SHALL remain visible until manually dismissed by the user.
4. THE Dashboard SHALL maintain an event log accessible from the navigation, storing the most recent 50 system events with timestamps in reverse chronological order, where new events beyond 50 replace the oldest entry (FIFO eviction).
5. THE Dashboard SHALL visually distinguish between three notification severity levels (informational, warning, critical) using both distinct color coding and unique icons per level, ensuring severity is identifiable without relying on color alone.
6. IF multiple notification events are received within the same 2-second window, THEN THE Dashboard SHALL display each notification individually in the order received without discarding any events.
