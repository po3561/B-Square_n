import { API_CONFIG } from "./config";
import { ApiResponse } from "@/types";

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_CONFIG.BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async fetcher<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include", // Essential for cookie-based legacy sessions
      });

      // Handle empty responses
      if (response.status === 204) return { success: true } as any;

      const data = await response.json();

      // The legacy API usually returns { success: boolean, data?: T, error?: string }
      if (!response.ok || (data && data.success === false)) {
        return {
          success: false,
          error: data?.error || data?.message || `Error ${response.status}`,
          detail: data?.detail,
        };
      }

      // Standardizing data unwrapping while preserving token/meta
      let resultData = data;
      let token = data?.token;
      let meta = data?.meta;

      if (data && typeof data === "object" && "data" in data && "success" in data) {
        resultData = data.data;
      }

      return {
        success: true,
        data: resultData as T,
        token,
        meta,
      };
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }
  }

  get<T>(endpoint: string, options?: RequestInit) {
    return this.fetcher<T>(endpoint, { ...options, method: "GET" });
  }

  post<T>(endpoint: string, body?: any, options?: RequestInit) {
    return this.fetcher<T>(endpoint, {
      ...options,
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body?: any, options?: RequestInit) {
    return this.fetcher<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string, options?: RequestInit) {
    return this.fetcher<T>(endpoint, { ...options, method: "DELETE" });
  }
}

export const apiClient = new ApiClient();
