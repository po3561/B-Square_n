import { Class } from "@/types";

export const classesAdapter = {
  toUI: (legacy: any): Class => ({
    id: legacy.id || "",
    title: legacy.title || "",
    category: legacy.category || "기타",
    instructor_id: legacy.creator_id || legacy.instructor_id || "",
    instructor_name: legacy.instructor_name || legacy.creator_name || "강사",
    image_url: legacy.thumbnail || legacy.image_url || "https://images.unsplash.com/photo-1541462608141-ad4d4f94b88a?w=800",
    price: Number(legacy.price || 0),
    discount_rate: Number(legacy.discount_rate || 0),
    enrolled_count: Number(legacy.current_participants || 0),
  }),

  toUIList: (legacyList: any[]): Class[] => {
    if (!Array.isArray(legacyList)) return [];
    return legacyList.map(classesAdapter.toUI);
  }
};
