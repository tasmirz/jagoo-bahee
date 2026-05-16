'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getToken, getPublicKey, clearCredentials, saveToken } from '@/lib/auth';
import { backendFetch } from '@/lib/backend';

interface AuthContextType {
  token: string | null;
  publicKey: string | null;
  isAuthenticated: boolean;
  logout: () => void;
  refreshAuth: () => void | Promise<void>;
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

  const refreshAuth = async () => {
    let currentToken = getToken();
    if (!currentToken) {
      try {
        const response = await backendFetch('/auth/refresh', { method: 'GET', credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          if (data?.accessToken) {
            saveToken(data.accessToken);
            currentToken = data.accessToken;
          }
        }
      } catch {
        currentToken = null;
      }
    }

    setToken(currentToken);
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
    void refreshAuth();
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
