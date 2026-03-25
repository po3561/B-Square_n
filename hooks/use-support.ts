"use client";

import { useState, useEffect } from "react";
import { noticesApi } from "@/lib/api/notices";
import { inquiriesApi } from "@/lib/api/inquiries";

export function useNotices() {
  const [notices, setNotices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchNotices = async () => {
      setIsLoading(true);
      const response = await noticesApi.getNotices();
      if (response.success && response.data) {
        setNotices(response.data);
      }
      setIsLoading(false);
    };
    fetchNotices();
  }, []);

  return { notices, isLoading };
}

export function useInquiry() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendInquiry = async (data: { type: string; email: string; content: string }) => {
    setIsSubmitting(true);
    const response = await inquiriesApi.sendInquiry(data);
    setIsSubmitting(false);
    return response;
  };

  return { sendInquiry, isSubmitting };
}
