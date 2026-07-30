import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandLogger, createCommandLogger } from '../../src/modules/command-log/index.js';
import type { RelayCommand, DeliveryStatus } from '../../src/models/index.js';

/**
 * Unit tests for CommandLogger module.
 * Validates: Requirement 10.4 — Log every relay command with node_id, command_type,
 * reason, timestamp, delivery_status, and attempts.
 */

// Mock Firestore
function createMockFirestore() {
  const mockSet = vi.fn().mockResolvedValue(undefined);
  const mockDoc = vi.fn().mockReturnValue({ set: mockSet });
  const mockWhere = vi.fn();
  const mockOrderBy = vi.fn();
  const mockLimit = vi.fn();
  const mockGet = vi.fn();

  // Chain query methods
  mockWhere.mockReturnValue({ orderBy: mockOrderBy });
  mockOrderBy.mockReturnValue({ limit: mockLimit });
  mockLimit.mockReturnValue({ get: mockGet });
  mockGet.mockResolvedValue({ docs: [] });

  const mockCollection = vi.fn().mockReturnValue({
    doc: mockDoc,
    where: mockWhere,
  });

  return {
    firestore: { collection: mockCollection } as any,
    mockCollection,
    mockDoc,
    mockSet,
    mockWhere,
    mockOrderBy,
    mockLimit,
    mockGet,
  };
}

describe('CommandLogger', () => {
  let mocks: ReturnType<typeof createMockFirestore>;
  let logger: CommandLogger;

  beforeEach(() => {
    mocks = createMockFirestore();
    logger = new CommandLogger(mocks.firestore);
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
  });

  describe('logCommand', () => {
    it('should write a CommandLogDocument to the commandLog collection', () => {
      const command: RelayCommand = {
        relay_state: 'on',
        timestamp: 1700000000,
        reason: 'alm',
      };
      const deliveryStatus: DeliveryStatus = {
        delivered: true,
        attempts: 1,
        timestamp: 1700000001,
      };

      logger.logCommand('node-001', command, deliveryStatus);

      expect(mocks.mockCollection).toHaveBeenCalledWith('commandLog');
      expect(mocks.mockDoc).toHaveBeenCalledWith('test-uuid-1234');
      expect(mocks.mockSet).toHaveBeenCalledWith({
        commandId: 'test-uuid-1234',
        nodeId: 'node-001',
        commandType: 'relay_on',
        reason: 'alm',
        timestamp: 1700000000,
        deliveryStatus: 'delivered',
        attempts: 1,
        relayState: 'on',
      });
    });

    it('should map relay_state "off" to commandType "relay_off"', () => {
      const command: RelayCommand = {
        relay_state: 'off',
        timestamp: 1700000000,
        reason: 'safety',
      };
      const deliveryStatus: DeliveryStatus = {
        delivered: false,
        attempts: 3,
        timestamp: 1700000001,
      };

      logger.logCommand('node-002', command, deliveryStatus);

      expect(mocks.mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          commandType: 'relay_off',
          deliveryStatus: 'failed',
          relayState: 'off',
          reason: 'safety',
          attempts: 3,
        })
      );
    });

    it('should map delivered: false to deliveryStatus "failed"', () => {
      const command: RelayCommand = {
        relay_state: 'on',
        timestamp: 1700000000,
        reason: 'user',
      };
      const deliveryStatus: DeliveryStatus = {
        delivered: false,
        attempts: 2,
        timestamp: 1700000001,
      };

      logger.logCommand('node-003', command, deliveryStatus);

      expect(mocks.mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          deliveryStatus: 'failed',
        })
      );
    });

    it('should not throw when Firestore write fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mocks.mockSet.mockRejectedValueOnce(new Error('Firestore write failed'));

      const command: RelayCommand = {
        relay_state: 'on',
        timestamp: 1700000000,
        reason: 'auth',
      };
      const deliveryStatus: DeliveryStatus = {
        delivered: true,
        attempts: 1,
        timestamp: 1700000001,
      };

      // Should not throw
      expect(() => logger.logCommand('node-004', command, deliveryStatus)).not.toThrow();

      // Wait for the async catch to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CommandLogger] Failed to log command:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getCommandHistory', () => {
    it('should query Firestore with nodeId filter and default limit of 50', async () => {
      await logger.getCommandHistory('node-001');

      expect(mocks.mockCollection).toHaveBeenCalledWith('commandLog');
      expect(mocks.mockWhere).toHaveBeenCalledWith('nodeId', '==', 'node-001');
      expect(mocks.mockOrderBy).toHaveBeenCalledWith('timestamp', 'desc');
      expect(mocks.mockLimit).toHaveBeenCalledWith(50);
    });

    it('should respect custom limit parameter', async () => {
      await logger.getCommandHistory('node-001', 10);

      expect(mocks.mockLimit).toHaveBeenCalledWith(10);
    });

    it('should return mapped documents from Firestore', async () => {
      const mockDocs = [
        { data: () => ({ commandId: 'cmd-1', nodeId: 'node-001', commandType: 'relay_on' }) },
        { data: () => ({ commandId: 'cmd-2', nodeId: 'node-001', commandType: 'relay_off' }) },
      ];
      mocks.mockGet.mockResolvedValueOnce({ docs: mockDocs });

      const results = await logger.getCommandHistory('node-001');

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ commandId: 'cmd-1', nodeId: 'node-001', commandType: 'relay_on' });
      expect(results[1]).toEqual({ commandId: 'cmd-2', nodeId: 'node-001', commandType: 'relay_off' });
    });
  });

  describe('createCommandLogger', () => {
    it('should return a CommandLogger instance', () => {
      const instance = createCommandLogger(mocks.firestore);
      expect(instance).toBeInstanceOf(CommandLogger);
    });
  });
});
