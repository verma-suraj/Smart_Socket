# Implementation Plan: RFID Tap and User Management

## Overview

This plan implements three interconnected features: RFID tap-to-capture for user registration, RFID tap-to-assign for guest sessions, and a User Management admin page. Implementation follows a bottom-up approach — backend scan mode manager first, then WebSocket/REST extensions, then frontend components and pages. TypeScript is used throughout (Node.js/Express backend, React frontend).

## Tasks

- [x] 1. Implement ScanModeManager module
  - [x] 1.1 Create ScanModeManager class with state machine logic
    - Create `src/modules/scan-mode/scan-mode-manager.ts`
    - Implement `ScanModeState` interface and `ScanResult` interface
    - Implement `enterScanMode(requesterId)` — activates scan mode with global lock, starts 30s timeout timer, returns boolean
    - Implement `exitScanMode()` — clears state, cancels timeout timer
    - Implement `isActive()`, `getRequesterId()` accessors
    - Implement `consumeRfidEvent(rfidUid, nodeId)` — returns `ScanResult` if active (and auto-exits), null otherwise
    - Create `src/modules/scan-mode/index.ts` barrel export
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 1.2 Write property tests for ScanModeManager (Property 1: Mutual Exclusion)
    - **Property 1: Scan Mode Mutual Exclusion**
    - Create `tests/property/scan-mode-manager.property.test.ts`
    - For any two distinct client IDs, if `enterScanMode(clientA)` returns true, then `enterScanMode(clientB)` must return false and `getRequesterId()` must equal `clientA`
    - **Validates: Requirements 1.8, 4.5**

  - [x] 1.3 Write property tests for ScanModeManager (Property 2: RFID Event Interception)
    - **Property 2: Scan Mode Intercepts RFID Events**
    - For any RFID UID and node ID, when `isActive()` is true, `consumeRfidEvent(rfidUid, nodeId)` must return non-null `ScanResult` matching inputs
    - **Validates: Requirements 1.2, 1.7, 4.2**

  - [x] 1.4 Write property tests for ScanModeManager (Property 3: Auto-Exit on Result)
    - **Property 3: Scan Mode Auto-Exits on Result Delivery**
    - After `consumeRfidEvent` returns non-null, `isActive()` must return false
    - **Validates: Requirements 4.3**

  - [x] 1.5 Write property tests for ScanModeManager (Property 4: Post-Exit Pass Through)
    - **Property 4: Post-Exit RFID Events Pass Through**
    - After `exitScanMode()` or auto-exit, `consumeRfidEvent` must return null
    - **Validates: Requirements 1.10, 4.6**

  - [x] 1.6 Write unit tests for ScanModeManager
    - Create `tests/unit/scan-mode-manager.test.ts`
    - Test enter/exit lifecycle, 30s timeout firing, disconnect cleanup
    - Test that timeout sends notification and auto-exits
    - _Requirements: 4.1, 4.3, 4.4, 4.6, 4.7_

- [x] 2. Extend WebSocket Server for scan mode and targeted messaging
  - [x] 2.1 Add client tracking and targeted messaging to WebSocket Server
    - Modify `src/modules/dashboard-api/websocket-server.ts`
    - Assign unique `clientId` (UUID) to each WebSocket connection on connect
    - Store connections in `Map<string, WebSocket>`
    - Implement `sendToClient(clientId, data)` for targeted messages
    - Implement `onClientMessage(handler)` for incoming client message routing
    - Implement `emitRfidTap(nodeId, rfidUid)` for broadcast tap events
    - Clean up client map on disconnect
    - _Requirements: 1.2, 2.2, 4.1, 4.2_

  - [x] 2.2 Integrate ScanModeManager with WebSocket message handlers
    - Add handler for `enter_scan_mode` messages — calls `ScanModeManager.enterScanMode()`, sends back `scan_mode_entered` or `scan_in_progress`
    - Add handler for `cancel_scan_mode` messages — calls `ScanModeManager.exitScanMode()`, resumes auth
    - On client disconnect, check if client was the scan requester and auto-exit scan mode
    - Wire `scan_mode_timeout` notification from ScanModeManager to the requester client
    - _Requirements: 4.1, 4.4, 4.5, 4.6, 4.7_

  - [x] 2.3 Integrate ScanModeManager with RFID MQTT handler
    - Modify `src/modules/auth/rfid-handler.ts`
    - Before processing normal auth flow, check `ScanModeManager.consumeRfidEvent()`
    - If consumed (non-null), send `rfid_scanned` message to the scan requester via `sendToClient()` and skip normal auth
    - If not consumed (null), proceed with existing RFID authentication flow
    - Broadcast `rfid_tap` event via `emitRfidTap()` for guest mode listeners
    - _Requirements: 1.2, 1.7, 2.2, 4.2, 4.3_

  - [x] 2.4 Write unit tests for WebSocket Server extensions
    - Create `tests/unit/websocket-server.test.ts`
    - Test client ID assignment on connect, removal on disconnect
    - Test `sendToClient` delivers to correct client
    - Test `emitRfidTap` broadcasts to all connected clients
    - Test scan mode message handling (enter, cancel, reject duplicate)
    - _Requirements: 4.1, 4.5, 4.6_

- [x] 3. Checkpoint - Backend scan mode
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement User Management backend endpoints
  - [x] 4.1 Add `listAllUsers` and `deleteUser` methods to UserProfileManager
    - Modify `src/modules/auth/user-profile.ts`
    - Implement `listAllUsers()` — queries Firestore `users` collection, returns all profiles
    - Implement `deleteUser(userId)` — removes user document and clears RFID UID associations
    - Implement `hasActiveSession(userId)` — checks session-manager for active sessions tied to userId
    - _Requirements: 5.1, 5.2, 5.4, 5.5_

  - [x] 4.2 Add REST routes for GET /api/users and DELETE /api/users/:userId
    - Modify `src/modules/dashboard-api/rest-routes.ts`
    - `GET /api/users` — returns JSON with `users` array containing userId, name, evType, brand, rfidUids, createdAt
    - `DELETE /api/users/:userId` — checks active session (409 if active), checks existence (404 if not found), deletes (204 on success)
    - Both routes protected by existing auth middleware (401 without valid token)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 4.3 Write property test for User Deletion (Property 10)
    - **Property 10: User Deletion Removes Profile and Frees RFIDs**
    - Create `tests/property/user-deletion.property.test.ts`
    - For any existing user without an active session, after `deleteUser(userId)`, user must not appear in `listAllUsers()` and former RFID UIDs must not be associated with any user
    - **Validates: Requirements 3.6, 5.2, 5.4**

  - [x] 4.4 Write property test for Delete Blocked (Property 11)
    - **Property 11: Delete Blocked When User Has Active Session**
    - For any user with an active session, attempting delete must fail with 409 and the user must remain unchanged
    - **Validates: Requirements 5.5**

  - [x] 4.5 Write property test for API Response Shape (Property 12)
    - **Property 12: User List API Response Shape**
    - Create `tests/property/api-response-shape.property.test.ts`
    - For any set of stored profiles, GET /api/users response `users` array length must equal total stored profiles, each entry must contain userId, name, evType, brand, rfidUids (array), createdAt (number)
    - **Validates: Requirements 5.1**

  - [x] 4.6 Write unit tests for REST routes (users)
    - Create `tests/unit/rest-routes-users.test.ts`
    - Test 401 without token, 404 for missing user, 409 for active session, 204 on successful delete, 200 with correct shape on list
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

- [x] 5. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement frontend useRfidScan hook
  - [x] 6.1 Create useRfidScan custom hook
    - Create `frontend/src/hooks/useRfidScan.ts`
    - Implement state machine: `'idle' | 'scanning' | 'timeout' | 'error'`
    - `startScan()` — sends `enter_scan_mode` WebSocket message, transitions to `scanning`
    - `cancelScan()` — sends `cancel_scan_mode` WebSocket message, transitions to `idle`
    - Listen for `scan_mode_entered`, `rfid_scanned`, `scan_mode_timeout`, `scan_in_progress` messages
    - Handle WebSocket disconnect during scan — revert to idle with error
    - Implement 30s frontend timeout as defense-in-depth
    - Call `onUidCaptured(uid, nodeId)` callback on `rfid_scanned` message
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.9_

  - [x] 6.2 Write property test for scan state machine (Property 6)
    - **Property 6: Scan State Machine Transitions**
    - Create `frontend/src/hooks/__tests__/useRfidScan.property.test.ts`
    - For any scan state `'scanning'`: receiving `rfid_scanned` must transition to `'idle'` with captured UID; invoking `cancelScan()` must transition to `'idle'` with no UID
    - **Validates: Requirements 1.3, 1.5**

- [x] 7. Implement RfidScanButton component
  - [x] 7.1 Create RfidScanButton reusable component
    - Create `frontend/src/components/RfidScanButton.tsx`
    - Props: `onUidCaptured`, `onError`, `disabled`
    - Render states: idle (shows "Tap your RFID card" button), scanning (pulsing indicator + "Waiting for RFID tap..." + Cancel button), timeout (timeout message + retry button), error (error message + retry button)
    - Use `useRfidScan` hook internally
    - Accessible: proper ARIA labels, focus management, screen reader announcements for state changes
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.9_

  - [x] 7.2 Write unit tests for RfidScanButton
    - Create `frontend/src/components/__tests__/RfidScanButton.test.tsx`
    - Test rendering in each state (idle, scanning, timeout, error)
    - Test cancel button exits scan mode
    - Test captured UID propagates via callback
    - _Requirements: 1.1, 1.5_

- [x] 8. Integrate RFID Tap-to-Capture into UserProfilePage
  - [x] 8.1 Modify UserProfilePage to use RfidScanButton for RFID UID capture
    - Modify `frontend/src/pages/UserProfilePage.tsx`
    - Replace or augment existing manual RFID UID text input with `RfidScanButton`
    - On UID captured, populate the RFID UID field with captured value
    - Retain editable text input so user can still manually edit after capture
    - Support adding up to 5 RFID UIDs, each with its own tap action
    - _Requirements: 1.1, 1.3, 1.6_

  - [x] 8.2 Write property test for RFID UID list bounded at 5 (Property 5)
    - **Property 5: RFID UID List Bounded at 5**
    - Test in the context of user profile form validation
    - For any user profile, the `rfidUids` array must never exceed 5 entries; adding when at 5 must be rejected
    - **Validates: Requirements 1.6**

- [x] 9. Implement Guest Session page RFID tap flow
  - [x] 9.1 Modify GuestSessionPage to use RFID tap for node assignment
    - Modify `frontend/src/pages/GuestSessionPage.tsx`
    - Replace manual node selection dropdown with "Tap RFID card on a node" prompt
    - Display pulsing/animated indicator while in RFID listening state
    - List available nodes with display names and location labels for reference
    - Listen for `rfid_tap` WebSocket messages
    - On receiving `rfid_tap` with an available node: auto-populate node assignment, lock field, reveal guest specs form
    - On unavailable node: display specific error (offline/occupied/temperature override), stay in listening state
    - Implement 60s timeout with "Retry" button that resets the timer
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 9.2 Write property test for guest page node assignment (Property 7)
    - **Property 7: Guest Page Node Assignment from RFID Tap**
    - Create `frontend/src/pages/__tests__/GuestSessionPage.property.test.ts`
    - For any valid `rfid_tap` message with an available node while in listening state, the assigned node field must be populated with the received nodeId
    - **Validates: Requirements 2.3**

  - [x] 9.3 Write property test for unavailable node rejection (Property 8)
    - **Property 8: Unavailable Node Rejection Keeps Listening State**
    - For any `rfid_tap` message where node is unavailable, the page must remain in listening state and must not assign the node
    - **Validates: Requirements 2.4**

- [x] 10. Checkpoint - Frontend scan and guest flows
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement User Management Page
  - [x] 11.1 Create UserManagementPage component
    - Create `frontend/src/pages/UserManagementPage.tsx`
    - Fetch user list from `GET /api/users` on mount
    - Display total user count at the top
    - Render user list table showing name, EV type, brand, number of RFID cards, registration date
    - Implement search field that filters by name or brand in real time (case-insensitive)
    - Implement expandable row or navigation to show full profile details (all RFID UIDs, EV specs)
    - Implement delete action with confirmation dialog
    - On delete confirmed: call `DELETE /api/users/:userId`, remove from list on success, show error toast on failure
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 11.2 Write property test for user search filter (Property 9)
    - **Property 9: User Search Filter Correctness**
    - Create `frontend/src/pages/__tests__/UserManagementPage.property.test.ts` (or separate filter test)
    - For any non-empty search string and user list, every result must have name or brand containing the search (case-insensitive), and no matching user should be excluded
    - **Validates: Requirements 3.3**

  - [x] 11.3 Write unit tests for UserManagementPage
    - Create `frontend/src/pages/__tests__/UserManagementPage.test.tsx`
    - Test user list rendering, confirmation dialog on delete, search filtering UI
    - Test error state display and retry
    - _Requirements: 3.2, 3.5, 3.7_

- [x] 12. Add User Management navigation item
  - [x] 12.1 Add "User Management" to sidebar navigation
    - Modify `frontend/src/components/layout/NavShell.tsx`
    - Add "User Management" navigation item linked to the UserManagementPage route
    - Add route definition in `frontend/src/App.tsx` for the new page
    - Ensure the route is wrapped with ProtectedRoute for auth
    - _Requirements: 3.1_

- [x] 13. Integration wiring and final verification
  - [x] 13.1 Wire all new modules into the backend application entry point
    - Modify `src/app.ts` or `src/index.ts` as needed
    - Instantiate `ScanModeManager` and inject into WebSocket handlers and RFID handler
    - Register new REST routes for /api/users
    - Ensure scan mode integrates with existing MQTT subscription for RFID topics
    - _Requirements: 4.1, 5.1_

  - [x] 13.2 Write integration tests for scan mode end-to-end flow
    - Create `tests/integration/scan-mode-flow.test.ts`
    - Test: WebSocket enter_scan_mode → simulated MQTT RFID message → WebSocket rfid_scanned delivery
    - Test: Timeout scenario, cancel scenario, disconnect scenario
    - _Requirements: 1.2, 4.2, 4.3, 4.7_

  - [x] 13.3 Write integration tests for user management flow
    - Create `tests/integration/user-management-flow.test.ts`
    - Test: Create user → List (verify present) → Delete → List (verify gone)
    - Test: Delete with active session returns 409
    - Test: 401 for unauthenticated requests
    - _Requirements: 5.1, 5.2, 5.5, 5.6_

- [x] 14. Final checkpoint - All features complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend `fast-check` and `vitest` are already installed in the project
- Frontend uses Vite + vitest for testing
- All REST endpoints use the existing Firebase Auth middleware pattern
- ScanModeManager is purely in-memory — no database persistence needed

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "4.1"] },
    { "id": 2, "tasks": ["2.1", "4.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 4, "tasks": ["2.4", "6.1"] },
    { "id": 5, "tasks": ["6.2", "7.1"] },
    { "id": 6, "tasks": ["7.2", "8.1", "9.1", "11.1"] },
    { "id": 7, "tasks": ["8.2", "9.2", "9.3", "11.2", "11.3", "12.1"] },
    { "id": 8, "tasks": ["13.1"] },
    { "id": 9, "tasks": ["13.2", "13.3"] }
  ]
}
```
