import { apiClient } from "./client";
import { API_CONFIG } from "./config";

export const communityApi = {
  getMessages: async (channelId: string) => {
    if (API_CONFIG.MOCK_MODE) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return {
        success: true,
        data: [
          { id: "1", sender: "them", text: "안녕하세요! React 클래스 수강생입니다.", time: "오후 2:30", senderName: "김철수" },
          { id: "2", sender: "me", text: "네 안녕하세요!", time: "오후 2:32" },
        ],
      };
    }
    return apiClient.get(`/community/channels/${channelId}/messages`);
  },

  sendMessage: async (channelId: string, text: string) => {
    if (API_CONFIG.MOCK_MODE) {
      return { success: true, data: { id: Date.now().toString(), sender: "me", text, time: "방금" } };
    }
    return apiClient.post(`/community/channels/${channelId}/messages`, { text });
  },
};
