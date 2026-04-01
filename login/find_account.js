(function () {
  'use strict';

  // Compatibility shim: the active recovery entrypoint is recovery_page.js.
  if (!document.querySelector('script[src*="recovery_page.js"]')) {
    const script = document.createElement('script');
    script.src = 'recovery_page.js?v=20260401_03';
    document.head.appendChild(script);
  }
})();
