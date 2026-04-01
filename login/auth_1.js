(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.BSQSocialAuth?.init) {
      await window.BSQSocialAuth.init({
        root: '#socialAuthLogin',
      });
    }

    initLoginPage();
  });

  function initLoginPage() {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const toggleButton = document.getElementById('toggleEmailLogin');
    const panel = document.getElementById('emailLoginPanel');
    const banner = document.querySelector('[data-auth-banner]');

    if (!loginForm || !emailInput || !passwordInput || !toggleButton || !panel) return;

    const openEmailPanel = (focus = false) => {
      panel.hidden = false;
      toggleButton.setAttribute('aria-expanded', 'true');
      toggleButton.classList.add('is-active');
      toggleButton.textContent = '이메일 로그인 닫기';

      if (banner && !banner.dataset.state) {
        banner.hidden = false;
        banner.dataset.state = 'info';
        banner.className = 'auth-banner is-info';
        banner.textContent = '이메일과 비밀번호로 로그인할 수 있습니다.';
      }

      if (focus) {
        window.requestAnimationFrame(() => emailInput.focus());
      }
    };

    const closeEmailPanel = () => {
      panel.hidden = true;
      toggleButton.setAttribute('aria-expanded', 'false');
      toggleButton.classList.remove('is-active');
      toggleButton.textContent = '다른 이메일로 로그인';
      if (banner && !banner.dataset.state) {
        banner.hidden = true;
        banner.textContent = '';
      }
    };

    toggleButton.addEventListener('click', () => {
      if (panel.hidden) {
        openEmailPanel(true);
      } else {
        closeEmailPanel();
      }
    });

    const query = new URL(window.location.href).searchParams;
    if (query.get('mode') === 'email' || query.get('oauth_error')) {
      openEmailPanel(false);
    }

    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const submitButton = loginForm.querySelector('button[type="submit"]');

      if (!email) {
        showMessage('이메일을 입력해 주세요.', 'error');
        emailInput.focus();
        return;
      }

      if (!email.includes('@')) {
        showMessage('이메일 형식이 올바르지 않습니다.', 'error');
        emailInput.focus();
        return;
      }

      if (!password) {
        showMessage('비밀번호를 입력해 주세요.', 'error');
        passwordInput.focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = '로그인 중...';
      showMessage('이메일 계정을 확인하는 중입니다.', 'info');

      try {
        const result = await apiPost('/api/auth/login', {
          email,
          password,
        });

        if (!result?.success) {
          throw new Error(result?.error || '로그인에 실패했습니다.');
        }

        window.location.replace('../index.html');
      } catch (error) {
        console.error('[Login] email login failed:', error);
        showMessage(error.message || '로그인에 실패했습니다.', 'error');
        submitButton.disabled = false;
        submitButton.textContent = '로그인';
      }
    });

    function showMessage(message, type = 'info') {
      if (!banner) {
        alert(message);
        return;
      }

      banner.hidden = false;
      banner.dataset.state = type;
      banner.className = `auth-banner is-${type}`;
      banner.textContent = message;
    }
  }

  async function apiPost(path, body) {
    if (window.BSQAuthAPI?.postJson) {
      return window.BSQAuthAPI.postJson(path, body);
    }

    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || payload?.message || '로그인에 실패했습니다.');
    }

    return payload;
  }
})();
