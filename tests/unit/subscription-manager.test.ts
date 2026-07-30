import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubscriptionManager } from '../../src/modules/mqtt-transport/subscription-manager.js';
import type { MqttClient } from 'mqtt';

function createMockClient(): MqttClient {
  return {
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  } as unknown as MqttClient;
}

describe('SubscriptionManager', () => {
  let client: MqttClient;
  let manager: SubscriptionManager;

  beforeEach(() => {
    client = createMockClient();
    manager = new SubscriptionManager(client);
  });

  describe('subscribe', () => {
    it('should subscribe to telemetry and rfid topics for a node', () => {
      manager.subscribe('node-001');

      expect(client.subscribe).toHaveBeenCalledTimes(2);
      expect(client.subscribe).toHaveBeenCalledWith(
        'alm/node/node-001/telemetry',
        { qos: 1 }
      );
      expect(client.subscribe).toHaveBeenCalledWith(
        'alm/node/node-001/rfid',
        { qos: 1 }
      );
    });

    it('should track node as active subscription', () => {
      manager.subscribe('node-001');

      expect(manager.getActiveSubscriptions()).toContain('node-001');
    });

    it('should not re-subscribe if already subscribed', () => {
      manager.subscribe('node-001');
      manager.subscribe('node-001');

      // Should only be called twice (once per topic on first subscribe)
      expect(client.subscribe).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple nodes independently', () => {
      manager.subscribe('node-001');
      manager.subscribe('node-002');

      expect(client.subscribe).toHaveBeenCalledTimes(4);
      expect(manager.getActiveSubscriptions()).toEqual(['node-001', 'node-002']);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from telemetry and rfid topics', () => {
      manager.subscribe('node-001');
      manager.unsubscribe('node-001');

      expect(client.unsubscribe).toHaveBeenCalledTimes(2);
      expect(client.unsubscribe).toHaveBeenCalledWith('alm/node/node-001/telemetry');
      expect(client.unsubscribe).toHaveBeenCalledWith('alm/node/node-001/rfid');
    });

    it('should remove node from active subscriptions', () => {
      manager.subscribe('node-001');
      manager.unsubscribe('node-001');

      expect(manager.getActiveSubscriptions()).not.toContain('node-001');
    });

    it('should do nothing if node is not subscribed', () => {
      manager.unsubscribe('node-999');

      expect(client.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('getActiveSubscriptions', () => {
    it('should return empty array when no subscriptions', () => {
      expect(manager.getActiveSubscriptions()).toEqual([]);
    });

    it('should reflect current subscription state', () => {
      manager.subscribe('node-001');
      manager.subscribe('node-002');
      manager.unsubscribe('node-001');

      expect(manager.getActiveSubscriptions()).toEqual(['node-002']);
    });
  });
});
