(function () {
  'use strict';

  const STORAGE_KEY = 'bsq_language';
  const USER_KEY = 'bsq_user';
  const FALLBACK_LANGUAGE = 'ko';
  const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'zh-CN'];
  const LOCALE_BASE = '/locales';
  const TEXT_ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'value'];
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
  const LANGUAGE_ALIASES = new Map([
    ['zh', 'zh-CN'],
    ['zh-cn', 'zh-CN'],
    ['cn', 'zh-CN'],
    ['ko-kr', 'ko'],
    ['en-us', 'en'],
    ['en-gb', 'en'],
    ['ja-jp', 'ja'],
  ]);

  const state = {
    language: FALLBACK_LANGUAGE,
    resources: new Map(),
    reverseIndex: new Map(),
    ready: false,
    applyLock: false,
    observer: null,
    loadPromise: null,
  };

  function normalizeLanguage(value) {
    const raw = String(value || '').trim();
    if (!raw) return FALLBACK_LANGUAGE;
    const lower = raw.toLowerCase();
    const canonical = LANGUAGE_ALIASES.get(lower) || raw;
    if (SUPPORTED_LANGUAGES.includes(canonical)) return canonical;
    if (SUPPORTED_LANGUAGES.includes(lower)) return lower;
    return FALLBACK_LANGUAGE;
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function getInitialLanguage() {
    const user = readJson(USER_KEY);
    if (user && user.preferred_language) {
      return normalizeLanguage(user.preferred_language);
    }

    const storedLanguage = localStorage.getItem(STORAGE_KEY);
    if (storedLanguage) {
      return normalizeLanguage(storedLanguage);
    }

    const domLanguage = document.documentElement.getAttribute('lang');
    if (domLanguage) {
      return normalizeLanguage(domLanguage);
    }

    const navigatorLangs = Array.isArray(navigator.languages) ? navigator.languages : [];
    for (const value of navigatorLangs) {
      const normalized = normalizeLanguage(value);
      if (normalized) return normalized;
    }

    const browserLanguage = navigator.language;
    if (browserLanguage) {
      return normalizeLanguage(browserLanguage);
    }

    return FALLBACK_LANGUAGE;
  }

  function fetchLocale(lang) {
    if (state.resources.has(lang)) return Promise.resolve(state.resources.get(lang));

    const url = `${LOCALE_BASE}/${encodeURIComponent(lang)}/common.json`;
    return fetch(url, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Locale ${lang} load failed`);
        return response.json();
      })
      .then((data) => {
        state.resources.set(lang, data || {});
        return data || {};
      })
      .catch((error) => {
        console.warn('[BSQ i18n] locale load failed:', lang, error?.message || error);
        const fallback = state.resources.get(FALLBACK_LANGUAGE) || {};
        state.resources.set(lang, fallback);
        return fallback;
      });
  }

  function walkLeaves(node, path = [], visitor) {
    if (typeof node === 'string') {
      visitor(path.join('.'), node);
      return;
    }

    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => walkLeaves(item, path.concat(String(index)), visitor));
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      walkLeaves(value, path.concat(key), visitor);
    }
  }

  function buildReverseIndex(source) {
    const index = new Map();
    walkLeaves(source, [], (key, value) => {
      const normalized = normalizeText(value);
      if (!normalized || index.has(normalized)) return;
      index.set(normalized, key);
    });
    return index;
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function getPathValue(source, key) {
    if (!source || !key) return undefined;
    return key.split('.').reduce((acc, part) => {
      if (acc == null) return undefined;
      return acc[part];
    }, source);
  }

  function interpolate(template, params = {}) {
    return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, name) => {
      const key = String(name || '').trim();
      const value = params[key];
      return value == null ? '' : String(value);
    });
  }

  function translateKey(key, params = {}) {
    const current = state.resources.get(state.language) || {};
    const fallback = state.resources.get(FALLBACK_LANGUAGE) || {};
    const template = getPathValue(current, key) ?? getPathValue(fallback, key) ?? key;
    return interpolate(template, params);
  }

  function parseParams(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  function setRootLanguage(language) {
    const root = document.documentElement;
    root.dataset.language = language;
    root.lang = language;
    if (document.body) {
      document.body.dataset.language = language;
    }
  }

  function translateTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const parent = node.parentElement;
    if (!parent) return;
    if (SKIP_TAGS.has(parent.tagName) || parent.closest('[data-i18n-ignore]')) return;

    const original = node.nodeValue || '';
    const normalized = normalizeText(original);
    if (!normalized) return;

    const key = state.reverseIndex.get(normalized);
    if (!key) return;

    const translated = translateKey(key);
    if (!translated || translated === normalized) return;

    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    node.nodeValue = `${leading}${translated}${trailing}`;
  }

  function translateElementAttributes(root) {
    const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (const el of elements) {
      if (el.closest('[data-i18n-ignore]')) continue;

      if (el.dataset.i18n) {
        const key = el.dataset.i18n.trim();
        const params = parseParams(el.dataset.i18nParams || el.getAttribute('data-i18n-params'));
        const html = el.dataset.i18nHtml === '1' || el.dataset.i18nHtml === 'true';
        const translated = translateKey(key, params);
        if (html) {
          el.innerHTML = translated;
        } else {
          el.textContent = translated;
        }
      }

      if (el.dataset.i18nAttr) {
        const list = el.dataset.i18nAttr.split(',').map((entry) => entry.trim()).filter(Boolean);
        for (const entry of list) {
          const [attrName, key] = entry.split(':').map((part) => part.trim());
          if (!attrName || !key) continue;
          const params = parseParams(el.dataset.i18nParams || el.getAttribute('data-i18n-params'));
          const translated = translateKey(key, params);
          if (translated) el.setAttribute(attrName, translated);
        }
      }

      for (const attr of TEXT_ATTRS) {
        const raw = el.getAttribute(attr);
        if (!raw) continue;
        const normalized = normalizeText(raw);
        const key = state.reverseIndex.get(normalized);
        if (!key) continue;
        const translated = translateKey(key);
        if (translated && translated !== normalized) {
          el.setAttribute(attr, translated);
        }
      }
    }
  }

  function translateTitle() {
    const currentTitle = normalizeText(document.title);
    const key = state.reverseIndex.get(currentTitle);
    if (!key) return;
    const translated = translateKey(key);
    if (translated && translated !== currentTitle) {
      document.title = translated;
    }
  }

  function translateTree(root = document.body || document.documentElement) {
    if (state.applyLock || !root) return;
    state.applyLock = true;
    try {
      translateTitle();

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let node = walker.nextNode();
      while (node) {
        textNodes.push(node);
        node = walker.nextNode();
      }
      for (const textNode of textNodes) {
        translateTextNode(textNode);
      }
      translateElementAttributes(root);
    } finally {
      state.applyLock = false;
    }
  }

  function scheduleTranslate() {
    if (state.applyLock) return;
    window.requestAnimationFrame(() => translateTree());
  }

  async function ensureReady() {
    if (state.loadPromise) return state.loadPromise;

    state.loadPromise = Promise.all(SUPPORTED_LANGUAGES.map((lang) => fetchLocale(lang)))
      .then(() => {
        state.reverseIndex = buildReverseIndex(state.resources.get(FALLBACK_LANGUAGE) || {});
        state.language = getInitialLanguage();
        state.ready = true;
        setRootLanguage(state.language);
        translateTree();
        return state.language;
      })
      .catch((error) => {
        console.warn('[BSQ i18n] bootstrap failed:', error);
        state.reverseIndex = buildReverseIndex(state.resources.get(FALLBACK_LANGUAGE) || {});
        state.language = FALLBACK_LANGUAGE;
        setRootLanguage(state.language);
        translateTree();
        return state.language;
      });

    return state.loadPromise;
  }

  function observeMutations() {
    if (state.observer || typeof MutationObserver === 'undefined') return;
    const targets = [document.body, document.head, document.documentElement].filter(Boolean);
    if (!targets.length) return;

    state.observer = new MutationObserver((mutations) => {
      if (state.applyLock) return;
      let shouldTranslate = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && (mutation.addedNodes?.length || mutation.removedNodes?.length)) {
          shouldTranslate = true;
          break;
        }
        if (mutation.type === 'characterData') {
          shouldTranslate = true;
          break;
        }
        if (mutation.type === 'attributes' && TEXT_ATTRS.includes(mutation.attributeName)) {
          shouldTranslate = true;
          break;
        }
      }
      if (shouldTranslate) scheduleTranslate();
    });

    state.observer.observe(targets[0], {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: TEXT_ATTRS,
    });
    for (const target of targets.slice(1)) {
      state.observer.observe(target, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }
  }

  async function changeLanguage(language, { persist = true } = {}) {
    const canonical = normalizeLanguage(language);
    await ensureReady();
    state.language = canonical;
    setRootLanguage(canonical);
    if (persist) localStorage.setItem(STORAGE_KEY, canonical);
    translateTree();
    window.dispatchEvent(new CustomEvent('bsq_language', {
      detail: {
        language: canonical,
        source: 'i18n',
        timestamp: Date.now(),
      },
    }));
    return canonical;
  }

  function syncFromPreferences(event) {
    const lang = normalizeLanguage(event?.detail?.language || '');
    if (!lang) return;
    state.language = lang;
    setRootLanguage(lang);
    translateTree();
  }

  async function init() {
    if (state.ready) return state.loadPromise || Promise.resolve(state.language);
    const promise = ensureReady();
    observeMutations();
    window.addEventListener('bsq_preferences', syncFromPreferences);
    window.addEventListener('bsq_session', (event) => {
      const lang = normalizeLanguage(event?.detail?.user?.preferred_language || '');
      if (!lang) return;
      state.language = lang;
      setRootLanguage(lang);
      translateTree();
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => translateTree(), { once: true });
    }
    return promise;
  }

  window.BSQI18n = {
    ready: init(),
    t: translateKey,
    changeLanguage,
    apply: translateTree,
    refresh: () => translateTree(),
    get language() {
      return state.language;
    },
  };

  void init();
})();
