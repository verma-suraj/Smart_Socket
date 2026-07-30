import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NodeCard } from '../../src/components/NodeCard';
import type { NodeRecord } from '../../src/types';

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

function createNode(overrides: Partial<NodeRecord> = {}): NodeRecord {
  return {
    nodeId: 'node-001',
    displayName: 'Charger Alpha',
    locationLabel: 'Parking Lot A',
    registrationDate: Date.now(),
    active: true,
    lastSeenTimestamp: Date.now(),
    inTemperatureOverride: false,
    ...overrides,
  };
}

describe('NodeCard', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  // Requirement 3.2: Node_Card shows display name, location label, and status indicator
  describe('renders all fields correctly', () => {
    it('displays the node displayName', () => {
      render(<NodeCard node={createNode({ displayName: 'My Charger' })} />);
      expect(screen.getByText('My Charger')).toBeInTheDocument();
    });

    it('displays the node locationLabel', () => {
      render(<NodeCard node={createNode({ locationLabel: 'Building B Floor 2' })} />);
      expect(screen.getByText('Building B Floor 2')).toBeInTheDocument();
    });
  });

  // Requirement 3.2, 3.4: Status indicators
  describe('status indicators', () => {
    it('shows green indicator and "Online" label for active node', () => {
      render(<NodeCard node={createNode({ active: true, inTemperatureOverride: false })} />);
      expect(screen.getByText('Online')).toBeInTheDocument();
      // Green dot should be present
      const dot = screen.getByText('Online').previousElementSibling;
      expect(dot).toHaveClass('bg-green-500');
    });

    it('shows gray indicator and "Offline" label for inactive node', () => {
      render(<NodeCard node={createNode({ active: false, inTemperatureOverride: false })} />);
      expect(screen.getByText('Offline')).toBeInTheDocument();
      const dot = screen.getByText('Offline').previousElementSibling;
      expect(dot).toHaveClass('bg-gray-400');
    });

    it('shows warning indicator and "Override" label for temperature override', () => {
      render(<NodeCard node={createNode({ inTemperatureOverride: true })} />);
      expect(screen.getByText('Override')).toBeInTheDocument();
      // Override uses an SVG warning icon, not a dot
      const label = screen.getByText('Override');
      const svg = label.previousElementSibling;
      expect(svg?.tagName.toLowerCase()).toBe('svg');
      expect(svg).toHaveClass('text-amber-500');
    });

    it('uses realtimeStatus override when provided', () => {
      // Node is active (online) but realtimeStatus says offline
      render(
        <NodeCard
          node={createNode({ active: true, inTemperatureOverride: false })}
          realtimeStatus="offline"
        />
      );
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('realtimeStatus "override" shows warning icon', () => {
      render(
        <NodeCard
          node={createNode({ active: true, inTemperatureOverride: false })}
          realtimeStatus="override"
        />
      );
      expect(screen.getByText('Override')).toBeInTheDocument();
    });
  });

  // Requirement 3.5: Click navigates to node detail
  describe('navigation on click', () => {
    it('navigates to /nodes/:nodeId when clicked', () => {
      render(<NodeCard node={createNode({ nodeId: 'node-xyz' })} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(mockNavigate).toHaveBeenCalledWith('/nodes/node-xyz');
    });

    it('has accessible aria-label with displayName', () => {
      render(<NodeCard node={createNode({ displayName: 'Test Node' })} />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'View details for Test Node');
    });
  });
});
