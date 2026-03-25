import { Class, ApiResponse } from "@/types";
import { apiClient } from "./client";
import { API_CONFIG, MOCK_DELAY } from "./config";
import { classesAdapter } from "../adapters/classes.adapter";

// Mock Data (Moved to a separate file or kept here for quick fallback)
const MOCK_CLASSES: Class[] = [
  { id: "1", title: "실전 React & Next.js 마스터 클래스 (App Router 완벽 대응)", category: "개발", instructor_id: "p1", instructor_name: "박코딩", price: 129000, discount_rate: 20, enrolled_count: 1250 },
  { id: "2", title: "비전공자를 위한 UI/UX 디자인 기초 입문", category: "디자인", instructor_id: "i1", instructor_name: "이지자인", price: 89000, discount_rate: 15, enrolled_count: 840 },
];

export const classesApi = {
  getClasses: async (params?: { category?: string; q?: string }): Promise<ApiResponse<Class[]>> => {
    if (API_CONFIG.MOCK_MODE) {
      await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
      return { success: true, data: MOCK_CLASSES };
    }
    
    const query = new URLSearchParams(params as any).toString();
    const response = await apiClient.get<any[]>(`/classes${query ? `?${query}` : ""}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: classesAdapter.toUIList(response.data)
      };
    }
    return response;
  },

  getClassDetail: async (id: string): Promise<ApiResponse<Class>> => {
    if (API_CONFIG.MOCK_MODE) {
      await new Promise(resolve => setTimeout(resolve, MOCK_DELAY / 2));
      const cls = MOCK_CLASSES.find(c => c.id === id) || MOCK_CLASSES[0];
      return { success: true, data: cls };
    }
    
    const response = await apiClient.get<any>(`/classes/${id}`);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: classesAdapter.toUI(response.data)
      };
    }
    return response;
  },
};
