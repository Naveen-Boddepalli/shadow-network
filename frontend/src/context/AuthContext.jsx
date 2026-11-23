import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { login as apiLogin, TOKEN_KEY, AUTH_EXPIRED_EVENT } from '../services/api';

const AuthContext = createContext(null);

// Returns the token only if it's present and not past its `exp` claim.
const loadValidToken = () => {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(loadValidToken);

  const logout = useCallback(() => {
    setToken(null);
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  }, []);

  // The API layer signals when the backend rejects our token (expired, rotated secret).
  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, logout);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout);
  }, [logout]);

  const login = async (secret) => {
    try {
      const res = await apiLogin(secret);
      if (!res.token) return { success: false, error: 'No token received' };
      setToken(res.token);
      try { localStorage.setItem(TOKEN_KEY, res.token); } catch { /* session-only login */ }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
