import { UserProfile, UserProfileInput, AuthResult } from '../models/index.js';

export interface IAuthModule {
  authenticateRfid(nodeId: string, rfidUid: string): Promise<AuthResult>;
  createUser(profile: UserProfileInput): Promise<UserProfile>;
  updateUser(userId: string, updates: Partial<UserProfileInput>): Promise<UserProfile>;
  getUserByRfid(rfidUid: string): Promise<UserProfile | null>;
  assignRfid(userId: string, rfidUid: string): Promise<void>;
}
