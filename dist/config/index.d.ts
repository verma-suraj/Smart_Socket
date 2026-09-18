import 'dotenv/config';
export declare const config: {
    mqtt: {
        brokerUrl: string;
        username: string;
        password: string;
        qos: 0 | 1 | 2;
        topics: {
            telemetry: string;
            command: string;
            rfid: string;
            authResponse: string;
        };
        reconnect: {
            baseDelay: number;
            maxDelay: number;
        };
        command: {
            ackTimeout: number;
            maxRetries: number;
        };
    };
    firebase: {
        projectId: string;
        serviceAccountPath: string;
    };
    alm: {
        defaultThreshold: number;
        evaluationDebounceMs: number;
    };
    temperature: {
        overrideThreshold: number;
        reactivationThreshold: number;
    };
    session: {
        defaultSOC: number;
        perUnitRate: number;
    };
    auth: {
        rfidTimeoutMs: number;
    };
    node: {
        staleThresholdMs: number;
    };
    server: {
        port: number;
        host: string;
    };
};
//# sourceMappingURL=index.d.ts.map