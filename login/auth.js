(function () {
  'use strict';

  // Compatibility shim: the active signup entrypoint is signup_page.js.
  if (!document.querySelector('script[src*="signup_page.js"]')) {
    const script = document.createElement('script');
    script.src = 'signup_page.js?v=20260401_03';
    document.head.appendChild(script);
  }
})();
