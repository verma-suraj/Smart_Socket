export type SafetyAction = {
    action: "none";
} | {
    action: "shutdown";
    reason: "temperature_exceeded";
    temperature: number;
} | {
    action: "block_reactivation";
    reason: "hysteresis_active";
    temperature: number;
};
export interface ITemperatureMonitor {
    checkTemperature(nodeId: string, temperature: number): SafetyAction;
    isInOverrideState(nodeId: string): boolean;
    canReactivate(nodeId: string, temperature: number): boolean;
}
//# sourceMappingURL=temperature-monitor.interface.d.ts.map