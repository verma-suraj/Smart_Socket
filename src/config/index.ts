import 'dotenv/config';

export const config = {
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME || '',
    password: process.env.MQTT_PASSWORD || '',
    qos: (parseInt(process.env.MQTT_QOS || '1', 10) as 0 | 1 | 2),
    topics: {
      telemetry: 'alm/node/{node_id}/telemetry',
      command: 'alm/node/{node_id}/command',
      rfid: 'alm/node/{node_id}/rfid',
      authResponse: 'alm/node/{node_id}/auth_response',
    },
    reconnect: {
      baseDelay: parseInt(process.env.MQTT_RECONNECT_BASE_DELAY || '1000', 10),
      maxDelay: parseInt(process.env.MQTT_RECONNECT_MAX_DELAY || '60000', 10),
    },
    command: {
      ackTimeout: parseInt(process.env.MQTT_COMMAND_ACK_TIMEOUT || '5000', 10),
      maxRetries: parseInt(process.env.MQTT_COMMAND_MAX_RETRIES || '3', 10),
    },
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',
  },
  alm: {
    defaultThreshold: parseInt(process.env.ALM_DEFAULT_THRESHOLD || '10000', 10), // watts
    evaluationDebounceMs: parseInt(process.env.ALM_EVALUATION_DEBOUNCE_MS || '1000', 10),
  },
  temperature: {
    overrideThreshold: parseFloat(process.env.TEMP_OVERRIDE_THRESHOLD || '40'),
    reactivationThreshold: parseFloat(process.env.TEMP_REACTIVATION_THRESHOLD || '38'),
  },
  session: {
    defaultSOC: parseFloat(process.env.SESSION_DEFAULT_SOC || '0.20'),
    perUnitRate: parseFloat(process.env.SESSION_PER_UNIT_RATE || '8.0'),
  },
  auth: {
    rfidTimeoutMs: parseInt(process.env.RFID_AUTH_TIMEOUT_MS || '3000', 10),
  },
  node: {
    staleThresholdMs: parseInt(process.env.NODE_STALE_THRESHOLD_MS || '30000', 10),
  },
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    host: process.env.HOST || '0.0.0.0',
  },
};
