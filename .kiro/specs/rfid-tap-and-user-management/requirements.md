# Requirements Document

## Introduction

This feature enhances the Smart Socket dashboard by replacing manual RFID UID text entry with a hardware-based "Tap your RFID card" workflow, applying the same RFID-tap approach to guest session socket assignment, and adding a new User Management tab for administrators to view and manage all registered users.

Currently, users must manually type their RFID card UID (a hex string like "A1B2C3D4") during profile registration — a tedious and error-prone process. The ESP32 firmware already reads RFID cards via the MFRC522 module and publishes the UID over MQTT. This feature leverages that existing hardware capability to let the dashboard capture the UID automatically when the user taps their card on any connected node's RFID reader.

## Glossary

- **Dashboard**: The React/TypeScript web frontend application for managing the Smart Socket system
- **Backend**: The Node.js/Express server handling API requests, MQTT communication, and WebSocket broadcasting
- **RFID_Reader**: The MFRC522 hardware module on the ESP32 node that reads RFID card UIDs
- **RFID_UID**: A hexadecimal string (e.g., "A1B2C3D4") uniquely identifying an RFID card, read by the RFID_Reader
- **MQTT_Broker**: The HiveMQ cloud broker used for communication between ESP32 nodes and the Backend
- **WebSocket_Server**: The Backend component that pushes real-time events to connected Dashboard clients
- **Node**: An ESP32-based smart socket charging point with RFID_Reader, sensors, and relay
- **User_Profile**: A registered user record containing name, EV specs, and associated RFID_UIDs
- **Guest_Session**: A charging session started by a non-registered user or a registered user using guest mode
- **RFID_Scan_Mode**: A temporary state where the system listens for an RFID tap event and routes the captured UID to the requesting Dashboard client
- **User_Management_Page**: A new Dashboard page displaying all registered users in a searchable, sortable list with management actions

## Requirements

### Requirement 1: RFID Tap-to-Capture During User Registration

**User Story:** As a system administrator, I want to capture RFID UIDs by tapping the card on a node's reader instead of typing them manually, so that registration is faster and error-free.

#### Acceptance Criteria

1. WHEN the user clicks the "Tap your RFID card" button on the User_Profile page, THE Dashboard SHALL send a scan-request message to the Backend via the WebSocket_Server identifying the requesting client, and replace the RFID UID text input with a visual scanning indicator showing "Waiting for RFID tap..."
2. WHEN the Backend receives a scan-request message from a Dashboard client, THE Backend SHALL listen for the next RFID tap event on any connected Node and forward the captured RFID_UID to the requesting Dashboard client via the WebSocket_Server within 1 second of tap detection.
3. WHEN an RFID_UID is received during RFID_Scan_Mode, THE Dashboard SHALL populate the RFID UID field with the captured value and exit RFID_Scan_Mode, restoring the text input to an editable state displaying the captured UID.
4. IF no RFID tap is detected within 30 seconds of entering RFID_Scan_Mode, THEN THE Dashboard SHALL display a timeout message indicating the scan timed out and revert to the idle state with the "Tap your RFID card" button, and THE Backend SHALL exit the scan-listening state for that client.
5. WHILE the Dashboard is in RFID_Scan_Mode, THE Dashboard SHALL display a "Cancel" button that, when activated, exits RFID_Scan_Mode without capturing a UID, sends a scan-cancel message to the Backend via the WebSocket_Server, and reverts the UI to the idle state with the "Tap your RFID card" button.
6. THE Dashboard SHALL retain the existing ability to add multiple RFID UIDs (up to 5) to a User_Profile, with each UID capturable via a separate tap action.
7. WHEN the Backend receives an RFID tap event while a Dashboard client is in RFID_Scan_Mode, THE Backend SHALL suppress the normal RFID authentication flow for that specific tap and route the UID exclusively to the scan requester.
8. IF a second Dashboard client sends a scan-request while another client is already in RFID_Scan_Mode, THEN THE Backend SHALL reject the second request and THE Dashboard SHALL display an error message indicating that another scan is already in progress.
9. IF the WebSocket connection is lost while the Dashboard is in RFID_Scan_Mode, THEN THE Dashboard SHALL exit RFID_Scan_Mode, revert to the idle state with the "Tap your RFID card" button, and display an error message indicating the scan was interrupted due to a connection loss.
10. WHEN the user cancels or the scan times out, THE Backend SHALL resume the normal RFID authentication flow for subsequent tap events on all connected Nodes.

### Requirement 2: RFID Tap-to-Assign Socket in Guest Mode

**User Story:** As a system administrator, I want guest sessions to be initiated by tapping an RFID card on a node's reader, so that the socket assignment is automatic and tied to a physical interaction with the hardware.

#### Acceptance Criteria

1. WHEN the user navigates to the Guest_Session page, THE Dashboard SHALL display a "Tap RFID card on a node" prompt instead of the manual node selection dropdown
2. WHEN a guest taps an RFID card on any available Node, THE Backend SHALL identify which Node received the tap and forward a WebSocket message of type `rfid_tap` containing both the RFID_UID and the Node identifier to the Dashboard via the WebSocket_Server within 2 seconds of the physical tap
3. WHEN the Dashboard receives an `rfid_tap` WebSocket message with a Node identifier while the Guest_Session page is in the RFID listening state, THE Dashboard SHALL auto-populate the node assignment field with the tapped Node's display name, lock the node field from further editing, and reveal the guest specs form section
4. IF the tapped Node is not available (offline, occupied, or in temperature override), THEN THE Dashboard SHALL display an error message indicating the Node is unavailable and the specific reason (offline, occupied, or temperature override), and prompt the user to tap on a different Node while remaining in the RFID listening state
5. IF no RFID tap is detected within 60 seconds on the Guest_Session page, THEN THE Dashboard SHALL display a timeout message and offer a "Retry" button that, when activated, resets the 60-second timer and returns the page to the RFID listening state
6. WHILE waiting for an RFID tap on the Guest_Session page, THE Dashboard SHALL display a pulsing or animated indicator signaling that the system is listening for a tap, and list available nodes with their display names and location labels for reference

### Requirement 3: User Management Tab

**User Story:** As a system administrator, I want a dedicated tab to view all registered users and manage their profiles, so that I can oversee the user base without accessing individual profiles manually.

#### Acceptance Criteria

1. THE Dashboard SHALL include a "User Management" navigation item in the sidebar, accessible from the main navigation
2. WHEN the administrator navigates to the User_Management_Page, THE Dashboard SHALL display a list of all registered User_Profiles showing name, EV type, brand, number of RFID cards, and registration date
3. THE User_Management_Page SHALL provide a search field that filters the user list by name or brand in real time as the administrator types
4. WHEN the administrator clicks on a user row, THE Dashboard SHALL expand or navigate to show the full User_Profile details including all RFID_UIDs and EV specifications
5. WHEN the administrator clicks a "Delete" action on a user, THE Dashboard SHALL display a confirmation dialog before sending the delete request to the Backend
6. WHEN a delete is confirmed, THE Backend SHALL remove the User_Profile and disassociate all linked RFID_UIDs, and THE Dashboard SHALL remove the user from the list
7. THE User_Management_Page SHALL display the total count of registered users at the top of the list

### Requirement 4: Backend RFID Scan Mode API

**User Story:** As a developer, I want the backend to support an RFID scan mode that routes card taps to the dashboard instead of the auth flow, so that the frontend can capture UIDs on demand.

#### Acceptance Criteria

1. WHEN the Dashboard sends an "enter_scan_mode" WebSocket message, THE Backend SHALL register the requesting client as the active scan requester, suppress normal RFID authentication for the next tap, and send a "scan_mode_entered" WebSocket message back to the requester confirming activation
2. WHEN the Backend receives an RFID MQTT message while a scan requester is registered, THE Backend SHALL forward the RFID_UID and source Node identifier to the scan requester via a "rfid_scanned" WebSocket message
3. WHEN the scan result is delivered, THE Backend SHALL automatically exit scan mode and resume normal RFID authentication handling
4. IF the scan requester disconnects before a tap is received, THEN THE Backend SHALL cancel the scan mode and resume normal RFID authentication handling
5. WHILE the Backend is in scan mode, THE Backend SHALL reject additional "enter_scan_mode" requests from any client (including the current scan requester) with a "scan_in_progress" error message
6. WHEN the Dashboard sends a "cancel_scan_mode" WebSocket message, THE Backend SHALL exit scan mode and resume normal RFID authentication handling
7. IF no RFID tap is received within 30 seconds of entering scan mode, THEN THE Backend SHALL automatically exit scan mode, resume normal RFID authentication handling, and send a "scan_mode_timeout" WebSocket message to the scan requester

### Requirement 5: Backend User List and Delete Endpoints

**User Story:** As a developer, I want API endpoints to list all users and delete individual users, so that the User Management frontend can retrieve and manage the user base.

#### Acceptance Criteria

1. WHEN an authenticated GET request is made to /api/users, THE Backend SHALL return an HTTP 200 response with a JSON object containing a "users" array of all registered User_Profiles, where each entry includes userId, name, evType, brand, rfidUids array, and createdAt fields
2. WHEN an authenticated DELETE request is made to /api/users/:userId, THE Backend SHALL remove the specified User_Profile from the database and return a 204 status code with no response body
3. IF the specified userId does not exist in the database, THEN THE Backend SHALL return a 404 status code with a JSON response containing an error field indicating that no user was found for the given identifier
4. WHEN a User_Profile is deleted, THE Backend SHALL remove all RFID_UID associations for that user so the cards can be re-assigned to other users
5. IF a DELETE request is made to /api/users/:userId and the user has an active charging session, THEN THE Backend SHALL return a 409 status code with an error message indicating the user cannot be deleted while a session is active
6. IF a GET or DELETE request to /api/users is made without a valid Auth_Token in the Authorization header, THEN THE Backend SHALL return a 401 status code and not process the request
