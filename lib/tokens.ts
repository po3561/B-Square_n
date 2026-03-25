/**
 * B-Square Mobile Design Tokens
 * Apple-like premium feel, mobile-first optimization
 */

export const tokens = {
  colors: {
    background: "#ffffff",
    foreground: "#1d1d1f", // Apple charcoal
    primary: "#6e8efb", // Existing B-Square blue
    secondary: "#a777e3", // Existing B-Square purple
    muted: "#f5f5f7", // Apple light gray
    subtle: "#86868b", // Apple subtext
    accent: "#0071e3", // Apple link blue
    surface: "rgba(255, 255, 255, 0.72)", // Glassmorphism surface
    border: "rgba(0, 0, 0, 0.08)",
  },
  spacing: {
    safe: "env(safe-area-inset-top)",
    safePadding: "16px",
    headerHeight: "56px",
    tabBarHeight: "72px",
    touchTarget: "44px", // Apple accessibility standard
  },
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "22px",
    full: "9999px",
  },
  typography: {
    family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  shadow: {
    soft: "0 4px 12px rgba(0, 0, 0, 0.05)",
    premium: "0 8px 30px rgba(0, 0, 0, 0.08)",
  },
  zIndex: {
    header: 50,
    tabBar: 50,
    modal: 100,
    toast: 150,
  },
  breakpoints: {
    nano: "190px",
    mobile: "390px", // iPhone 13/14/15 standard
    tablet: "768px",
  }
};
