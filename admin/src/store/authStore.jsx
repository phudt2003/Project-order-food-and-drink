import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import http from "../api/http";
import {
  clearAdminToken,
  getAdminTokenExpiryMs,
  isAdminTokenExpired,
  readAdminToken,
  writeAdminToken
} from "../utils/adminToken";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readAdminToken());

  const login = useCallback(async ({ apiBase, username, password }) => {
    try {
      const response = await http.post(`${apiBase}/api/admin/login`, {
        username: String(username || "").trim(),
        password: String(password || ""),
      });

      const data = response?.data || {};
      if (!data.success || !data.token) {
        return { success: false, message: data.message || "Đăng nhập thất bại." };
      }

      const nextToken = String(data.token);
      writeAdminToken(nextToken);
      setToken(nextToken);
      return { success: true, token: nextToken };
    } catch (error) {
      return {
        success: false,
        message: error?.response?.data?.message || "Không thể đăng nhập. Backend không khả dụng.",
      };
    }
  }, []);

  const logout = useCallback(() => {
    clearAdminToken();
    setToken("");
  }, []);

  useEffect(() => {
    if (!token) return;

    if (isAdminTokenExpired(token)) {
      logout();
      return;
    }

    const expiresAt = getAdminTokenExpiryMs(token);
    if (!expiresAt) return;

    const timeoutMs = Math.max(expiresAt - Date.now(), 0);
    const timer = setTimeout(() => {
      logout();
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [token, logout]);

  const value = useMemo(
    () => ({
      token,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
