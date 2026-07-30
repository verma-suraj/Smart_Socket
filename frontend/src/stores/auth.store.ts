import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { authService } from '../services/auth.service';

export interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  loading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const user = await authService.login(email, password);
      const token = await authService.getToken();
      set({ user, token, loading: false, error: null });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Authentication failed';
      set({ loading: false, error: message });
      throw error;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } finally {
      set({ user: null, token: null, error: null });
    }
  },

  setUser: (user: User | null) => {
    set({ user });
  },

  setToken: (token: string | null) => {
    set({ token });
  },
}));
