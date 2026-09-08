import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useApp } from '../state/AppProvider';

interface UserSession {
  isLoggedIn: boolean;
  hasPin: boolean;
  pinHash: string | null;
  biometricEnabled: boolean;
  lastLogin: number | null;
}

interface AuthContextType {
  session: UserSession;
  isLoading: boolean;
  setupPin: (pin: string) => Promise<void>;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  enableBiometric: () => Promise<void>;
  disableBiometric: () => void;
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
  verifyPin: (pin: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PIN_SALT = 'acode-pin-salt-2024';

function hashPin(pin: string, salt: string = PIN_SALT): string {
  let hash = 0;
  const str = pin + salt;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { vault } = useApp();
  const [session, setSession] = useState<UserSession>({
    isLoggedIn: false,
    hasPin: false,
    pinHash: null,
    biometricEnabled: false,
    lastLogin: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const stored = await vault.getKey('acode.auth.session');
        if (stored) {
          const sessionData = JSON.parse(stored);
          setSession(sessionData);
        }
      } catch (e) {
        console.error('Failed to load auth session:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, [vault]);

  const saveSession = useCallback(async (newSession: UserSession) => {
    try {
      await vault.setKey('acode.auth.session', JSON.stringify(newSession), {
        category: 'custom',
        label: 'User Session',
        connectorType: 'Auth',
      });
      setSession(newSession);
    } catch (e) {
      console.error('Failed to save auth session:', e);
    }
  }, [vault]);

  const setupPin = useCallback(async (pin: string) => {
    const pinHash = hashPin(pin);
    const newSession = {
      isLoggedIn: true,
      hasPin: true,
      pinHash,
      biometricEnabled: false,
      lastLogin: Date.now(),
    };
    await saveSession(newSession);
  }, [saveSession]);

  const verifyPin = useCallback((pin: string) => {
    return session.pinHash === hashPin(pin);
  }, [session.pinHash]);

  const login = useCallback(async (pin: string) => {
    const pinHash = hashPin(pin);
    if (session.pinHash === pinHash) {
      const newSession = { ...session, isLoggedIn: true, lastLogin: Date.now() };
      await saveSession(newSession);
      return true;
    }
    return false;
  }, [session, saveSession]);

  const logout = useCallback(() => {
    const newSession = { ...session, isLoggedIn: false };
    saveSession(newSession);
  }, [session, saveSession]);

  const enableBiometric = useCallback(async () => {
    // Biometric auth is optional - only available on mobile with Capacitor
    console.warn('Biometric auth not implemented in web version');
  }, []);

  const disableBiometric = useCallback(() => {
    saveSession({ ...session, biometricEnabled: false });
  }, [session, saveSession]);

  const changePin = useCallback(async (oldPin: string, newPin: string) => {
    const oldHash = hashPin(oldPin);
    if (session.pinHash === oldHash) {
      const newHash = hashPin(newPin);
      const newSession = { ...session, pinHash: newHash };
      await saveSession(newSession);
      return true;
    }
    return false;
  }, [session, saveSession]);

  const value = {
    session,
    isLoading,
    setupPin,
    login,
    logout,
    enableBiometric,
    disableBiometric,
    changePin,
    verifyPin,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
