(() => {
  'use strict';

  const THEME_KEY = 'bsq_theme';
  const LANGUAGE_KEY = 'bsq_language';
  const USER_KEY = 'bsq_user';
  const DEFAULT_THEME = 'dark';
  const DEFAULT_LANGUAGE = 'ko';
  const LANGUAGE_ALIASES = new Map([
    ['zh', 'zh-CN'],
    ['zh-cn', 'zh-CN'],
    ['cn', 'zh-CN'],
    ['ko-kr', 'ko'],
    ['en-us', 'en'],
    ['en-gb', 'en'],
    ['ja-jp', 'ja'],
  ]);

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function normalizeTheme(value) {
    const theme = String(value || '').trim().toLowerCase();
    if (theme === 'light' || theme === 'dark') return theme;
    if (theme === 'system') {
      try {
        return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      } catch {
        return DEFAULT_THEME;
      }
    }
    return DEFAULT_THEME;
  }

  function normalizeLanguage(value) {
    const raw = String(value || '').trim();
    if (!raw) return DEFAULT_LANGUAGE;
    const lower = raw.toLowerCase();
    const canonical = LANGUAGE_ALIASES.get(lower) || raw;
    const supported = ['ko', 'en', 'ja', 'zh-CN'];
    if (supported.includes(canonical)) return canonical;
    if (supported.includes(lower)) return lower;
    return DEFAULT_LANGUAGE;
  }

  function resolveInitialTheme() {
    const user = readJson(USER_KEY);
    return normalizeTheme(
      user?.preferred_theme
      || localStorage.getItem(THEME_KEY)
      || document.documentElement.getAttribute('data-theme')
      || DEFAULT_THEME
    );
  }

  function resolveInitialLanguage() {
    const user = readJson(USER_KEY);
    return normalizeLanguage(
      user?.preferred_language
      || localStorage.getItem(LANGUAGE_KEY)
      || document.documentElement.getAttribute('lang')
      || navigator.language
      || DEFAULT_LANGUAGE
    );
  }

  function applyToRoot(theme, language) {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.language = language;
    root.lang = language;

    if (document.body) {
      document.body.dataset.theme = theme;
      document.body.dataset.language = language;
    } else {
      window.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          document.body.dataset.theme = theme;
          document.body.dataset.language = language;
        }
      }, { once: true });
    }
  }

  const theme = resolveInitialTheme();
  const language = resolveInitialLanguage();
  applyToRoot(theme, language);

  window.__BSQ_BOOTSTRAP__ = {
    theme,
    language,
  };
})();
