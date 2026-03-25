import { apiClient } from "./client";
import { API_CONFIG, MOCK_DELAY } from "./config";

export const noticesApi = {
  getNotices: async () => {
    if (API_CONFIG.MOCK_MODE) {
      await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
      return {
        success: true,
        data: [
          { id: "1", type: "공지", title: "[중요] B-Square 정기 점검 안내", date: "2024.03.25", important: true },
          { id: "2", type: "업데이트", title: "모바일 앱 신규 기능 업데이트", date: "2024.03.24", important: false },
        ]
      };
    }
    return apiClient.get<any[]>("/notices");
  },
};
