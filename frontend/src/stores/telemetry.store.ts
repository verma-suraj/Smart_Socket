import { create } from 'zustand';
import type { TelemetryPayload } from '../types';

export interface TelemetryState {
  telemetryByNode: Map<string, TelemetryPayload>;
  lastUpdateByNode: Map<string, number>;
  totalLoad: number;
  updateTelemetry: (nodeId: string, payload: TelemetryPayload) => void;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  telemetryByNode: new Map(),
  lastUpdateByNode: new Map(),
  totalLoad: 0,

  updateTelemetry: (nodeId: string, payload: TelemetryPayload) => {
    set((state) => {
      const telemetryByNode = new Map(state.telemetryByNode);
      const lastUpdateByNode = new Map(state.lastUpdateByNode);

      telemetryByNode.set(nodeId, payload);
      lastUpdateByNode.set(nodeId, Date.now());

      // Recompute totalLoad as sum of power values across all nodes
      let totalLoad = 0;
      for (const entry of telemetryByNode.values()) {
        totalLoad += entry.power;
      }

      return { telemetryByNode, lastUpdateByNode, totalLoad };
    });
  },
}));
