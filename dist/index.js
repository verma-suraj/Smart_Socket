import { bootstrap } from './app.js';
/**
 * Application entry point.
 * Calls the bootstrap function which initializes all modules and starts the server.
 */
bootstrap().catch((error) => {
    console.error('[App] Fatal error during bootstrap:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map