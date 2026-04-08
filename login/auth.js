(function () {
  'use strict';

  // Compatibility shim: the active signup entrypoint is signup_page.js.
  if (!document.querySelector('script[src*="signup_page.js"]')) {
    const script = document.createElement('script');
    script.src = 'signup_page.js?v=20260410_02';
    document.head.appendChild(script);
  }
})();
