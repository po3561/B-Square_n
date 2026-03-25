"use client";

import { useState, useEffect } from "react";
import { classesApi } from "@/lib/api/classes";
import { Class } from "@/types";

export function useClasses(params?: { category?: string; q?: string }) {
  const [data, setData] = useState<Class[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchClasses = async () => {
      setIsLoading(true);
      const response = await classesApi.getClasses(params);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || "Failed to fetch classes");
      }
      setIsLoading(false);
    };

    fetchClasses();
  }, [params?.category, params?.q]);

  return { data, isLoading, error };
}

export function useClassDetail(id: string) {
  const [data, setData] = useState<Class | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchDetail = async () => {
      setIsLoading(true);
      const response = await classesApi.getClassDetail(id);
      if (response.success && response.data) {
        setData(response.data);
      } else {
        setError(response.error || "Failed to fetch class detail");
      }
      setIsLoading(false);
    };

    fetchDetail();
  }, [id]);

  return { data, isLoading, error };
}
