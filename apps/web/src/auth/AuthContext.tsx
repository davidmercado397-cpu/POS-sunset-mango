import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshAccessToken, setAccessToken, setBranchHeader, setSessionExpiredHandler } from '../lib/api';
import { applyBrand } from '../lib/theme';
import type { AppModule, SessionData } from './types';

type Status = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: Status;
  session: SessionData | null;
  branchId: string | null;
  setBranchId: (id: string) => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  /** ¿El usuario tiene el permiso? */
  can: (permission: string) => boolean;
  /** ¿El módulo está activo en la sede seleccionada? */
  hasModule: (module: AppModule) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const BRANCH_KEY = 'pos.branchId';

function readStoredBranch(): string | null {
  try {
    return localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
}

function storeBranch(id: string) {
  try {
    localStorage.setItem(BRANCH_KEY, id);
  } catch {
    /* almacenamiento no disponible: solo se pierde la preferencia */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<SessionData | null>(null);
  const [branchId, setBranchIdState] = useState<string | null>(null);

  const applySession = useCallback((data: SessionData | null) => {
    setSession(data);
    setStatus(data ? 'authenticated' : 'anonymous');
    applyBrand(data?.tenant?.primaryColor, data?.tenant?.secondaryColor);
    if (data) {
      const stored = readStoredBranch();
      const valid = data.branches.find((b) => b.id === stored) ?? data.branches[0];
      setBranchIdState(valid?.id ?? null);
      setBranchHeader(valid?.id ?? null);
    } else {
      setBranchIdState(null);
      setBranchHeader(null);
    }
  }, []);

  const reload = useCallback(async () => {
    applySession(await api<SessionData>('/auth/me'));
  }, [applySession]);

  // Al cargar la página se intenta recuperar la sesión con el refresh token (cookie).
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setAccessToken(null);
      applySession(null);
    });
    refreshAccessToken().then(async (token) => {
      if (!token) return applySession(null);
      try {
        await reload();
      } catch {
        applySession(null);
      }
    });
  }, [applySession, reload]);

  const login = useCallback(
    async (username: string, password: string) => {
      const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST',
        json: { username, password },
      });
      setAccessToken(accessToken);
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      applySession(null);
    }
  }, [applySession]);

  const setBranchId = useCallback((id: string) => {
    storeBranch(id);
    setBranchHeader(id);
    setBranchIdState(id);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = new Set(session?.user.permissions ?? []);
    const branch = session?.branches.find((b) => b.id === branchId);
    return {
      status,
      session,
      branchId,
      setBranchId,
      login,
      logout,
      reload,
      can: (p) => permissions.has(p),
      hasModule: (m) => !!branch?.modules.includes(m),
    };
  }, [status, session, branchId, setBranchId, login, logout, reload]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
