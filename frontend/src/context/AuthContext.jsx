import React, { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('shadow_token');
    if (storedToken) {
      setToken(storedToken);
    }
    setIsInitializing(false);
  }, []);

  const login = async (secret) => {
    try {
      const res = await apiLogin(secret);
      if (res.token) {
        setToken(res.token);
        localStorage.setItem('shadow_token', res.token);
        return { success: true };
      }
      return { success: false, error: 'No token received' };
    } catch (err) {
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('shadow_token');
  };

  if (isInitializing) return null;

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
