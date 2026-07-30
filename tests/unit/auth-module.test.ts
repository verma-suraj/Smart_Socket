import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthModule } from '../../src/modules/auth/index.js';

/**
 * Creates a minimal Firestore mock for auth module testing.
 */
function createFirestoreMock() {
  const setMock = vi.fn().mockResolvedValue(undefined);
  const getMock = vi.fn().mockResolvedValue({ empty: true, docs: [] });
  const updateMock = vi.fn().mockResolvedValue(undefined);

  const docMock = vi.fn().mockReturnValue({
    id: 'auto-generated-id',
    set: setMock,
    get: getMock,
    update: updateMock,
  });

  const limitMock = vi.fn().mockReturnValue({ get: getMock });
  const whereMock = vi.fn().mockReturnValue({ limit: limitMock, get: getMock });

  const collectionMock = vi.fn().mockReturnValue({
    doc: docMock,
    where: whereMock,
  });

  return {
    firestore: { collection: collectionMock } as any,
    setMock,
    getMock,
    updateMock,
    docMock,
    whereMock,
    limitMock,
    collectionMock,
  };
}

describe('AuthModule', () => {
  let authModule: AuthModule;
  let mocks: ReturnType<typeof createFirestoreMock>;

  beforeEach(() => {
    mocks = createFirestoreMock();
    authModule = new AuthModule(mocks.firestore);
  });

  describe('authenticateRfid', () => {
    it('should return success when RFID UID is found in user database', async () => {
      // Mock Firestore to return a matching user
      const mockSnapshot = {
        empty: false,
        docs: [{ id: 'user-123', data: () => ({ name: 'Test User', rfidUids: ['ABC123'] }) }],
      };
      mocks.limitMock.mockReturnValue({ get: vi.fn().mockResolvedValue(mockSnapshot) });

      const result = await authModule.authenticateRfid('node-1', 'ABC123');

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.responseTime).toBeLessThan(3000);
      expect(result.error).toBeUndefined();
    });

    it('should return access_denied when RFID UID is not found', async () => {
      // Default mock returns empty snapshot
      mocks.limitMock.mockReturnValue({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });

      const result = await authModule.authenticateRfid('node-1', 'UNKNOWN_UID');

      expect(result.success).toBe(false);
      expect(result.error).toBe('access_denied');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(result.userId).toBeUndefined();
    });

    it('should return auth_timeout when lookup exceeds 3 seconds', async () => {
      // Mock a slow Firestore query
      mocks.limitMock.mockReturnValue({
        get: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ empty: true, docs: [] }), 5000))
        ),
      });

      const result = await authModule.authenticateRfid('node-1', 'SLOW_UID');

      expect(result.success).toBe(false);
      expect(result.error).toBe('auth_timeout');
      expect(result.responseTime).toBeGreaterThanOrEqual(3000);
    }, 10000);

    it('should return auth_error when Firestore throws an exception', async () => {
      mocks.limitMock.mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Firestore unavailable')),
      });

      const result = await authModule.authenticateRfid('node-1', 'ERR_UID');

      expect(result.success).toBe(false);
      expect(result.error).toContain('auth_error');
      expect(result.error).toContain('Firestore unavailable');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should query Firestore users collection with array-contains', async () => {
      mocks.limitMock.mockReturnValue({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });

      await authModule.authenticateRfid('node-1', 'TEST_UID');

      expect(mocks.collectionMock).toHaveBeenCalledWith('users');
      expect(mocks.whereMock).toHaveBeenCalledWith('rfidUids', 'array-contains', 'TEST_UID');
    });

    it('should include responseTime in all results', async () => {
      mocks.limitMock.mockReturnValue({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });

      const result = await authModule.authenticateRfid('node-1', 'ANY_UID');

      expect(typeof result.responseTime).toBe('number');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('createUser', () => {
    it('should create a user profile with all valid fields', async () => {
      const input = {
        name: 'John Doe',
        evType: '4-wheeler' as const,
        brand: 'Tesla',
        batteryCapacity: 75,
        batteryType: 'Li-ion',
        chargerType: 'Type 2',
        chargerPowerRating: 7.4,
        rfidUids: ['RFID001'],
      };

      const result = await authModule.createUser(input);

      expect(result.userId).toBe('auto-generated-id');
      expect(result.name).toBe('John Doe');
      expect(result.evType).toBe('4-wheeler');
      expect(result.brand).toBe('Tesla');
      expect(result.batteryCapacity).toBe(75);
      expect(result.batteryType).toBe('Li-ion');
      expect(result.chargerType).toBe('Type 2');
      expect(result.chargerPowerRating).toBe(7.4);
      expect(result.rfidUids).toEqual(['RFID001']);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it('should throw error when name is missing', async () => {
      const input = {
        name: '',
        evType: '2-wheeler' as const,
        brand: 'Ather',
        batteryCapacity: 2.9,
        batteryType: 'Li-ion',
        chargerType: 'Type 1',
        chargerPowerRating: 1.5,
        rfidUids: [],
      };

      await expect(authModule.createUser(input)).rejects.toThrow('Missing required fields');
      await expect(authModule.createUser(input)).rejects.toThrow('name');
    });

    it('should throw error when batteryCapacity is missing or invalid', async () => {
      const input = {
        name: 'Jane',
        evType: '4-wheeler' as const,
        brand: 'Tata',
        batteryCapacity: 0,
        batteryType: 'Li-ion',
        chargerType: 'Type 2',
        chargerPowerRating: 7.4,
        rfidUids: [],
      };

      await expect(authModule.createUser(input)).rejects.toThrow('batteryCapacity');
    });

    it('should throw error when chargerPowerRating is missing or invalid', async () => {
      const input = {
        name: 'Jane',
        evType: '4-wheeler' as const,
        brand: 'Tata',
        batteryCapacity: 30,
        batteryType: 'Li-ion',
        chargerType: 'Type 2',
        chargerPowerRating: -1,
        rfidUids: [],
      };

      await expect(authModule.createUser(input)).rejects.toThrow('chargerPowerRating');
    });

    it('should throw error listing all missing required fields', async () => {
      const input = {
        name: '',
        evType: '2-wheeler' as const,
        brand: '',
        batteryCapacity: 0,
        batteryType: '',
        chargerType: '',
        chargerPowerRating: 0,
        rfidUids: [],
      };

      await expect(authModule.createUser(input)).rejects.toThrow('name');
      await expect(authModule.createUser(input)).rejects.toThrow('batteryCapacity');
      await expect(authModule.createUser(input)).rejects.toThrow('chargerPowerRating');
    });

    it('should store the user in Firestore', async () => {
      const input = {
        name: 'Test User',
        evType: '2-wheeler' as const,
        brand: 'Ola',
        batteryCapacity: 3.97,
        batteryType: 'NMC',
        chargerType: 'Portable',
        chargerPowerRating: 0.75,
        rfidUids: ['UID_A'],
      };

      await authModule.createUser(input);

      expect(mocks.setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'auto-generated-id',
          name: 'Test User',
          batteryCapacity: 3.97,
          chargerPowerRating: 0.75,
        })
      );
    });
  });

  describe('updateUser', () => {
    it('should update an existing user profile', async () => {
      const existingUser = {
        userId: 'user-1',
        name: 'Original',
        evType: '4-wheeler',
        brand: 'Tesla',
        batteryCapacity: 75,
        batteryType: 'Li-ion',
        chargerType: 'Type 2',
        chargerPowerRating: 7.4,
        rfidUids: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      // Mock doc.get() to return existing user
      mocks.docMock.mockReturnValue({
        id: 'user-1',
        set: mocks.setMock,
        get: vi.fn()
          .mockResolvedValueOnce({ exists: true, data: () => existingUser })
          .mockResolvedValueOnce({
            exists: true,
            data: () => ({ ...existingUser, name: 'Updated', updatedAt: Date.now() }),
          }),
        update: mocks.updateMock,
      });

      const result = await authModule.updateUser('user-1', { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(mocks.updateMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Updated', updatedAt: expect.any(Number) })
      );
    });

    it('should throw error when user does not exist', async () => {
      mocks.docMock.mockReturnValue({
        id: 'nonexistent',
        set: mocks.setMock,
        get: vi.fn().mockResolvedValue({ exists: false }),
        update: mocks.updateMock,
      });

      await expect(authModule.updateUser('nonexistent', { name: 'X' })).rejects.toThrow(
        'User not found'
      );
    });
  });

  describe('getUserByRfid', () => {
    it('should return user profile when RFID UID matches', async () => {
      const userProfile = {
        userId: 'user-1',
        name: 'Found User',
        evType: '2-wheeler',
        brand: 'Ather',
        batteryCapacity: 2.9,
        batteryType: 'Li-ion',
        chargerType: 'AC',
        chargerPowerRating: 1.5,
        rfidUids: ['RFID_X'],
        createdAt: 1000,
        updatedAt: 2000,
      };

      mocks.limitMock.mockReturnValue({
        get: vi.fn().mockResolvedValue({
          empty: false,
          docs: [{ id: 'user-1', data: () => userProfile }],
        }),
      });

      const result = await authModule.getUserByRfid('RFID_X');

      expect(result).not.toBeNull();
      expect(result!.userId).toBe('user-1');
      expect(result!.name).toBe('Found User');
    });

    it('should return null when RFID UID is not found', async () => {
      mocks.limitMock.mockReturnValue({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      });

      const result = await authModule.getUserByRfid('UNKNOWN');

      expect(result).toBeNull();
    });
  });

  describe('assignRfid', () => {
    it('should add RFID UID to existing user', async () => {
      const existingUser = {
        userId: 'user-1',
        name: 'Test',
        rfidUids: ['EXISTING_UID'],
        createdAt: 1000,
        updatedAt: 1000,
      };

      mocks.docMock.mockReturnValue({
        id: 'user-1',
        set: mocks.setMock,
        get: vi.fn().mockResolvedValue({ exists: true, data: () => existingUser }),
        update: mocks.updateMock,
      });

      await authModule.assignRfid('user-1', 'NEW_UID');

      expect(mocks.updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          rfidUids: ['EXISTING_UID', 'NEW_UID'],
          updatedAt: expect.any(Number),
        })
      );
    });

    it('should not duplicate RFID UID if already assigned', async () => {
      const existingUser = {
        userId: 'user-1',
        name: 'Test',
        rfidUids: ['ALREADY_ASSIGNED'],
        createdAt: 1000,
        updatedAt: 1000,
      };

      mocks.docMock.mockReturnValue({
        id: 'user-1',
        set: mocks.setMock,
        get: vi.fn().mockResolvedValue({ exists: true, data: () => existingUser }),
        update: mocks.updateMock,
      });

      await authModule.assignRfid('user-1', 'ALREADY_ASSIGNED');

      expect(mocks.updateMock).not.toHaveBeenCalled();
    });

    it('should throw error when user does not exist', async () => {
      mocks.docMock.mockReturnValue({
        id: 'ghost',
        set: mocks.setMock,
        get: vi.fn().mockResolvedValue({ exists: false }),
        update: mocks.updateMock,
      });

      await expect(authModule.assignRfid('ghost', 'UID')).rejects.toThrow('User not found');
    });
  });
});
