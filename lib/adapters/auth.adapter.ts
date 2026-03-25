import { User } from "@/types";

export const authAdapter = {
  toUI: (legacyUser: any): User => {
    if (!legacyUser) return null as any;
    return {
      id: legacyUser.id || "",
      email: legacyUser.email || "",
      name: legacyUser.name || legacyUser.username || "사용자",
      username: legacyUser.username || "",
      role: legacyUser.role || "user",
      profile_image_url: legacyUser.profile_image_url || "/assets/default-avatar.svg",
      phone: legacyUser.phone,
      membership_level: legacyUser.membership_level,
      birth_year: legacyUser.birth_year,
      birth_month: legacyUser.birth_month,
      birth_day: legacyUser.birth_day,
      gender: legacyUser.gender,
      nationality: legacyUser.nationality,
    };
  }
};
