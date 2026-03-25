"use client";

import { useState, useEffect } from "react";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

export function useSafeInsets() {
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });

  useEffect(() => {
    // Usually these are CSS variables, but we can read them or simulate them
    const top = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-top")) || 0;
    const bottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0;
    setInsets({ top, bottom });
  }, []);

  return insets;
}
