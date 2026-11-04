import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, UserRole, Shop } from '../types/index.ts';
import { translations, type Language } from '../translations/index.ts';

interface SetupStatus {
  isSetupComplete: boolean;
  hasAdmin: boolean;
  shopCount: number;
  areaCount: number;
  categoryCount: number;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en']) => string;
  setupStatus: SetupStatus | null;
  isCheckingSetup: boolean;
  activeShopId: string | null;
  setActiveShopId: (shopId: string) => void;
  shops: Shop[];
  refreshShops: () => Promise<Shop[]>;
  login: (emailOrPhone: string, password: string, role?: UserRole) => Promise<void>;
  logout: () => Promise<void>;
  initializeSystem: (payload: { adminName: string; emailOrPhone: string; password: string; includeDefaultConfig: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  checkSetupStatus: () => Promise<void>;
  toggleAvailability: (isBusy: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('friends_laundry_token'));
  const [language, setLanguageState] = useState<Language>(() => {
    localStorage.setItem('friends_laundry_lang', 'en');
    return 'en';
  });
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [isCheckingSetup, setIsCheckingSetup] = useState<boolean>(true);
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopIdState] = useState<string | null>(() => {
    return localStorage.getItem('friends_laundry_active_shop_id') || null;
  });

  const setActiveShopId = useCallback((shopId: string) => {
    setActiveShopIdState(shopId);
    if (shopId) {
      localStorage.setItem('friends_laundry_active_shop_id', shopId);
    } else {
      localStorage.removeItem('friends_laundry_active_shop_id');
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState('en');
    localStorage.setItem('friends_laundry_lang', 'en');
  };

  const t = useCallback((key: keyof typeof translations['en']): string => {
    const langDict = translations[language] || translations.en;
    return langDict[key] || translations.en[key] || String(key);
  }, [language]);

  const checkSetupStatus = useCallback(async () => {
    try {
      setIsCheckingSetup(true);
      const res = await fetch('/api/setup/status');
      if (res.ok) {
        const data = await res.json();
        setSetupStatus(data);
      }
    } catch (err) {
      console.error('Failed to check setup status:', err);
    } finally {
      setIsCheckingSetup(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // Token expired
        setToken(null);
        setUser(null);
        localStorage.removeItem('friends_laundry_token');
      }
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  }, [token]);

  const refreshShops = useCallback(async (): Promise<Shop[]> => {
    if (!token) {
      setShops([]);
      return [];
    }
    try {
      const res = await fetch('/api/shops', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const list: Shop[] = data.shops || [];
        setShops(list);

        setActiveShopIdState((current) => {
          if (user?.role === 'shop' && user.shop_id) {
            localStorage.setItem('friends_laundry_active_shop_id', user.shop_id);
            return user.shop_id;
          }
          if (current && list.some(s => s.id === current)) {
            return current;
          }
          const stored = localStorage.getItem('friends_laundry_active_shop_id');
          if (stored && list.some(s => s.id === stored)) {
            return stored;
          }
          if (list.length > 0) {
            localStorage.setItem('friends_laundry_active_shop_id', list[0].id);
            return list[0].id;
          }
          return null;
        });

        return list;
      }
    } catch (err) {
      console.error('Error fetching shops:', err);
    }
    return [];
  }, [token, user?.role, user?.shop_id]);

  useEffect(() => {
    checkSetupStatus();
  }, [checkSetupStatus]);

  useEffect(() => {
    if (token) {
      refreshUser();
      refreshShops();
    } else {
      setShops([]);
    }
  }, [token, refreshUser, refreshShops]);

  // Real-time heartbeat loop: pings every 25s when user is active to maintain live online status
  useEffect(() => {
    if (!token || !user) return;

    const interval = setInterval(() => {
      fetch('/api/auth/heartbeat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        }
      }).catch((e) => console.error('Heartbeat failed', e));
    }, 25000);

    return () => clearInterval(interval);
  }, [token, user]);

  const login = async (emailOrPhone: string, password: string, role?: UserRole) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrPhone, password, role })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('friends_laundry_token', data.token);
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('friends_laundry_token');
  };

  const initializeSystem = async (payload: { adminName: string; emailOrPhone: string; password: string; includeDefaultConfig: boolean }) => {
    const res = await fetch('/api/setup/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'System initialization failed');
    }

    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('friends_laundry_token', data.token);
    await checkSetupStatus();
  };

  const toggleAvailability = async (isBusy: boolean) => {
    if (!token) return;
    const res = await fetch('/api/auth/toggle-availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ is_busy: isBusy })
    });
    if (res.ok) {
      setUser((prev) => prev ? { ...prev, is_busy: isBusy ? 1 : 0 } : null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        language,
        setLanguage,
        t,
        setupStatus,
        isCheckingSetup,
        activeShopId,
        setActiveShopId,
        shops,
        refreshShops,
        login,
        logout,
        initializeSystem,
        refreshUser,
        checkSetupStatus,
        toggleAvailability
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
