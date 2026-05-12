"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getToken, getPublicKey, getAuthIdFromToken } from '@/lib/auth';
import { backendFetch } from '@/lib/backend';

interface AuthContextType {
  isAuthenticated: boolean;
  authId: string | null;
  publicKey: Uint8Array | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authId, setAuthId] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<Uint8Array | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Try to get a new access token using the refresh token cookie
  const tryRefreshFromCookie = async () => {
    try {
      const response = await backendFetch('/auth/refresh', {
        method: 'GET',
        credentials: 'include', // Send refresh token cookie
      });

      if (response.ok) {
        const data = await response.json();
        const newToken = data.accessToken;
        
        // Save the new token
        localStorage.setItem('auth:token', newToken);
        setToken(newToken);
        
        // Extract auth ID from token
        const id = getAuthIdFromToken();
        if (id) {
          setAuthId(id);
          
          // Try to get public key from localStorage
          const pubKey = getPublicKey();
          if (pubKey) {
            setPublicKey(pubKey);
            setIsAuthenticated(true);
            console.log('[Auth] Session restored from refresh token cookie');
            return true;
          } else {
            console.warn('[Auth] Token refreshed but no public key found');
          }
        }
      }
      return false;
    } catch (error) {
      // Silent fail - user will need to log in again
      console.debug('[Auth] No valid refresh token cookie found');
      return false;
    }
  };

  useEffect(() => {
    // Check for existing auth on mount
    const tok = getToken();
    const pubKey = getPublicKey();
    const id = getAuthIdFromToken();
    
    if (tok && pubKey && id) {
      setToken(tok);
      setPublicKey(pubKey);
      setAuthId(id);
      setIsAuthenticated(true);
    } else {
      // If no token in localStorage, try to refresh using cookie
      tryRefreshFromCookie();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!isAuthenticated) return;

    // Refresh token every 12 minutes (access token expires in 15 minutes)
    // This gives us a 3-minute buffer before expiration
    const refreshInterval = setInterval(async () => {
      console.log('[Auth] Auto-refreshing token...');
      try {
        const response = await backendFetch('/auth/refresh', {
          method: 'GET',
          credentials: 'include', // Send cookies
        });

        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('auth:token', data.accessToken);
          setToken(data.accessToken);
          console.log('[Auth] Token auto-refreshed successfully');
        } else if (response.status === 401) {
          // Only log out if the refresh token is actually invalid (401)
          console.warn('[Auth] Refresh token expired or invalid, logging out');
          logout();
        } else {
          // For other errors (500, 503, etc.), just log and retry next time
          console.warn('[Auth] Token auto-refresh failed with status:', response.status);
        }
      } catch (error) {
        console.error('[Auth] Token auto-refresh error:', error);
        // Don't log out on network errors, let the user continue
      }
    }, 12 * 60 * 1000); // 12 minutes

    return () => clearInterval(refreshInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const login = (newToken: string) => {
    const id = getAuthIdFromToken();
    const pubKey = getPublicKey();
    
    if (id && pubKey) {
      setToken(newToken);
      setAuthId(id);
      setPublicKey(pubKey);
      setIsAuthenticated(true);
    }
  };

  const logout = async () => {
    try {
      // Call backend logout endpoint to clear cookies
      await backendFetch('/auth/logout', {
        method: 'POST',
        credentials: 'include', // Send cookies to be cleared
      });
    } catch (error) {
      console.error('[Auth] Logout error:', error);
      // Continue with client-side cleanup even if backend call fails
    }

    // Clear all auth data from localStorage
    localStorage.removeItem('auth:token');
    localStorage.removeItem('auth:publicKey');
    localStorage.removeItem('auth:privateKey');
    localStorage.removeItem('auth:pub');
    localStorage.removeItem('auth:priv');
    sessionStorage.removeItem('auth:priv');
    
    setToken(null);
    setAuthId(null);
    setPublicKey(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, authId, publicKey, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
