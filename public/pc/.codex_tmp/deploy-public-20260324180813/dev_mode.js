// dev_mode.js - legacy compatibility shim
// The old keyboard PIN/code developer backdoor was removed.
// This file now only mirrors the explicit operator-mode toggle used by the header.
(function () {
  'use strict';

  const OP_MODE_KEY = 'bsq_operator_view_mode';

  function syncOperatorFlag() {
    window.__BSQ_DEV_MODE__ = localStorage.getItem(OP_MODE_KEY) === '1';
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
