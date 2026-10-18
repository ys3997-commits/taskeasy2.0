"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Profile } from "@rajshree/shared";
import {
  ApiError,
  api,
  clearSession,
  getCachedUser,
  setCachedUser,
  setSession,
  setSessionInvalidatedListener,
} from "./api";

interface AuthContextValue {
  user: Profile | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<Profile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const forceLogout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { user: me } = await api.me();
      setUser(me);
      setCachedUser(me);
    } catch (err) {
      // Keep the cached session on network blips; only clear on real auth failure.
      const authFailed =
        err instanceof ApiError &&
        (err.status === 401 || err.code === "unauthorized");
      if (authFailed) forceLogout();
    }
  }, [forceLogout]);

  useEffect(() => {
    setSessionInvalidatedListener(() => setUser(null));
    return () => setSessionInvalidatedListener(null);
  }, []);

  useEffect(() => {
    const cached = getCachedUser();
    if (cached) setUser(cached);
    const token =
      typeof window !== "undefined" ? sessionStorage.getItem("access_token") : null;
    if (!token) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    setSession({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
    });
    setUser(result.user);
    setCachedUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    forceLogout();
  }, [forceLogout]);

  const value = useMemo(
    () => ({ user, loading, login, logout, refreshUser }),
    [user, loading, login, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
