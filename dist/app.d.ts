import { Server as HttpServer } from 'http';
/**
 * Application bootstrap — initializes all modules, wires event handlers,
 * and starts the Express + WebSocket servers.
 *
 * Validates: Requirements 15.1, 15.2
 */
export declare function bootstrap(): Promise<{
    httpServer: HttpServer;
    shutdown: () => Promise<void>;
}>;
//# sourceMappingURL=app.d.ts.map