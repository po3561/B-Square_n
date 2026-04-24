(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async () => {
    const returnTo = resolveReturnTarget();
    const socialAuthRoot = document.getElementById('socialAuthLogin');
    if (socialAuthRoot && returnTo) {
      socialAuthRoot.dataset.socialReturn = returnTo;
    }

    try {
      if (window.BSQSocialAuth?.init) {
        await window.BSQSocialAuth.init({ root: '#socialAuthLogin' });
      }
    } catch (error) {
      console.warn('[Login] social auth init failed:', error);
    }

    initLoginPage(returnTo);
  });

  function initLoginPage(returnTo = '') {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const toggleButton = document.getElementById('toggleEmailLogin');
    const panel = document.getElementById('emailLoginPanel');
    const banner = document.querySelector('[data-auth-banner]');

    if (!loginForm || !emailInput || !passwordInput || !toggleButton || !panel) {
      return;
    }

    const setBanner = (message, type = 'info') => {
      if (!banner) {
        if (message) alert(message);
        return;
      }

      banner.hidden = false;
      banner.dataset.state = type;
      banner.className = `auth-banner is-${type}`;
      banner.textContent = message;
    };

    const openEmailPanel = (focus = false) => {
      panel.hidden = false;
      toggleButton.setAttribute('aria-expanded', 'true');
      toggleButton.classList.add('is-active');
      if (focus) {
        window.requestAnimationFrame(() => emailInput.focus());
      }
    };

    const closeEmailPanel = () => {
      panel.hidden = true;
      toggleButton.setAttribute('aria-expanded', 'false');
      toggleButton.classList.remove('is-active');
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
        setBanner('이메일을 입력해 주세요.', 'error');
        emailInput.focus();
        return;
      }

      if (!email.includes('@')) {
        setBanner('유효한 이메일 주소를 입력해 주세요.', 'error');
        emailInput.focus();
        return;
      }

      if (!password) {
        setBanner('비밀번호를 입력해 주세요.', 'error');
        passwordInput.focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = '로그인 중...';
      setBanner('로그인 정보를 확인하는 중입니다.', 'info');

      try {
        const result = await apiPost('/api/auth/login', {
          email,
          password,
        });

        if (!result?.success) {
          throw new Error(result?.error || '로그인에 실패했습니다.');
        }

        window.location.replace(returnTo || '../index.html');
      } catch (error) {
        console.error('[Login] email login failed:', error);
        setBanner(mapLoginError(error), 'error');
        submitButton.disabled = false;
        submitButton.textContent = '로그인';
      }
    });
  }

  function mapLoginError(error) {
    const message = String(error?.message || '').trim();
    if (!message) return '로그인에 실패했습니다.';

    if (
      message.includes('이메일 또는 비밀번호') ||
      message.includes('Invalid account credentials') ||
      message.includes('A valid email address') ||
      message.includes('Email and password are required')
    ) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.';
    }

    return message;
  }

  function resolveReturnTarget() {
    const query = new URL(window.location.href).searchParams;
    return sanitizeReturnTarget(query.get('return_to') || query.get('redirect') || '');
  }

  function sanitizeReturnTarget(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    try {
      const target = new URL(raw, window.location.href);
      if (target.origin !== window.location.origin) return '';
      return target.toString();
    } catch {
      return '';
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
