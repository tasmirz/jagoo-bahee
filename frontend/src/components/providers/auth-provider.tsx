'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, getPublicKey, clearCredentials } from '@/lib/auth';

interface AuthContextType {
  token: string | null;
  publicKey: string | null;
  isAuthenticated: boolean;
  logout: () => void;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  publicKey: null,
  isAuthenticated: false,
  logout: () => {},
  refreshAuth: () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const refreshAuth = () => {
    setToken(getToken());
    const key = getPublicKey();
    if (!key) {
      setPublicKey(null);
      return;
    }
    const b64 = btoa(String.fromCharCode(...Array.from(key)));
    // backend route expects base64url path value
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    setPublicKey(b64url);
  };

  useEffect(() => {
    setIsMounted(true);
    refreshAuth();
  }, []);

  const logout = () => {
    clearCredentials();
    setToken(null);
    setPublicKey(null);
    window.location.href = '/auth';
  };

  if (!isMounted) return null; // Avoid hydration mismatch

  return (
    <AuthContext.Provider
      value={{
        token,
        publicKey,
        isAuthenticated: !!token,
        logout,
        refreshAuth
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);