import { apiClient } from "./client";
import { API_CONFIG, MOCK_DELAY } from "./config";

export const inquiriesApi = {
  sendInquiry: async (data: { type: string; email: string; content: string }) => {
    if (API_CONFIG.MOCK_MODE) {
      await new Promise(resolve => setTimeout(resolve, MOCK_DELAY));
      return { success: true, message: "문의가 접수되었습니다." };
    }
    
    return apiClient.post("/inquiries", {
      category: data.type,
      email: data.email,
      title: `[Mobile Inquiry] ${data.type}`,
      content: data.content,
      name: "Mobile User" // Anonymous or from session
    });
  }
};
