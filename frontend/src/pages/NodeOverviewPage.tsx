import { useEffect } from 'react';
import { useNodeStore } from '../stores/node.store';
import { NodeCard } from '../components/NodeCard';

/**
 * NodeOverviewPage fetches and displays all registered nodes in a responsive grid.
 * Handles loading, error (with retry), and empty states.
 */
export default function NodeOverviewPage() {
  const nodes = useNodeStore((state) => state.nodes);
  const nodeStatuses = useNodeStore((state) => state.nodeStatuses);
  const loading = useNodeStore((state) => state.loading);
  const error = useNodeStore((state) => state.error);
  const fetchNodes = useNodeStore((state) => state.fetchNodes);

  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  const nodeList = Array.from(nodes.values());

  // Loading state
  if (loading && nodeList.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6">Node Overview</h1>
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div
              className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
              role="status"
              aria-label="Loading nodes"
            />
            <p className="text-sm text-gray-500">Loading nodes...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && nodeList.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6">Node Overview</h1>
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3 text-center">
            <svg
              className="w-10 h-10 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={() => fetchNodes()}
              className="mt-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (nodeList.length === 0) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-6">Node Overview</h1>
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3 text-center">
            <svg
              className="w-10 h-10 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-sm text-gray-500">No nodes registered</p>
          </div>
        </div>
      </div>
    );
  }

  // Node grid
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Node Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {nodeList.map((node) => (
          <NodeCard
            key={node.nodeId}
            node={node}
            realtimeStatus={nodeStatuses.get(node.nodeId)}
          />
        ))}
      </div>
    </div>
  );
}
