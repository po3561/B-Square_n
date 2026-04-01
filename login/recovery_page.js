(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.BSQSocialAuth?.init) {
      await window.BSQSocialAuth.init({ root: '#socialAuthRecovery' });
    }

    initRecoveryPage();
  });

  function initRecoveryPage() {
    const tabs = Array.from(document.querySelectorAll('[data-recovery-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-recovery-panel]'));
    const form = document.getElementById('findAccountForm');
    const emailInput = document.getElementById('findEmail');
    const banner = document.querySelector('[data-auth-banner]');

    if (!form || !emailInput) return;

    const activateTab = (name) => {
      const target = String(name || 'email');
      tabs.forEach((button) => {
        const active = button.dataset.recoveryTab === target;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      panels.forEach((panel) => {
        const active = panel.dataset.recoveryPanel === target;
        panel.classList.toggle('is-active', active);
        panel.hidden = !active;
      });
    };

    const showBanner = (message, type = 'info') => {
      if (!banner) {
        if (message) alert(message);
        return;
      }

      banner.hidden = false;
      banner.dataset.state = type;
      banner.className = `auth-banner is-${type}`;
      banner.textContent = message;
    };

    tabs.forEach((button) => {
      button.addEventListener('click', () => activateTab(button.dataset.recoveryTab));
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const email = emailInput.value.trim().toLowerCase();
      if (!email || !email.includes('@')) {
        showBanner('유효한 이메일 주소를 입력해 주세요.', 'error');
        emailInput.focus();
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = '전송 중...';
      showBanner('가입 정보를 확인하고 있습니다.', 'info');

      try {
        const result = await apiPost('/api/auth/reset-password-request', { email });
        if (!result?.success) {
          throw new Error(result?.error || '계정 확인 요청에 실패했습니다.');
        }

        showBanner(result.message || '입력하신 이메일로 계정 복구 안내를 보냈습니다.', 'info');
        form.reset();
      } catch (error) {
        console.error('[Recovery] email lookup failed:', error);
        showBanner(error.message || '계정 확인 요청에 실패했습니다.', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = '계정 확인하기';
      }
    });

    const initialTab = new URL(window.location.href).hash === '#social' ? 'social' : 'email';
    activateTab(initialTab);
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
      throw new Error(payload?.error || payload?.message || '계정 확인 요청에 실패했습니다.');
    }

    return payload;
  }
})();
