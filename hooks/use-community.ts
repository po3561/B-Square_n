"use client";

import { useState, useEffect } from "react";
import { communityApi } from "@/lib/api/community";

export function useCommunity(channelId: string) {
  const [messages, setMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!channelId) return;
    const fetchMessages = async () => {
      setIsLoading(true);
      const response = await communityApi.getMessages(channelId);
      if (response.success && response.data) {
        setMessages(response.data);
      }
      setIsLoading(false);
    };
    fetchMessages();
  }, [channelId]);

  const sendMessage = async (text: string) => {
    const response = await communityApi.sendMessage(channelId, text);
    if (response.success && response.data) {
      setMessages((prev) => [...prev, response.data]);
    }
    return response;
  };

  return { messages, isLoading, sendMessage };
}
