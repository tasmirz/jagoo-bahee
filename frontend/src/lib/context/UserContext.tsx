"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { backendFetch } from '@/lib/backend';
import { User } from '@/lib/types';
import UsernameModal from '@/components/UsernameModal';

interface UserContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, authId } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUsernameModal, setShowUsernameModal] = useState(false);

  const refreshUser = async () => {
    if (!isAuthenticated || !authId) {
      console.log('[UserContext] Not authenticated or no authId, clearing user');
      setUser(null);
      setLoading(false);
      setShowUsernameModal(false);
      return;
    }

    console.log('[UserContext] Fetching user profile for authId:', authId);
    setLoading(true);
    try {
      const response = await backendFetch('/users/me/profile');
      if (response.ok) {
        const userData = await response.json();
        console.log('[UserContext] User profile fetched:', {
          _id: userData._id,
          username: userData.username,
          authId: userData.authId,
        });
        setUser(userData);
        setShowUsernameModal(false);
      } else if (response.status === 404) {
        // User profile doesn't exist yet - show username modal
        console.log('[UserContext] User profile not found (404), showing username modal');
        setUser(null);
        setShowUsernameModal(true);
      } else {
        console.log('[UserContext] Error fetching user profile:', response.status);
        setUser(null);
        setShowUsernameModal(false);
      }
    } catch (error) {
      console.error('[UserContext] Failed to fetch user profile:', error);
      setUser(null);
      setShowUsernameModal(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, [isAuthenticated, authId]);

  return (
    <UserContext.Provider value={{ user, loading, refreshUser, setUser }}>
      {children}
      <UsernameModal 
        isOpen={showUsernameModal} 
        onComplete={refreshUser}
      />
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
