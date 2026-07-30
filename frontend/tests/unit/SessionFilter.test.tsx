import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SessionFilter from '../../src/components/SessionFilter';
import type { NodeRecord } from '../../src/types';

// Mock the node store to provide test nodes for the node select dropdown
const mockNodes = new Map<string, NodeRecord>([
  [
    'node-001',
    {
      nodeId: 'node-001',
      displayName: 'Charger Alpha',
      locationLabel: 'Lot A',
      registrationDate: Date.now(),
      active: true,
      lastSeenTimestamp: Date.now(),
      inTemperatureOverride: false,
    },
  ],
  [
    'node-002',
    {
      nodeId: 'node-002',
      displayName: 'Charger Beta',
      locationLabel: 'Lot B',
      registrationDate: Date.now(),
      active: true,
      lastSeenTimestamp: Date.now(),
      inTemperatureOverride: false,
    },
  ],
]);

vi.mock('../../src/stores/node.store', () => ({
  useNodeStore: (selector: (state: { nodes: Map<string, NodeRecord> }) => unknown) =>
    selector({ nodes: mockNodes }),
}));

describe('SessionFilter', () => {
  let onApplyFilters: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onApplyFilters = vi.fn();
  });

  // Requirement 7.4: All filters unset by default
  describe('default state', () => {
    it('all filter inputs are empty/unset by default', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      const startDateInput = screen.getByLabelText('Start Date') as HTMLInputElement;
      const endDateInput = screen.getByLabelText('End Date') as HTMLInputElement;
      const sessionTypeSelect = screen.getByLabelText('Session Type') as HTMLSelectElement;
      const nodeSelect = screen.getByLabelText('Node') as HTMLSelectElement;

      expect(startDateInput.value).toBe('');
      expect(endDateInput.value).toBe('');
      expect(sessionTypeSelect.value).toBe('');
      expect(nodeSelect.value).toBe('');
    });

    it('does not call onApplyFilters on initial render', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);
      expect(onApplyFilters).not.toHaveBeenCalled();
    });
  });

  // Requirement 7.4: Applying filters calls onApplyFilters with correct SessionFilters object
  describe('applying filters', () => {
    it('calls onApplyFilters with startDate when start date is set', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      const startDateInput = screen.getByLabelText('Start Date');
      fireEvent.change(startDateInput, { target: { value: '2024-06-01' } });

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      expect(onApplyFilters).toHaveBeenCalledTimes(1);
      const filters = onApplyFilters.mock.calls[0][0];
      expect(filters.startDate).toBe(new Date('2024-06-01').getTime());
    });

    it('calls onApplyFilters with endDate set to end of day', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      const endDateInput = screen.getByLabelText('End Date');
      fireEvent.change(endDateInput, { target: { value: '2024-06-30' } });

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      expect(onApplyFilters).toHaveBeenCalledTimes(1);
      const filters = onApplyFilters.mock.calls[0][0];
      // End date should be set to end of day (23:59:59.999)
      const expectedEnd = new Date('2024-06-30');
      expectedEnd.setHours(23, 59, 59, 999);
      expect(filters.endDate).toBe(expectedEnd.getTime());
    });

    it('calls onApplyFilters with sessionType when session type is selected', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      const sessionTypeSelect = screen.getByLabelText('Session Type');
      fireEvent.change(sessionTypeSelect, { target: { value: 'guest' } });

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      expect(onApplyFilters).toHaveBeenCalledTimes(1);
      const filters = onApplyFilters.mock.calls[0][0];
      expect(filters.sessionType).toBe('guest');
    });

    it('calls onApplyFilters with nodeId when a node is selected', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      const nodeSelect = screen.getByLabelText('Node');
      fireEvent.change(nodeSelect, { target: { value: 'node-002' } });

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      expect(onApplyFilters).toHaveBeenCalledTimes(1);
      const filters = onApplyFilters.mock.calls[0][0];
      expect(filters.nodeId).toBe('node-002');
    });

    it('includes all defined filters when multiple are set', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2024-01-01' } });
      fireEvent.change(screen.getByLabelText('Session Type'), { target: { value: 'owner' } });
      fireEvent.change(screen.getByLabelText('Node'), { target: { value: 'node-001' } });

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      const filters = onApplyFilters.mock.calls[0][0];
      expect(filters.startDate).toBe(new Date('2024-01-01').getTime());
      expect(filters.sessionType).toBe('owner');
      expect(filters.nodeId).toBe('node-001');
    });
  });

  // Requirement 7.4: Only defined filter fields appear (undefined omitted)
  describe('undefined fields omitted', () => {
    it('applies empty object when no filters are set', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      expect(onApplyFilters).toHaveBeenCalledWith({});
    });

    it('omits startDate when not set but includes sessionType', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      fireEvent.change(screen.getByLabelText('Session Type'), { target: { value: 'guest' } });

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      const filters = onApplyFilters.mock.calls[0][0];
      expect(filters).not.toHaveProperty('startDate');
      expect(filters).not.toHaveProperty('endDate');
      expect(filters).not.toHaveProperty('nodeId');
      expect(filters.sessionType).toBe('guest');
    });

    it('omits sessionType when "All Types" is selected', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      // Select a type, then switch back to All Types
      const sessionTypeSelect = screen.getByLabelText('Session Type');
      fireEvent.change(sessionTypeSelect, { target: { value: 'owner' } });
      fireEvent.change(sessionTypeSelect, { target: { value: '' } });

      const applyButton = screen.getByRole('button', { name: 'Apply' });
      fireEvent.click(applyButton);

      const filters = onApplyFilters.mock.calls[0][0];
      expect(filters).not.toHaveProperty('sessionType');
    });
  });

  // Requirement 7.4: Clear button resets all filters and calls onApplyFilters with empty object
  describe('clear button', () => {
    it('resets all filter fields to empty', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      // Set all filters
      fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2024-01-01' } });
      fireEvent.change(screen.getByLabelText('End Date'), { target: { value: '2024-12-31' } });
      fireEvent.change(screen.getByLabelText('Session Type'), { target: { value: 'owner' } });
      fireEvent.change(screen.getByLabelText('Node'), { target: { value: 'node-001' } });

      // Click clear
      const clearButton = screen.getByRole('button', { name: 'Clear' });
      fireEvent.click(clearButton);

      // Verify all inputs are reset
      expect((screen.getByLabelText('Start Date') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('End Date') as HTMLInputElement).value).toBe('');
      expect((screen.getByLabelText('Session Type') as HTMLSelectElement).value).toBe('');
      expect((screen.getByLabelText('Node') as HTMLSelectElement).value).toBe('');
    });

    it('calls onApplyFilters with empty object when clear is clicked', () => {
      render(<SessionFilter onApplyFilters={onApplyFilters} />);

      // Set some filters
      fireEvent.change(screen.getByLabelText('Start Date'), { target: { value: '2024-03-15' } });
      fireEvent.change(screen.getByLabelText('Session Type'), { target: { value: 'guest' } });

      // Click clear
      const clearButton = screen.getByRole('button', { name: 'Clear' });
      fireEvent.click(clearButton);

      expect(onApplyFilters).toHaveBeenCalledWith({});
    });
  });
});
