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
const LEVEL_ORDER = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
/**
 * Minimum level to emit. Controlled by LOG_LEVEL env var (default: info).
 * Set LOG_LEVEL=debug for verbose local debugging.
 */
function resolveMinLevel() {
    const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
    if (raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error') {
        return raw;
    }
    return 'info';
}
let minLevel = resolveMinLevel();
/**
 * Serialize a context object safely. Errors are expanded to message + stack.
 */
function serializeContext(context) {
    if (!context || Object.keys(context).length === 0) {
        return '';
    }
    const safe = {};
    for (const [key, value] of Object.entries(context)) {
        if (value instanceof Error) {
            safe[key] = { message: value.message, stack: value.stack };
        }
        else {
            safe[key] = value;
        }
    }
    try {
        return ' ' + JSON.stringify(safe);
    }
    catch {
        return ' [unserializable context]';
    }
}
function emit(level, scope, message, context) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) {
        return;
    }
    const timestamp = new Date().toISOString();
    const line = `${timestamp} [${level.toUpperCase()}] [${scope}] ${message}${serializeContext(context)}`;
    switch (level) {
        case 'error':
            console.error(line);
            break;
        case 'warn':
            console.warn(line);
            break;
        default:
            console.log(line);
            break;
    }
}
export const logger = {
    /** Set the minimum log level at runtime (useful for tests). */
    setLevel(level) {
        minLevel = level;
    },
    debug(scope, message, context) {
        emit('debug', scope, message, context);
    },
    info(scope, message, context) {
        emit('info', scope, message, context);
    },
    warn(scope, message, context) {
        emit('warn', scope, message, context);
    },
    error(scope, message, context) {
        emit('error', scope, message, context);
    },
};
//# sourceMappingURL=index.js.map