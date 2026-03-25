"use client";

import { useState, useEffect } from "react";
import { authApi } from "@/lib/api/auth";
import { User } from "@/types";
import { authAdapter } from "@/lib/adapters/auth.adapter";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      setIsLoading(true);
      const response = await authApi.getSession();
      if (response.success && response.data?.session?.user) {
        setUser(authAdapter.toUI(response.data.session.user));
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    const response = await authApi.login(username, password);
    if (response.success && response.data?.user) {
      setUser(authAdapter.toUI(response.data.user));
      if (response.token) {
        localStorage.setItem("bsq_token", response.token);
      }
    }
    setIsLoading(false);
    return response;
  };

  const logout = async () => {
    await authApi.logout();
    localStorage.removeItem("bsq_token");
    setUser(null);
  };

  return { user, isLoading, login, logout, isAuthenticated: !!user };
}
