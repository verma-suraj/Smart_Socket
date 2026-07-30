import { NodeRecord, RegisterNodeParams } from '../models/index.js';

export interface INodeRegistry {
  registerNode(params: RegisterNodeParams): Promise<NodeRecord>;
  deregisterNode(nodeId: string): Promise<void>;
  getNode(nodeId: string): NodeRecord | null;
  getAllActiveNodes(): NodeRecord[];
  updateLastSeen(nodeId: string, timestamp: number): void;
  getStaleNodes(thresholdMs?: number): NodeRecord[];
}
