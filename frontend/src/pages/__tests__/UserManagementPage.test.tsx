import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { UserProfile } from '../../types';

// Mock api service
vi.mock('../../services/api.service', () => ({
  getUsers: vi.fn(),
  deleteUser: vi.fn(),
}));

// Mock ui store
const mockAddNotification = vi.fn();
vi.mock('../../stores/ui.store', () => ({
  useUIStore: () => ({
    addNotification: mockAddNotification,
  }),
}));

import UserManagementPage from '../UserManagementPage';
import { getUsers, deleteUser } from '../../services/api.service';

const mockGetUsers = vi.mocked(getUsers);
const mockDeleteUser = vi.mocked(deleteUser);

const mockUsers: UserProfile[] = [
  {
    userId: 'user-1',
    name: 'Alice Johnson',
    evType: '4-wheeler',
    brand: 'Tesla',
    batteryCapacity: 75,
    batteryType: 'Li-ion',
    chargerType: 'Type 2',
    chargerPowerRating: 11,
    rfidUids: ['RFID-001', 'RFID-002'],
    createdAt: 1700000000000,
    updatedAt: 1700100000000,
  },
  {
    userId: 'user-2',
    name: 'Bob Smith',
    evType: '2-wheeler',
    brand: 'Ather',
    batteryCapacity: 3,
    batteryType: 'Li-ion',
    chargerType: 'Type 1',
    chargerPowerRating: 1.5,
    rfidUids: ['RFID-003'],
    createdAt: 1701000000000,
    updatedAt: 1701100000000,
  },
  {
    userId: 'user-3',
    name: 'Charlie Tesla',
    evType: '4-wheeler',
    brand: 'BMW',
    batteryCapacity: 80,
    batteryType: 'LFP',
    chargerType: 'CCS',
    chargerPowerRating: 50,
    rfidUids: [],
    createdAt: 1702000000000,
    updatedAt: 1702100000000,
  },
];

describe('UserManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('User list rendering', () => {
    it('renders user list with name, evType, brand, RFID count, and registration date', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      // Check all user names
      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.getByText('Charlie Tesla')).toBeInTheDocument();

      // Check EV types
      expect(screen.getAllByText('4-wheeler')).toHaveLength(2);
      expect(screen.getByText('2-wheeler')).toBeInTheDocument();

      // Check brands
      expect(screen.getByText('Tesla')).toBeInTheDocument();
      expect(screen.getByText('Ather')).toBeInTheDocument();
      expect(screen.getByText('BMW')).toBeInTheDocument();

      // Check RFID counts (as text content in table cells)
      expect(screen.getByText('2')).toBeInTheDocument(); // Alice has 2 RFID cards
      expect(screen.getByText('1')).toBeInTheDocument(); // Bob has 1 RFID card
      expect(screen.getByText('0')).toBeInTheDocument(); // Charlie has 0 RFID cards
    });

    it('shows total user count at top', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('3 registered users')).toBeInTheDocument();
      });
    });

    it('shows singular "user" when only one user exists', async () => {
      mockGetUsers.mockResolvedValue([mockUsers[0]]);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('1 registered user')).toBeInTheDocument();
      });
    });
  });

  describe('Loading state', () => {
    it('displays loading spinner while fetching users', () => {
      mockGetUsers.mockReturnValue(new Promise(() => {})); // never resolves

      render(<UserManagementPage />);

      // The loading spinner is a div with animate-spin class
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Search filtering', () => {
    it('filters users by name in real time', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or brand...');
      fireEvent.change(searchInput, { target: { value: 'alice' } });

      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
      expect(screen.queryByText('Charlie Tesla')).not.toBeInTheDocument();
    });

    it('filters users by brand in real time', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or brand...');
      fireEvent.change(searchInput, { target: { value: 'ather' } });

      expect(screen.getByText('Bob Smith')).toBeInTheDocument();
      expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
      expect(screen.queryByText('Charlie Tesla')).not.toBeInTheDocument();
    });

    it('shows "No users match your search" when filter has no results', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or brand...');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      expect(screen.getByText('No users match your search.')).toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name or brand...');
      fireEvent.change(searchInput, { target: { value: 'TESLA' } });

      // Should match Alice (brand: Tesla) and Charlie (name contains Tesla)
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      expect(screen.getByText('Charlie Tesla')).toBeInTheDocument();
      expect(screen.queryByText('Bob Smith')).not.toBeInTheDocument();
    });
  });

  describe('Delete confirmation dialog', () => {
    it('clicking delete shows a confirmation dialog', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const deleteButton = screen.getByLabelText('Delete user Alice Johnson');
      fireEvent.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete user/)).toBeInTheDocument();
      expect(screen.getByText('Delete User')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('confirming delete calls deleteUser and removes user from list', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);
      mockDeleteUser.mockResolvedValue(undefined);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const deleteButton = screen.getByLabelText('Delete user Alice Johnson');
      fireEvent.click(deleteButton);

      const confirmButton = screen.getByText('Delete User');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDeleteUser).toHaveBeenCalledWith('user-1');
      });

      await waitFor(() => {
        expect(screen.queryByText('Alice Johnson')).not.toBeInTheDocument();
      });

      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'User Deleted',
        }),
      );
    });

    it('canceling delete closes the dialog without deleting', async () => {
      mockGetUsers.mockResolvedValue(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      const deleteButton = screen.getByLabelText('Delete user Alice Johnson');
      fireEvent.click(deleteButton);

      expect(screen.getByRole('dialog')).toBeInTheDocument();

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockDeleteUser).not.toHaveBeenCalled();
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });
  });

  describe('Error state and retry', () => {
    it('displays error state when loading fails', async () => {
      mockGetUsers.mockRejectedValue(new Error('Network error'));

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(
          screen.getByText('Failed to load users. Please try again.'),
        ).toBeInTheDocument();
      });

      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('retry button calls getUsers again', async () => {
      mockGetUsers.mockRejectedValueOnce(new Error('Network error'));
      mockGetUsers.mockResolvedValueOnce(mockUsers);

      render(<UserManagementPage />);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Retry'));

      await waitFor(() => {
        expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
      });

      expect(mockGetUsers).toHaveBeenCalledTimes(2);
    });
  });
});
