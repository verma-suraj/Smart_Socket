# Implementation Plan: Smart Socket Dashboard

## Overview

Build the Smart Socket Dashboard as a React 18 + TypeScript SPA using Vite, Zustand for state management, React Router v6 for routing, Tailwind CSS for styling, Axios for HTTP, and React Hook Form + Zod for form validation. The implementation proceeds from project scaffolding and core infrastructure (auth, WebSocket, API service) through feature pages, culminating in integration wiring and testing.

## Tasks

- [x] 1. Project scaffolding and core infrastructure
  - [x] 1.1 Initialize Vite React TypeScript project and install dependencies
    - Create the frontend project with `npm create vite@latest` using the react-ts template
    - Install runtime dependencies: react-router-dom, zustand, axios, firebase, tailwindcss, react-hook-form, @hookform/resolvers, zod
    - Install dev dependencies: vitest, @testing-library/react, @testing-library/jest-dom, fast-check, jsdom, @types/react, @types/react-dom
    - Configure Vite, Tailwind CSS, and Vitest
    - _Requirements: 11.1_

  - [x] 1.2 Define TypeScript interfaces and data models
    - Create `src/types/index.ts` with all shared interfaces: TelemetryPayload, NodeRecord, NodeStatus, Session, GuestSpecs, UserProfile, UserProfileInput, RegisterNodeParams, GuestSessionParams, SessionFilters, WSMessage, Notification, SystemEvent
    - _Requirements: 3.2, 4.1, 6.2, 7.2, 8.1, 10.1_

  - [x] 1.3 Implement utility functions (formatters, validators, helpers)
    - Create `src/utils/formatters.ts`: truncateDisplayName, formatTelemetryValue (per field precision), formatTimestamp, formatDuration, truncateErrorMessage
    - Create `src/utils/validators.ts`: validateUserProfile, validateNodeRegistration, validateGuestSpecs, validateThreshold (clamping)
    - Create `src/utils/ws-message-router.ts`: parseAndRoute function that validates JSON and dispatches by message type
    - Create `src/utils/notification-logic.ts`: createNotification, shouldAutoDismiss, evictOldest, consolidateDuplicates, computeBackoffDelay
    - Create `src/utils/filters.ts`: filterAvailableNodes, buildSessionQueryParams, computeProfileDiff, sortSessionsByStartTime
    - _Requirements: 1.6, 2.3, 2.6, 2.7, 4.3, 4.6, 4.8, 5.5, 6.1, 6.5, 7.1, 7.4, 8.3, 8.4, 9.1, 10.1, 10.3, 12.2, 12.6, 12.7, 12.9, 13.4_

  - [x] 1.4 Write property tests for formatters (Properties 2, 7, 9, 13, 20)
    - **Property 2: Display name truncation** — output ≤ 33 chars; input ≤ 30 chars returns input unchanged
    - **Property 7: Telemetry value formatting precision** — each field formatted to correct decimal places
    - **Property 9: Timestamp formatting** — output matches `YYYY-MM-DD HH:MM:SS` pattern
    - **Property 13: Duration formatting round-trip** — formatDuration ↔ parse yields original seconds
    - **Property 20: Error message truncation** — output ≤ 200 chars; input ≤ 200 returns unchanged
    - **Validates: Requirements 1.6, 4.3, 4.6, 6.5, 12.2**

  - [x] 1.5 Write property tests for validators (Properties 8, 11, 15, 17, 19)
    - **Property 8: Temperature classification** — normal ≤ 38, warning 38–40, critical > 40
    - **Property 11: Threshold value clamping** — output always in [1, 100000]
    - **Property 15: User profile validation** — passes iff all constraints met
    - **Property 17: Node registration validation** — nodeId matches pattern, lengths valid
    - **Property 19: Guest specs partial validation** — rejects 1–3 fields provided out of 4
    - **Validates: Requirements 4.4, 4.5, 5.5, 8.1, 8.4, 9.1, 9.8, 10.3**

  - [x] 1.6 Write property tests for WebSocket routing and notifications (Properties 3, 4, 5, 10, 21, 22, 23, 24, 25)
    - **Property 3: Exponential backoff delay** — delay = min(1000 × 2^(n-1), 30000)
    - **Property 4: WebSocket message routing** — valid messages dispatched to correct handler
    - **Property 5: Invalid WebSocket message resilience** — invalid input discarded without error
    - **Property 10: Telemetry staleness detection** — isStale true iff elapsed > 30000
    - **Property 21: Notification auto-dismiss rules** — success: autoDismiss 5s, error: no autoDismiss
    - **Property 22: Notification stack FIFO eviction** — max 5 visible, newest kept
    - **Property 23: Error notification consolidation** — same error type batched into 1 notification
    - **Property 24: Event log FIFO 50-entry cap** — newest 50 kept, oldest evicted
    - **Property 25: Batch notification preservation** — all N events within 2s window preserved
    - **Validates: Requirements 2.3, 2.6, 2.7, 4.8, 12.6, 12.7, 12.9, 13.4, 13.6**

  - [x] 1.7 Write property tests for filters (Properties 12, 14, 16, 18)
    - **Property 12: Session list sorting** — output sorted descending by startTimestamp
    - **Property 14: Session filter query construction** — only defined fields appear in query params
    - **Property 16: Profile update diff computation** — diff contains only changed fields
    - **Property 18: Available node filtering** — returns only online, non-override, non-occupied nodes
    - **Validates: Requirements 6.1, 7.1, 7.4, 8.3, 10.1, 10.7**

- [x] 2. Authentication and service layer
  - [x] 2.1 Implement Auth service and AuthStore
    - Create `src/services/auth.service.ts`: Firebase Auth SDK integration with login, logout, getToken, onAuthStateChanged, automatic token refresh
    - Create `src/stores/auth.store.ts`: Zustand store with user, token, loading, error states and login/logout actions
    - Implement token refresh retry logic (3 attempts before redirecting to login)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Implement API service with Axios interceptors
    - Create `src/services/api.service.ts`: Axios instance with base URL, 10s timeout
    - Implement request interceptor to attach Bearer token from AuthStore
    - Implement response interceptor for 401 handling (clear tokens, redirect to login)
    - Implement all API methods: getNodes, getNodeTelemetry, registerNode, deregisterNode, getActiveSessions, getUserSessions, startGuestSession, deleteSession, updateThreshold, createUser, updateUser
    - _Requirements: 1.2, 1.8, 12.1, 12.2, 12.3, 12.4_

  - [x] 2.3 Write property test for auth token attachment (Property 1)
    - **Property 1: Auth token attachment** — any request with valid token gets Authorization header
    - **Validates: Requirements 1.2**

  - [x] 2.4 Implement WebSocket service with reconnection logic
    - Create `src/services/websocket.service.ts`: connect, disconnect, onMessage, getStatus methods
    - Implement exponential backoff reconnection (1s initial, doubling, max 30s, max 10 attempts)
    - Implement JSON parsing with silent discard of invalid messages
    - Implement message routing by type field to store handlers
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Zustand stores and state management
  - [x] 4.1 Implement Node store
    - Create `src/stores/node.store.ts`: nodes Map, nodeStatuses Map, fetchNodes, updateNodeStatus, addNode, removeNode
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 4.2 Implement Telemetry store
    - Create `src/stores/telemetry.store.ts`: telemetryByNode Map, lastUpdateByNode Map, totalLoad computation, updateTelemetry action
    - _Requirements: 4.1, 4.2, 5.2_

  - [x] 4.3 Implement Session store
    - Create `src/stores/session.store.ts`: activeSessions, historyCache, fetchActiveSessions, fetchUserSessions, updateSession, removeSession
    - _Requirements: 6.1, 6.3, 6.4, 7.1_

  - [x] 4.4 Implement UI/Notification store
    - Create `src/stores/ui.store.ts`: notifications array (max 5, FIFO eviction), connectionStatus, eventLog (max 50 FIFO), addNotification, dismissNotification, setConnectionStatus, addEvent, consolidation logic
    - _Requirements: 12.5, 12.6, 12.7, 12.9, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

- [x] 5. Routing, layout, and navigation shell
  - [x] 5.1 Set up React Router with protected routes and auth guard
    - Create `src/App.tsx` with AuthProvider, Router setup
    - Create `src/components/ProtectedRoute.tsx`: redirects unauthenticated users to /login
    - Define all routes: /login, /, /nodes/:nodeId, /sessions/active, /sessions/history, /profile, /nodes/manage, /alm, /events, /guest-session
    - _Requirements: 1.4, 11.1_

  - [x] 5.2 Implement responsive Navigation Shell
    - Create `src/components/layout/NavShell.tsx`: sidebar (≥1024px), hamburger menu (<1024px), bottom nav (<768px)
    - Display authenticated user name/email (truncated to 30 chars) and logout button in header
    - Display breadcrumb navigation for child views
    - Implement 44×44px minimum touch targets on mobile
    - _Requirements: 1.5, 1.6, 11.2, 11.3, 11.4, 11.7, 11.8, 11.9, 11.10_

  - [x] 5.3 Implement NotificationStack and ConnectionStatus components
    - Create `src/components/NotificationStack.tsx`: renders up to 5 notifications with severity styling (color + icon), auto-dismiss timers, dismiss buttons
    - Create `src/components/ConnectionStatus.tsx`: WebSocket connection indicator (connected/disconnected/reconnecting)
    - _Requirements: 2.3, 2.4, 2.8, 12.5, 12.6, 12.7, 13.5_

- [x] 6. Feature pages - Node overview and telemetry
  - [x] 6.1 Implement Login page
    - Create `src/pages/LoginPage.tsx`: email/password form, Firebase Auth login, error display, retains email on failed attempt
    - _Requirements: 1.1, 1.7_

  - [x] 6.2 Implement Node Overview page with NodeCard grid
    - Create `src/pages/NodeOverviewPage.tsx`: fetch nodes on mount, render NodeCardGrid
    - Create `src/components/NodeCard.tsx`: display name, location, status indicator (online=green, offline=gray, override=warning icon/color), click navigates to detail
    - Handle loading states (skeleton/spinner), empty state, error state with retry
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 11.5_

  - [x] 6.3 Implement Node Detail / Telemetry Panel page
    - Create `src/pages/NodeDetailPage.tsx`: fetch telemetry on mount, subscribe to WS telemetry updates
    - Create `src/components/TelemetryPanel.tsx`: display V/A/W/Hz/PF/°C with correct precision and units
    - Implement temperature warning (>38°C) and critical (>40°C) visual states with "Temperature Override Active" label
    - Display last-update timestamp in YYYY-MM-DD HH:MM:SS format (local timezone)
    - Implement staleness indicator (30s timeout with elapsed time display)
    - Handle error state for failed telemetry fetch, connectivity status indicator
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x] 6.4 Write unit tests for NodeCard and TelemetryPanel
    - Test NodeCard renders all fields and status indicators correctly
    - Test TelemetryPanel temperature color states and staleness indicator
    - _Requirements: 3.2, 3.4, 4.3, 4.4, 4.5, 4.8_

- [x] 7. Feature pages - Sessions
  - [x] 7.1 Implement Active Sessions page
    - Create `src/pages/ActiveSessionsPage.tsx`: fetch active sessions, render session list sorted by start time (descending)
    - Create `src/components/SessionCard.tsx`: display node name, user, session type, start time, live HH:MM:SS timer, energy consumed, priority score
    - Subscribe to session_update WS messages; remove ended sessions with bill notification
    - Handle loading, error (with retry), and empty states
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 7.2 Implement Session History page
    - Create `src/pages/SessionHistoryPage.tsx`: fetch user sessions, render table with date, times, node, type, energy, duration, bill
    - Create `src/components/SessionFilter.tsx`: date range pickers, session type select, node select — all unset by default
    - Implement filter application with API re-fetch using query params
    - Implement delete action with confirmation, error handling, and list update on 204
    - Handle loading, error (with retry), and empty states
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 7.3 Write unit tests for SessionCard live timer and SessionFilter
    - Test live timer updates every second in correct HH:MM:SS format
    - Test filter controls produce correct query params
    - _Requirements: 6.5, 7.4_

- [x] 8. Feature pages - ALM, Profile, Node Management, Guest Session
  - [x] 8.1 Implement ALM Threshold Control page
    - Create `src/pages/ALMControlPage.tsx`: Threshold_Slider (range 1–100000 W, step 1 W)
    - Display current threshold and total transformer load side by side
    - On slider release with changed value: PUT /api/config/threshold; revert on failure with error notification
    - Display ALM event notifications (node shed + reason) for 10 seconds
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 8.2 Implement User Profile page
    - Create `src/pages/UserProfilePage.tsx` with React Hook Form + Zod schema validation
    - Implement UserProfileForm: name, evType select, brand, batteryCapacity, batteryType, chargerType, chargerPowerRating, RFID UID dynamic list (max 5)
    - Validate required fields and numeric ranges; disable submit until valid
    - POST for create, PUT with diff-only for update; display API errors preserving form data
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 8.3 Implement Node Management page
    - Create `src/pages/NodeManagementPage.tsx`: node registration form (nodeId, displayName, locationLabel) with inline validation
    - Validate nodeId format (1–64, alphanumeric + hyphens), name/label lengths (1–128)
    - POST to register, handle 201 response by adding to list; handle duplicate node ID error
    - Deregistration action on each NodeCard with confirmation dialog; DELETE on confirm, remove on 204
    - Error notifications for at least 5 seconds on failure
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 8.4 Implement Guest Session page
    - Create `src/pages/GuestSessionPage.tsx`: node selector (online + non-occupied + non-override nodes only)
    - Optional guest EV specs form: all 4 fields or none (partial rejected)
    - POST /api/sessions/guest on submit; success → add to active sessions + notification; failure → error notification
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 8.5 Implement Event Log page
    - Create `src/pages/EventLogPage.tsx`: display most recent 50 system events in reverse chronological order
    - Show timestamp, node name, event type, severity icon/color
    - _Requirements: 13.4, 13.5_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integration wiring and final polish
  - [x] 10.1 Wire WebSocket service to stores and notification system
    - Connect WebSocket service initialization on auth success
    - Route telemetry → TelemetryStore, node_status → NodeStore + UIStore notifications, alm_event → UIStore notifications + eventLog, session_update → SessionStore + UIStore
    - Disconnect WebSocket on logout
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 13.1, 13.2, 13.3_

  - [x] 10.2 Implement global error handling and timeout logic
    - Configure Axios 10s timeout globally
    - Implement loading indicator display while fetching
    - Implement timeout error message with retry option
    - Implement 401 redirect with "session expired" message
    - Implement duplicate error notification consolidation
    - _Requirements: 11.5, 11.6, 12.1, 12.3, 12.4, 12.8, 12.9_

  - [x] 10.3 Write integration tests for auth flow and WebSocket lifecycle
    - Test login → token stored → API requests have Bearer header → logout clears state
    - Test WebSocket connects on auth, reconnects on disconnect, closes on logout
    - Test 401 response triggers redirect to login
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 2.1, 2.3, 2.4, 2.5_

  - [x] 10.4 Write integration tests for real-time data flow
    - Test telemetry WS message updates TelemetryPanel values
    - Test node_status WS message updates NodeCard indicator
    - Test session_update WS message updates active sessions list
    - Test alm_event WS message triggers notification
    - _Requirements: 3.3, 4.2, 6.3, 6.4, 5.6, 13.1_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design's 25 properties
- Unit tests validate specific examples and edge cases
- The project uses TypeScript throughout, matching the backend codebase
- fast-check is used for property-based testing (already available in project)
- All WebSocket message handling follows the silent-discard pattern for invalid messages

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4", "1.5", "1.6", "1.7"] },
    { "id": 4, "tasks": ["2.1", "2.2"] },
    { "id": 5, "tasks": ["2.3", "2.4"] },
    { "id": 6, "tasks": ["4.1", "4.2", "4.3", "4.4"] },
    { "id": 7, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 8, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 9, "tasks": ["6.4", "7.1", "7.2"] },
    { "id": 10, "tasks": ["7.3", "8.1", "8.2", "8.3", "8.4", "8.5"] },
    { "id": 11, "tasks": ["10.1", "10.2"] },
    { "id": 12, "tasks": ["10.3", "10.4"] }
  ]
}
```
