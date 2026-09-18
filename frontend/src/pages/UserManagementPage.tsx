import { useState, useEffect, useMemo, useCallback } from 'react';
import { useUIStore } from '../stores/ui.store';
import { getUsers, deleteUser } from '../services/api.service';
import type { UserProfile } from '../types';

interface DeleteDialogState {
  open: boolean;
  user: UserProfile | null;
}

export default function UserManagementPage() {
  const { addNotification } = useUIStore();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState>({
    open: false,
    user: null,
  });
  const [deleting, setDeleting] = useState(false);
  // Set when a normal delete is blocked by an active session — offers a force delete.
  const [forceMode, setForceMode] = useState(false);

  const fetchUserList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUserList();
  }, [fetchUserList]);

  // Filter users by name or brand (case-insensitive)
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.brand.toLowerCase().includes(query),
    );
  }, [users, searchQuery]);

  const handleRowClick = (userId: string) => {
    setExpandedUserId((prev) => (prev === userId ? null : userId));
  };

  const handleDeleteClick = (e: React.MouseEvent, user: UserProfile) => {
    e.stopPropagation();
    setDeleteDialog({ open: true, user });
  };

  const handleDeleteConfirm = async (force = false) => {
    if (!deleteDialog.user) return;
    const { userId, name } = deleteDialog.user;

    setDeleting(true);
    try {
      await deleteUser(userId, force);
      setUsers((prev) => prev.filter((u) => u.userId !== userId));
      addNotification({
        type: 'success',
        title: 'User Deleted',
        message: `User "${name}" has been removed successfully.`,
        autoDismiss: true,
        autoDismissMs: 5000,
      });
      setDeleteDialog({ open: false, user: null });
      setForceMode(false);
      if (expandedUserId === userId) {
        setExpandedUserId(null);
      }
    } catch (err: unknown) {
      let message = `Failed to delete user "${name}".`;
      let activeSession = false;
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { status?: number; data?: { error?: string } } };
        if (axiosErr.response?.status === 409) {
          activeSession = true;
          message = `Cannot delete "${name}" — user has an active charging session.`;
        } else if (axiosErr.response?.status === 404) {
          message = `User "${name}" was not found.`;
        } else if (axiosErr.response?.data?.error) {
          message = axiosErr.response.data.error;
        }
      }
      // Blocked by an active session on a normal delete → offer a force delete
      // instead of failing outright (keep the dialog open).
      if (activeSession && !force) {
        setForceMode(true);
      } else {
        addNotification({
          type: 'error',
          title: 'Delete Failed',
          message,
          autoDismiss: false,
        });
        setDeleteDialog({ open: false, user: null });
        setForceMode(false);
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, user: null });
    setForceMode(false);
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Error state with retry
  if (error && !loading) {
    return (
      <div className="space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <div className="flex flex-col items-center justify-center py-16">
          <svg className="w-12 h-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p className="text-gray-600 text-sm mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchUserList}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with title and total count */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {users.length} registered {users.length === 1 ? 'user' : 'users'}
          </p>
        </div>
      </div>

      {/* Search field */}
      <div>
        <label htmlFor="user-search" className="sr-only">
          Search users
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="user-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or brand..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-sm">
            {searchQuery.trim()
              ? 'No users match your search.'
              : 'No registered users found.'}
          </p>
        </div>
      ) : (
        /* User table */
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  EV Type
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Brand
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  RFID Cards
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Registered
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <UserRow
                  key={user.userId}
                  user={user}
                  expanded={expandedUserId === user.userId}
                  onRowClick={handleRowClick}
                  onDeleteClick={handleDeleteClick}
                  formatDate={formatDate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialog.open && deleteDialog.user && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="bg-white rounded-lg shadow-xl p-6 mx-4 max-w-md w-full">
            <h3 id="delete-dialog-title" className="text-lg font-semibold text-gray-900 mb-2">
              {forceMode ? 'Active Session — Force Delete?' : 'Confirm Delete'}
            </h3>
            {forceMode ? (
              <p className="text-sm text-amber-700 mb-6">
                <span className="font-medium text-gray-900">&quot;{deleteDialog.user.name}&quot;</span>{' '}
                has an active charging session. Force delete will <strong>end the session and stop the
                charger</strong>, then remove the profile. This cannot be undone.
              </p>
            ) : (
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete user{' '}
                <span className="font-medium text-gray-900">
                  &quot;{deleteDialog.user.name}&quot;
                </span>
                ? This will remove their profile and disassociate all RFID cards. This action cannot be undone.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleDeleteCancel}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConfirm(forceMode)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 transition-colors"
              >
                {deleting
                  ? (forceMode ? 'Force Deleting...' : 'Deleting...')
                  : (forceMode ? 'Force Delete' : 'Delete User')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── UserRow Sub-Component ───────────────────────────────────────────────────

interface UserRowProps {
  user: UserProfile;
  expanded: boolean;
  onRowClick: (userId: string) => void;
  onDeleteClick: (e: React.MouseEvent, user: UserProfile) => void;
  formatDate: (timestamp: number) => string;
}

function UserRow({ user, expanded, onRowClick, onDeleteClick, formatDate }: UserRowProps) {
  return (
    <>
      <tr
        onClick={() => onRowClick(user.userId)}
        className="hover:bg-gray-50 cursor-pointer transition-colors"
      >
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {user.name}
          </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {user.evType}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {user.brand}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {user.rfidUids.length}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
          {formatDate(user.createdAt)}
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-right">
          <button
            type="button"
            onClick={(e) => onDeleteClick(e, user)}
            className="p-1.5 rounded-md text-red-600 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
            aria-label={`Delete user ${user.name}`}
            title="Delete user"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-blue-50/50">
          <td colSpan={6} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">EV Specifications</h4>
                <dl className="space-y-1">
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Type:</dt>
                    <dd className="text-gray-900">{user.evType}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Brand:</dt>
                    <dd className="text-gray-900">{user.brand}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Battery Capacity:</dt>
                    <dd className="text-gray-900">{user.batteryCapacity} kWh</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Battery Type:</dt>
                    <dd className="text-gray-900">{user.batteryType}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Charger Type:</dt>
                    <dd className="text-gray-900">{user.chargerType}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Charger Power:</dt>
                    <dd className="text-gray-900">{user.chargerPowerRating} kW</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h4 className="font-medium text-gray-900 mb-2">
                  RFID Cards ({user.rfidUids.length})
                </h4>
                {user.rfidUids.length === 0 ? (
                  <p className="text-gray-500">No RFID cards registered.</p>
                ) : (
                  <ul className="space-y-1">
                    {user.rfidUids.map((uid) => (
                      <li key={uid} className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-green-400" aria-hidden="true" />
                        <code className="text-xs bg-gray-100 px-2 py-0.5 rounded font-mono text-gray-800">
                          {uid}
                        </code>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
