/**
 * Structured application logger.
 *
 * Emits single-line, level-prefixed, timestamped log entries with an optional
 * structured context object serialized as JSON. Keeping logs structured and
 * consistent makes it far easier to grep, ship to a log aggregator, and debug
 * production issues after the fact.
 *
 * Usage:
 *   import { logger } from '../logger/index.js';
 *   logger.info('SessionManager', 'Session finalized', { nodeId, sessionId });
 *   logger.error('MqttTransport', 'Publish failed', { nodeId, error });
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare const logger: {
    /** Set the minimum log level at runtime (useful for tests). */
    setLevel(level: LogLevel): void;
    debug(scope: string, message: string, context?: Record<string, unknown>): void;
    info(scope: string, message: string, context?: Record<string, unknown>): void;
    warn(scope: string, message: string, context?: Record<string, unknown>): void;
    error(scope: string, message: string, context?: Record<string, unknown>): void;
};
//# sourceMappingURL=index.d.ts.map