export interface ShedResult {
    nodeId: string;
    reason: "alm_overload";
    priorityScore: number;
    timestamp: number;
}
export interface IAlmEngine {
    updateLoad(nodeId: string, power: number): void;
    getTotalLoad(): number;
    getThreshold(): number;
    setThreshold(value: number): Promise<void>;
    evaluateAndShed(): Promise<ShedResult[]>;
    getNodePriority(nodeId: string): number;
}
//# sourceMappingURL=alm-engine.interface.d.ts.map