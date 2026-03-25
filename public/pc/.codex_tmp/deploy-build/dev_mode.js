// dev_mode.js - legacy compatibility shim
// The old keyboard PIN/code developer backdoor was removed.
// This file now only mirrors the explicit operator-mode toggle used by the header.
(function () {
  'use strict';

  const OP_MODE_KEY = 'bsq_operator_view_mode';
  const OPERATOR_GHOST_TOKEN = 'OPERATOR_GHOST';

  function syncOperatorFlag() {
    const enabled = localStorage.getItem(OP_MODE_KEY) === '1';
    window.__BSQ_DEV_MODE__ = enabled;

    if (enabled) {
      if (!localStorage.getItem('bsq_token')) {
        localStorage.setItem('bsq_token', OPERATOR_GHOST_TOKEN);
      }
      if (!localStorage.getItem('bsq_user')) {
        localStorage.setItem('bsq_user', JSON.stringify({
          id: OPERATOR_GHOST_TOKEN,
          email: 'operator@b-square.kr',
          name: '운영자',
          role: 'super_admin',
          profile_image_url: '/assets/default-avatar.svg',
        }));
      }
      return;
    }

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
    window.addEventListener('bsq_dev_mode_activated', syncOperatorFlag);
    window.addEventListener('bsq_dev_mode_deactivated', syncOperatorFlag);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
