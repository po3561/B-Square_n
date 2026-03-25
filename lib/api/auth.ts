import { User } from "@/types";
import { apiClient } from "./client";
import { API_CONFIG, MOCK_DELAY } from "./config";

export const authApi = {
  login: async (username: string, password: string) => {
    if (API_CONFIG.MOCK_MODE) {
      await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
      return { 
        success: true, 
        data: { 
          user: { 
            id: "user_1", 
            username: "testuser", 
            name: "테스트", 
            email: "test@example.com", 
            role: "user" as const 
          } 
        } 
      };
    }
    return apiClient.post<{ user: User }>("/auth/login", { username, password });
  },

  getSession: async () => {
    if (API_CONFIG.MOCK_MODE) {
      return { success: true, data: { session: null } };
    }
    return apiClient.get<{ session: { user: User } | null }>("/auth/session");
  },

  logout: async () => {
    if (API_CONFIG.MOCK_MODE) return { success: true };
    return apiClient.delete("/auth/session");
  }
};
