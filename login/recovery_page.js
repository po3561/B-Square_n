(function () {
  'use strict';

  let recoveryEmail = '';
  let recoveryAccount = null;

  function maskEmail(value) {
    const raw = String(value ?? '').trim();
    if (!raw || !raw.includes('@')) return '';

    const [local, domain] = raw.split('@');
    const prefix = local.slice(0, 2);
    const suffix = local.length > 2 ? '*'.repeat(Math.max(1, Math.min(local.length - 2, 4))) : '*';
    return `${prefix}${suffix}@${domain}`;
  }

  function buildProviderList(account, fallbackProvider) {
    const labels = Array.isArray(account?.providers)
      ? account.providers
        .map((provider) => provider?.label || provider?.provider)
        .filter(Boolean)
      : [];

    if (!labels.length && fallbackProvider) {
      labels.push(fallbackProvider);
    }

    return labels.join(', ');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (window.BSQSocialAuth?.init) {
        await window.BSQSocialAuth.init({ root: '#socialAuthRecovery' });
      }
    } catch (error) {
      console.warn('[Recovery] social auth init failed:', error);
    }

    initRecoveryPage();
  });

  function initRecoveryPage() {
    const tabs = Array.from(document.querySelectorAll('[data-recovery-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-recovery-panel]'));
    const form = document.getElementById('findAccountForm');
    const emailInput = document.getElementById('findEmail');
    const banner = document.querySelector('[data-auth-banner]');
    const summaryCard = document.querySelector('[data-recovery-summary]');
    const summaryState = document.querySelector('[data-recovery-summary-state]');
    const summaryTitle = document.querySelector('[data-recovery-summary-title]');
    const summaryText = document.querySelector('[data-recovery-summary-text]');
    const summaryEmail = document.querySelector('[data-recovery-email]');
    const summaryProviders = document.querySelector('[data-recovery-providers]');
    const requestResetButton = document.querySelector('[data-request-reset]');

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

    const setSummaryContent = ({
      state = 'info',
      title = '',
      text = '',
      email = '',
      providers = '',
      resetEnabled = false,
      resetLabel = '비밀번호 재설정 메일 보내기',
    } = {}) => {
      if (!summaryCard) return;

      summaryCard.hidden = false;
      if (summaryState) summaryState.textContent = state === 'warning' ? '확인 필요' : '계정 확인 결과';
      if (summaryTitle) summaryTitle.textContent = title;
      if (summaryText) summaryText.textContent = text;
      if (summaryEmail) summaryEmail.textContent = email || '이메일 정보 없음';
      if (summaryProviders) summaryProviders.textContent = providers || '소셜 인증 정보 없음';

      if (requestResetButton) {
        requestResetButton.disabled = !resetEnabled;
        requestResetButton.textContent = resetLabel;
      }
    };

    const updateResetState = (enabled, label) => {
      if (!requestResetButton) return;
      requestResetButton.disabled = !enabled;
      requestResetButton.textContent = label;
    };

    const loadRecoveryContext = async () => {
      try {
        const result = await apiGet('/api/auth/social/context?purpose=recovery');
        const data = result?.data || null;
        if (!result?.success || !data?.active || !data?.account) {
          updateResetState(Boolean(recoveryEmail), '계정 확인 후 진행해 주세요.');
          return;
        }

        const providerLabel = data.provider?.label || '소셜';
        recoveryEmail = String(data.account.email || data.profile?.provider_email || '').trim().toLowerCase();
        recoveryAccount = {
          ...data.account,
          source: 'social',
        };

        setSummaryContent({
          state: 'info',
          title: `${providerLabel} 계정이 확인되었습니다.`,
          text: `${providerLabel} 인증으로 연결된 계정입니다. 아래에서 비밀번호 재설정 메일을 보내거나 계정 정보를 다시 확인할 수 있습니다.`,
          email: data.account.masked_email || data.profile?.masked_email || maskEmail(recoveryEmail),
          providers: buildProviderList(data.account, providerLabel),
          resetEnabled: Boolean(recoveryEmail),
          resetLabel: '비밀번호 재설정 메일 보내기',
        });
      } catch (error) {
        console.warn('[Recovery] social context unavailable:', error);
        updateResetState(Boolean(recoveryEmail), '계정 확인 후 진행해 주세요.');
      }
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
      submitButton.textContent = '확인 중...';
      showBanner('입력한 이메일과 연결된 계정을 확인하는 중입니다.', 'info');

      try {
        const result = await apiPost('/api/auth/account-lookup', { email });
        if (!result?.success) {
          throw new Error(result?.error || '계정 확인 요청에 실패했습니다.');
        }

        const found = Boolean(result?.data?.found);
        recoveryEmail = email;
        recoveryAccount = {
          email,
          masked_email: result?.data?.masked_email || maskEmail(email),
          found,
          source: 'email',
        };

        setSummaryContent({
          state: found ? 'info' : 'warning',
          title: found ? '계정을 찾았습니다.' : '계정을 찾지 못했습니다.',
          text: result?.data?.message || (found
            ? '아래 버튼으로 비밀번호 재설정 메일을 보낼 수 있습니다.'
            : '입력한 이메일이 맞는지 다시 확인해 주세요.'),
          email: result?.data?.masked_email || maskEmail(email),
          providers: found ? '이메일 로그인 계정' : '이메일 정보가 일치하지 않습니다.',
          resetEnabled: found,
          resetLabel: found ? '비밀번호 재설정 메일 보내기' : '계정 확인 후 진행해 주세요.',
        });

        showBanner(
          found
            ? '계정을 확인했습니다. 아래에서 비밀번호 재설정 메일을 보낼 수 있습니다.'
            : '계정을 찾지 못했습니다. 이메일을 다시 확인해 주세요.',
          found ? 'info' : 'warning',
        );
      } catch (error) {
        console.error('[Recovery] email lookup failed:', error);
        showBanner(error.message || '계정 확인에 실패했습니다.', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = '계정 확인하기';
      }
    });

    requestResetButton?.addEventListener('click', async () => {
      const targetEmail = recoveryEmail || emailInput.value.trim().toLowerCase();
      if (!targetEmail || !targetEmail.includes('@')) {
        showBanner('먼저 계정을 확인해 주세요.', 'warning');
        emailInput.focus();
        return;
      }

      requestResetButton.disabled = true;
      requestResetButton.textContent = '메일 전송 중...';

      try {
        const result = await apiPost('/api/auth/reset-password-request', { email: targetEmail });
        if (!result?.success) {
          throw new Error(result?.error || '비밀번호 재설정 메일 발송에 실패했습니다.');
        }

        const message = result?.message || '비밀번호 재설정 메일을 보냈습니다.';
        showBanner(message, result?.email_sent === false ? 'warning' : 'info');

        if (result?.debug_reset_url) {
          showBanner(`${message} 개발용 링크: ${result.debug_reset_url}`, 'warning');
        }
      } catch (error) {
        console.error('[Recovery] reset request failed:', error);
        showBanner(error.message || '비밀번호 재설정 메일 발송에 실패했습니다.', 'error');
      } finally {
        const hasVerifiedAccount = Boolean(recoveryAccount?.found || recoveryAccount?.source === 'social' || recoveryEmail);
        requestResetButton.disabled = !hasVerifiedAccount;
        requestResetButton.textContent = hasVerifiedAccount
          ? '비밀번호 재설정 메일 보내기'
          : '계정 확인 후 진행해 주세요.';
      }
    });

    const initialTab = new URL(window.location.href).hash === '#social' ? 'social' : 'email';
    activateTab(initialTab);
    void loadRecoveryContext();
  }

  async function apiGet(path) {
    if (window.BSQAuthAPI?.getJson) {
      return window.BSQAuthAPI.getJson(path);
    }

    const response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || payload?.message || '요청에 실패했습니다.');
    }

    return payload;
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
      throw new Error(payload?.error || payload?.message || '요청에 실패했습니다.');
    }

    return payload;
  }
})();
