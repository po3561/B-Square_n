const SUPPORTED_LANGUAGES = new Set(['ko', 'en', 'ja', 'zh-CN']);
const LANGUAGE_ALIASES = new Map([
  ['zh', 'zh-CN'],
  ['zh-cn', 'zh-CN'],
  ['cn', 'zh-CN'],
  ['ko-kr', 'ko'],
  ['en-us', 'en'],
  ['en-gb', 'en'],
  ['ja-jp', 'ja'],
]);

function normalizeLanguagePreference(value, fallback = 'ko') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const lower = raw.toLowerCase();
  const canonical = LANGUAGE_ALIASES.get(lower) || raw;
  if (SUPPORTED_LANGUAGES.has(canonical)) return canonical;
  if (SUPPORTED_LANGUAGES.has(lower)) return lower;
  return fallback;
}

function normalizeThemePreference(value, fallback = 'dark') {
  const theme = String(value || '').trim().toLowerCase();
  if (theme === 'light' || theme === 'dark') return theme;
  if (theme === 'system') return fallback;
  return fallback;
}

export {
  LANGUAGE_ALIASES,
  SUPPORTED_LANGUAGES,
  normalizeLanguagePreference,
  normalizeThemePreference,
};
