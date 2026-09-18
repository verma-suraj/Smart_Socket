import { Router } from 'express';
import { INodeRegistry } from '../../interfaces/node-registry.interface.js';
import { ISessionManager } from '../../interfaces/session-manager.interface.js';
import { IAuthModule } from '../../interfaces/auth-module.interface.js';
import { IAlmEngine } from '../../interfaces/alm-engine.interface.js';
import { IDashboardApi } from '../../interfaces/dashboard-api.interface.js';
import type { RelayCommand, DeliveryStatus } from '../../models/index.js';
/**
 * Dependencies required by the REST routes.
 */
export interface RestRouteDeps {
    nodeRegistry: INodeRegistry;
    sessionManager: ISessionManager;
    authModule: IAuthModule;
    almEngine: IAlmEngine;
    dashboardApi: IDashboardApi;
    /** Publishes a relay command to a node over MQTT. */
    publishCommand: (nodeId: string, command: RelayCommand) => Promise<DeliveryStatus>;
}
/**
 * Creates an Express Router with all dashboard REST API endpoints.
 * Uses dependency injection for all module interactions.
 */
export declare function createRestRoutes(deps: RestRouteDeps): Router;
//# sourceMappingURL=rest-routes.d.ts.map