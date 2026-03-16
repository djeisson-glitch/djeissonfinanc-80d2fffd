import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface SimpleUser {
  id: string;
  email: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: SimpleUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => boolean;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  user: null,
  loading: true,
  signIn: () => false,
  signOut: () => {},
});

const VALID_EMAIL = 'contato@djeissonmauss.com';
const VALID_PASSWORD = 'DjEissoN@2k26%$#@';
const HARDCODED_USER: SimpleUser = { id: 'hardcoded-user-id', email: VALID_EMAIL };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('isAuthenticated');
    setIsAuthenticated(stored === 'true');
    setLoading(false);
  }, []);

  const signIn = useCallback((email: string, password: string): boolean => {
    if (email === VALID_EMAIL && password === VALID_PASSWORD) {
      localStorage.setItem('isAuthenticated', 'true');
      setIsAuthenticated(true);
      return true;
    }
    return false;
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, user: isAuthenticated ? HARDCODED_USER : null, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
