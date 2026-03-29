// dev_mode.js - legacy compatibility shim
// The old keyboard PIN/code developer backdoor was removed.
// This file mirrors the explicit operator-mode toggle used by the header.
(function () {
  'use strict';

  const OP_MODE_KEY = 'bsq_operator_view_mode';
  const OPERATOR_GHOST_TOKEN = 'OPERATOR_GHOST';

  function getStoredOperatorProfile() {
    try {
      const raw = localStorage.getItem('bsq_user');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}

    return {
      id: OPERATOR_GHOST_TOKEN,
      email: 'operator@b-square.kr',
      name: '운영자',
      username: 'operator',
      profile_image_url: '/assets/default-avatar.svg',
      role: 'super_admin',
      operator_seq: 1,
    };
  }

  function syncOperatorFlag() {
    const enabled = localStorage.getItem(OP_MODE_KEY) === '1';
    window.__BSQ_DEV_MODE__ = enabled;

    if (enabled) {
      const profile = getStoredOperatorProfile();
      if (!localStorage.getItem('bsq_token')) {
        localStorage.setItem('bsq_token', OPERATOR_GHOST_TOKEN);
      }
      if (!localStorage.getItem('bsq_user')) {
        localStorage.setItem('bsq_user', JSON.stringify(profile));
      }
      window.__BSQ_OPERATOR_PROFILE__ = profile;
      return;
    }

    delete window.__BSQ_OPERATOR_PROFILE__;
    if (localStorage.getItem('bsq_token') === OPERATOR_GHOST_TOKEN) {
      localStorage.removeItem('bsq_token');
      localStorage.removeItem('bsq_user');
    }
  }

  function init() {
    syncOperatorFlag();
    window.addEventListener('storage', (event) => {
      if (event.key === OP_MODE_KEY) syncOperatorFlag();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
