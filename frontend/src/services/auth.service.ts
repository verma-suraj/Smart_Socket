import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '../config/firebase';

/**
 * Delay helper for token refresh retries.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Firebase Authentication service.
 * Provides login, logout, token retrieval with retry logic,
 * and auth state change subscription.
 */
export const authService = {
  /**
   * Sign in with email and password.
   */
  async login(email: string, password: string): Promise<User> {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return credential.user;
  },

  /**
   * Sign out the current user.
   */
  async logout(): Promise<void> {
    await signOut(auth);
  },

  /**
   * Get the current user's ID token.
   * Retries up to 3 times with a small delay if getIdToken fails.
   * Returns null if no user is signed in.
   */
  async getToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) return null;

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const token = await user.getIdToken();
        return token;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        await delay(500 * attempt);
      }
    }

    // Should never reach here, but satisfy TypeScript
    return null;
  },

  /**
   * Subscribe to auth state changes.
   */
  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return firebaseOnAuthStateChanged(auth, callback);
  },
};
