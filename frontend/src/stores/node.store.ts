import { create } from 'zustand';
import { getNodes } from '../services/api.service';
import type { NodeRecord, NodeStatus } from '../types';

export interface NodeState {
  nodes: Map<string, NodeRecord>;
  nodeStatuses: Map<string, NodeStatus>;
  loading: boolean;
  error: string | null;
  fetchNodes: () => Promise<void>;
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  addNode: (node: NodeRecord) => void;
  removeNode: (nodeId: string) => void;
}

export const useNodeStore = create<NodeState>((set) => ({
  nodes: new Map(),
  nodeStatuses: new Map(),
  loading: false,
  error: null,

  fetchNodes: async () => {
    set({ loading: true, error: null });
    try {
      const nodeList = await getNodes();
      const nodes = new Map<string, NodeRecord>();
      for (const node of nodeList) {
        nodes.set(node.nodeId, node);
      }
      set({ nodes, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch nodes';
      set({ error: message, loading: false });
    }
  },

  updateNodeStatus: (nodeId: string, status: NodeStatus) => {
    set((state) => {
      const nodeStatuses = new Map(state.nodeStatuses);
      nodeStatuses.set(nodeId, status);
      return { nodeStatuses };
    });
  },

  addNode: (node: NodeRecord) => {
    set((state) => {
      const nodes = new Map(state.nodes);
      nodes.set(node.nodeId, node);
      return { nodes };
    });
  },

  removeNode: (nodeId: string) => {
    set((state) => {
      const nodes = new Map(state.nodes);
      const nodeStatuses = new Map(state.nodeStatuses);
      nodes.delete(nodeId);
      nodeStatuses.delete(nodeId);
      return { nodes, nodeStatuses };
    });
  },
}));
