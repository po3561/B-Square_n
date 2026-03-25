export const API_CONFIG = {
  // Cloudflare Pages Functions are relative to the current host
  // For local development, it might be http://localhost:3000/api if running wranger
  // or relative /api if Next.js proxying is set up.
  // Standardizing on relative /api for production compatibility.
  BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "/api",
  
  // MOCK_MODE can be toggled per resource if needed
  MOCK_MODE: process.env.NEXT_PUBLIC_MOCK_MODE === "true", 
  
  TIMEOUT: 15000,
};

export const MOCK_DELAY = 800;
