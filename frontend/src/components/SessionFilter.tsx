import { useState } from 'react';
import type { SessionFilters } from '../types';
import { useNodeStore } from '../stores/node.store';

interface SessionFilterProps {
  onApplyFilters: (filters: SessionFilters) => void;
}

/**
 * SessionFilter component provides date range pickers, session type select,
 * and node select — all unset by default so all sessions are displayed initially.
 */
export default function SessionFilter({ onApplyFilters }: SessionFilterProps) {
  const nodes = useNodeStore((state) => state.nodes);

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sessionType, setSessionType] = useState<string>('');
  const [nodeId, setNodeId] = useState<string>('');

  const handleApply = () => {
    const filters: SessionFilters = {};

    if (startDate) {
      filters.startDate = new Date(startDate).getTime();
    }
    if (endDate) {
      // Set end date to end of the selected day
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filters.endDate = endOfDay.getTime();
    }
    if (sessionType === 'owner' || sessionType === 'guest') {
      filters.sessionType = sessionType;
    }
    if (nodeId) {
      filters.nodeId = nodeId;
    }

    onApplyFilters(filters);
  };

  const handleClear = () => {
    setStartDate('');
    setEndDate('');
    setSessionType('');
    setNodeId('');
    onApplyFilters({});
  };

  const nodeList = Array.from(nodes.values());

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        {/* Start Date */}
        <div>
          <label
            htmlFor="filter-start-date"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Start Date
          </label>
          <input
            id="filter-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* End Date */}
        <div>
          <label
            htmlFor="filter-end-date"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            End Date
          </label>
          <input
            id="filter-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Session Type */}
        <div>
          <label
            htmlFor="filter-session-type"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Session Type
          </label>
          <select
            id="filter-session-type"
            value={sessionType}
            onChange={(e) => setSessionType(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Types</option>
            <option value="owner">Owner</option>
            <option value="guest">Guest</option>
          </select>
        </div>

        {/* Node Select */}
        <div>
          <label
            htmlFor="filter-node"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Node
          </label>
          <select
            id="filter-node"
            value={nodeId}
            onChange={(e) => setNodeId(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Nodes</option>
            {nodeList.map((node) => (
              <option key={node.nodeId} value={node.nodeId}>
                {node.displayName}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
