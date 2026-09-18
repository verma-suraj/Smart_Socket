import { NodeRecord, TelemetryPayload, Session, SessionFilters, RegisterNodeParams } from '../models/index.js';
export type NodeStatus = "online" | "offline" | "override";
export interface AlmEvent {
    type: "shedding";
    nodeId: string;
    reason: string;
    timestamp: number;
}
export interface IDashboardApi {
    getNodes(): NodeRecord[];
    getNodeTelemetry(nodeId: string): TelemetryPayload | null;
    getActiveSessions(): Session[];
    getUserSessions(userId: string, filters?: SessionFilters): Promise<Session[]>;
    setThreshold(value: number): void;
    registerNode(params: RegisterNodeParams): Promise<NodeRecord>;
    emitTelemetryUpdate(nodeId: string, payload: TelemetryPayload): void;
    emitNodeStatusChange(nodeId: string, status: NodeStatus): void;
    emitAlmEvent(event: AlmEvent): void;
    emitSessionUpdate(session: Session): void;
}
//# sourceMappingURL=dashboard-api.interface.d.ts.map