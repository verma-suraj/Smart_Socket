import { Outlet } from 'react-router-dom';
import NavShell from './NavShell';
import { NotificationStack } from '../NotificationStack';
import { ConnectionStatus } from '../ConnectionStatus';

/**
 * Layout wrapper for all protected routes.
 * Includes the navigation shell, notification stack, and connection status indicator.
 */
export default function ProtectedLayout() {
  return (
    <NavShell>
      <ConnectionStatus />
      <NotificationStack />
      <Outlet />
    </NavShell>
  );
}
