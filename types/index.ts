export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  role: "user" | "instructor" | "operator" | "admin" | "super_admin";
  profile_image_url?: string;
  phone?: string;
  membership_level?: string;
  birth_year?: string;
  birth_month?: string;
  birth_day?: string;
  gender?: string;
  nationality?: string;
}

export interface Class {
  id: string;
  title: string;
  category: string;
  instructor_id: string;
  instructor_name: string;
  image_url?: string;
  price: number;
  discount_rate?: number;
  enrolled_count: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  detail?: string;
  message?: string;
  token?: string;
  meta?: {
    limit?: number;
    offset?: number;
    count?: number;
    [key: string]: any;
  };
}
