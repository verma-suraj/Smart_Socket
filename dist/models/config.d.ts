/**
 * System configuration document stored in Firestore.
 */
export interface ConfigDocument {
    loadThreshold: number;
    perUnitRate: number;
    updatedAt: number;
    updatedBy: string;
}
/**
 * Command log entry stored in Firestore.
 */
export interface CommandLogDocument {
    commandId: string;
    nodeId: string;
    commandType: "relay_on" | "relay_off";
    reason: "alm" | "safety" | "user" | "auth" | "auth_denied";
    timestamp: number;
    deliveryStatus: "pending" | "delivered" | "failed";
    attempts: number;
    relayState: "on" | "off";
}
//# sourceMappingURL=config.d.ts.map