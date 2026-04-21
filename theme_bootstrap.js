(() => {
  'use strict';

  const THEME_KEY = 'bsq_theme';
  const LANGUAGE_KEY = 'bsq_language';
  const USER_KEY = 'bsq_user';
  const DEFAULT_THEME = 'light';
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

  function snapshotPreferenceState(theme, language) {
    const previous = resolvePreferenceSnapshot();
    const nextTheme = normalizeTheme(theme === undefined || theme === null || theme === '' ? previous.theme : theme);
    const nextLanguage = normalizeLanguage(language === undefined || language === null || language === '' ? previous.language : language);

    return {
      theme: nextTheme,
      resolvedTheme: nextTheme,
      language: nextLanguage,
      updatedAt: Date.now(),
    };
  }

  function resolvePreferenceSnapshot() {
    const user = readJson(USER_KEY);
    const root = document.documentElement;
    const body = document.body;
    const bootstrapSnapshot = window.__BSQ_PREFERENCES__ || window.__BSQ_BOOTSTRAP__ || null;

    const themeSource =
      bootstrapSnapshot?.resolvedTheme
      || bootstrapSnapshot?.theme
      || user?.preferred_theme
      || localStorage.getItem(THEME_KEY)
      || root.getAttribute('data-theme')
      || body?.getAttribute('data-theme')
      || DEFAULT_THEME;

    const languageSource =
      bootstrapSnapshot?.language
      || user?.preferred_language
      || localStorage.getItem(LANGUAGE_KEY)
      || root.getAttribute('lang')
      || body?.getAttribute('lang')
      || navigator.language
      || DEFAULT_LANGUAGE;

    return {
      theme: normalizeTheme(themeSource),
      language: normalizeLanguage(languageSource),
    };
  }

  function syncBodyFromRoot() {
    if (!document.body) return false;
    document.body.dataset.theme = document.documentElement.dataset.theme || DEFAULT_THEME;
    document.body.dataset.language = document.documentElement.dataset.language || DEFAULT_LANGUAGE;
    return true;
  }

  function ensureBodySyncOnReady() {
    if (document.body || ensureBodySyncOnReady.bound) return;
    ensureBodySyncOnReady.bound = true;
    window.addEventListener('DOMContentLoaded', () => {
      syncBodyFromRoot();
    }, { once: true });
  }

  function applyPreferenceState(theme, language, { persistStorage = true } = {}) {
    const root = document.documentElement;
    const snapshot = snapshotPreferenceState(theme, language);
    const nextTheme = snapshot.theme;
    const nextLanguage = snapshot.language;

    root.dataset.theme = nextTheme;
    root.dataset.language = nextLanguage;
    root.lang = nextLanguage;

    if (!syncBodyFromRoot()) {
      ensureBodySyncOnReady();
    }

    if (persistStorage) {
      localStorage.setItem(THEME_KEY, nextTheme);
      localStorage.setItem(LANGUAGE_KEY, nextLanguage);
    }

    window.__BSQ_BOOTSTRAP__ = snapshot;
    window.__BSQ_PREFERENCES__ = snapshot;
    return snapshot;
  }

  function broadcastPreferenceState(detail) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return null;
    const snapshot = detail && typeof detail === 'object'
      ? detail
      : (window.__BSQ_PREFERENCES__ || resolvePreferenceSnapshot());

    window.dispatchEvent(new CustomEvent('bsq_preferences', {
      detail: snapshot,
    }));

    return snapshot;
  }

  function applyAndBroadcastPreferenceState(theme, language, options = {}) {
    const snapshot = applyPreferenceState(theme, language, options);
    broadcastPreferenceState(snapshot);
    return snapshot;
  }

  function syncFromPreferenceEvent(event) {
    const detail = event?.detail || {};
    const snapshot = resolvePreferenceSnapshot();
    applyPreferenceState(
      detail.resolvedTheme || detail.theme || snapshot.theme,
      detail.language || snapshot.language,
      { persistStorage: true },
    );
  }

  function syncFromStorageEvent(event) {
    if (!event || ![THEME_KEY, LANGUAGE_KEY, USER_KEY].includes(event.key)) return;
    const snapshot = resolvePreferenceSnapshot();
    applyPreferenceState(snapshot.theme, snapshot.language, { persistStorage: false });
  }

  const initialSnapshot = resolvePreferenceSnapshot();
  applyPreferenceState(initialSnapshot.theme, initialSnapshot.language, { persistStorage: true });

  window.__BSQ_THEME_SYNC__ = {
    normalizeTheme,
    normalizeLanguage,
    resolvePreferenceSnapshot,
    snapshotPreferenceState,
    applyPreferenceState,
    applyAndBroadcastPreferenceState,
    broadcastPreferenceState,
  };

  window.addEventListener('bsq_preferences', syncFromPreferenceEvent);
  window.addEventListener('storage', syncFromStorageEvent);
})();
