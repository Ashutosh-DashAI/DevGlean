import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarUrl: string | null;
}

interface AuthTeam {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface AuthState {
  user: AuthUser | null;
  team: AuthTeam | null;
  accessToken: string | null;
  isAuthenticated: boolean;

  setAuth: (user: AuthUser, team: AuthTeam, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      team: null,
      accessToken: null,
      isAuthenticated: false,

      setAuth: (user, team, accessToken) =>
        set({
          user,
          team,
          accessToken,
          isAuthenticated: true,
        }),

      setAccessToken: (token) =>
        set({ accessToken: token }),

      clearAuth: () =>
        set({
          user: null,
          team: null,
          accessToken: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: "devglean-auth",
      partialize: (state) => ({
        user: state.user,
        team: state.team,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
