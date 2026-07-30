import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThresholdManager } from '../../src/modules/alm-engine/threshold-manager.js';

/**
 * Creates a minimal Firestore mock for testing the ThresholdManager.
 */
function createFirestoreMock(existingDoc?: { loadThreshold?: number }) {
  const setMock = vi.fn().mockResolvedValue(undefined);
  const getMock = vi.fn().mockResolvedValue({
    exists: !!existingDoc,
    data: () => existingDoc ?? null,
  });
  const docMock = vi.fn().mockReturnValue({ set: setMock, get: getMock });
  const collectionMock = vi.fn().mockReturnValue({ doc: docMock });

  return {
    firestore: { collection: collectionMock } as any,
    setMock,
    getMock,
    docMock,
    collectionMock,
  };
}

describe('ThresholdManager', () => {
  let manager: ThresholdManager;
  let mocks: ReturnType<typeof createFirestoreMock>;

  beforeEach(() => {
    mocks = createFirestoreMock();
    manager = new ThresholdManager(mocks.firestore);
  });

  describe('getThreshold', () => {
    it('should return default threshold (10000W) initially', () => {
      expect(manager.getThreshold()).toBe(10000);
    });
  });

  describe('setThreshold', () => {
    it('should update in-memory threshold immediately', async () => {
      await manager.setThreshold(8000);
      expect(manager.getThreshold()).toBe(8000);
    });

    it('should persist the threshold to Firestore', async () => {
      await manager.setThreshold(7500, 'admin-1');

      expect(mocks.collectionMock).toHaveBeenCalledWith('config');
      expect(mocks.docMock).toHaveBeenCalledWith('alm');
      expect(mocks.setMock).toHaveBeenCalledWith(
        {
          loadThreshold: 7500,
          updatedAt: expect.any(Number),
          updatedBy: 'admin-1',
        },
        { merge: true }
      );
    });

    it('should default updatedBy to "system" when not specified', async () => {
      await manager.setThreshold(9000);

      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({ updatedBy: 'system' }),
        { merge: true }
      );
    });

    it('should allow threshold to be updated multiple times', async () => {
      await manager.setThreshold(8000);
      expect(manager.getThreshold()).toBe(8000);

      await manager.setThreshold(6000);
      expect(manager.getThreshold()).toBe(6000);
    });

    it('should apply new threshold immediately for subsequent calls', async () => {
      // Simulates Requirement 4.4: immediately use new threshold
      expect(manager.getThreshold()).toBe(10000);
      await manager.setThreshold(5000);
      expect(manager.getThreshold()).toBe(5000);
    });
  });

  describe('loadThreshold', () => {
    it('should load persisted threshold from Firestore', async () => {
      const mocksWithDoc = createFirestoreMock({ loadThreshold: 8500 });
      const mgr = new ThresholdManager(mocksWithDoc.firestore);

      await mgr.loadThreshold();

      expect(mgr.getThreshold()).toBe(8500);
      expect(mocksWithDoc.collectionMock).toHaveBeenCalledWith('config');
      expect(mocksWithDoc.docMock).toHaveBeenCalledWith('alm');
    });

    it('should fall back to default if no persisted value exists', async () => {
      // mocks has no existing doc by default
      await manager.loadThreshold();
      expect(manager.getThreshold()).toBe(10000);
    });

    it('should fall back to default if Firestore document has no loadThreshold field', async () => {
      const mocksWithBadDoc = createFirestoreMock({} as any);
      const mgr = new ThresholdManager(mocksWithBadDoc.firestore);

      await mgr.loadThreshold();
      expect(mgr.getThreshold()).toBe(10000);
    });

    it('should fall back to default if Firestore read fails', async () => {
      const failingMocks = createFirestoreMock();
      failingMocks.getMock.mockRejectedValue(new Error('Firestore unavailable'));
      const mgr = new ThresholdManager(failingMocks.firestore);

      await mgr.loadThreshold();
      expect(mgr.getThreshold()).toBe(10000);
    });

    it('should survive server restarts by reading persisted value', async () => {
      // Simulate: first instance sets threshold
      const mocksWrite = createFirestoreMock();
      const instance1 = new ThresholdManager(mocksWrite.firestore);
      await instance1.setThreshold(6000);

      // Simulate: second instance reads it back on startup
      const mocksRead = createFirestoreMock({ loadThreshold: 6000 });
      const instance2 = new ThresholdManager(mocksRead.firestore);
      await instance2.loadThreshold();

      expect(instance2.getThreshold()).toBe(6000);
    });
  });
});
