import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import { authService } from './services/auth.service';
import { useWebSocketIntegration } from './hooks/useWebSocketIntegration';
import ProtectedRoute from './components/ProtectedRoute';
import ProtectedLayout from './components/layout/ProtectedLayout';
import LoginPage from './pages/LoginPage';
import NodeOverviewPage from './pages/NodeOverviewPage';
import NodeDetailPage from './pages/NodeDetailPage';
import ActiveSessionsPage from './pages/ActiveSessionsPage';
import SessionHistoryPage from './pages/SessionHistoryPage';
import UserProfilePage from './pages/UserProfilePage';
import NodeManagementPage from './pages/NodeManagementPage';
import ALMControlPage from './pages/ALMControlPage';
import EventLogPage from './pages/EventLogPage';
import GuestSessionPage from './pages/GuestSessionPage';
import UserManagementPage from './pages/UserManagementPage';

function App() {
  const setUser = useAuthStore((state) => state.setUser);
  const setToken = useAuthStore((state) => state.setToken);

  // Wire WebSocket to stores — connects on auth success, disconnects on logout
  useWebSocketIntegration();

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (user) => {
      setUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setToken(token);
        } catch {
          setToken(null);
        }
      } else {
        setToken(null);
      }
    });

    return unsubscribe;
  }, [setUser, setToken]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<NodeOverviewPage />} />
            <Route path="/nodes/:nodeId" element={<NodeDetailPage />} />
            <Route path="/sessions/active" element={<ActiveSessionsPage />} />
            <Route path="/sessions/history" element={<SessionHistoryPage />} />
            <Route path="/profile" element={<UserProfilePage />} />
            <Route path="/nodes/manage" element={<NodeManagementPage />} />
            <Route path="/alm" element={<ALMControlPage />} />
            <Route path="/events" element={<EventLogPage />} />
            <Route path="/guest-session" element={<GuestSessionPage />} />
            <Route path="/user-management" element={<UserManagementPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
