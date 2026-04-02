(function () {
  'use strict';

  let nicknameChecked = false;
  let signupContext = null;

  document.addEventListener('DOMContentLoaded', async () => {
    if (window.BSQSocialAuth?.init) {
      await window.BSQSocialAuth.init({ root: '#socialAuthSignup' });
    }

    initSignupPage();
  });

  function initSignupPage() {
    const form = document.getElementById('signupForm');
    const submitButton = document.getElementById('btnSubmit');
    const nicknameInput = document.getElementById('signupNickname');
    const nicknameStatus = document.getElementById('nicknameStatusMsg');
    const checkButton = document.getElementById('btnCheckNickname');
    const emailInput = document.getElementById('signupEmail');
    const nameInput = document.getElementById('signupName');
    const passwordInput = document.getElementById('signupPassword');
    const passwordConfirmInput = document.getElementById('signupPasswordConfirm');
    const banner = document.querySelector('[data-auth-banner]');
    const verificationCard = document.querySelector('[data-signup-verification]');
    const verificationProvider = document.querySelector('[data-signup-provider]');
    const verificationSummary = document.querySelector('[data-signup-summary]');
    const verificationEmail = document.querySelector('[data-signup-email]');
    const verificationName = document.querySelector('[data-signup-name]');

    if (!form) return;

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

    const setNicknameStatus = (message, type = 'info') => {
      if (!nicknameStatus) return;
      nicknameStatus.textContent = message;
      nicknameStatus.className = message ? `status-msg ${type}` : 'status-msg';
    };

    const clearNicknameStatus = () => {
      nicknameChecked = false;
      setNicknameStatus('', '');
    };

    const renderSignupContext = (context) => {
      if (!verificationCard) return;

      const active = Boolean(context?.active && context?.provider && context?.profile);
      if (!active) {
        verificationCard.hidden = true;
        signupContext = null;
        if (emailInput) emailInput.readOnly = false;
        return;
      }

      signupContext = context;

      const providerLabel = context.provider?.label || context.profile?.provider || '소셜';
      const profileEmail = String(context.profile?.provider_email || context.profile?.masked_email || '').trim();
      const profileName = String(context.profile?.name || context.profile?.nickname || '').trim();
      const verifiedEmail = Boolean(context.profile?.email_verified && context.profile?.provider_email);

      verificationCard.hidden = false;
      if (verificationProvider) verificationProvider.textContent = `${providerLabel} 본인 인증 완료`;
      if (verificationSummary) {
        verificationSummary.textContent = `${providerLabel}에서 확인된 정보로 가입을 계속할 수 있습니다.`;
      }
      if (verificationEmail) {
        verificationEmail.textContent = profileEmail || '이메일 정보 없음';
      }
      if (verificationName) {
        verificationName.textContent = profileName || '이름 정보 없음';
      }

      if (emailInput) {
        if (verifiedEmail) {
          emailInput.value = String(context.profile.provider_email || '').trim();
          emailInput.readOnly = true;
        } else {
          emailInput.readOnly = false;
          if (!emailInput.value) {
            emailInput.value = String(context.profile.provider_email || '').trim();
          }
        }
      }

      if (nameInput && !nameInput.value) {
        nameInput.value = profileName || profileEmail.split('@')[0] || '';
      }

      if (nicknameInput && !nicknameInput.value) {
        nicknameInput.value = String(context.profile?.nickname || context.profile?.name || '').trim();
      }
    };

    const loadSignupContext = async () => {
      try {
        const result = await apiGet('/api/auth/social/context?purpose=signup');
        renderSignupContext(result?.data || null);
      } catch (error) {
        console.warn('[Signup] social context unavailable:', error);
        renderSignupContext(null);
      }
    };

    nicknameInput?.addEventListener('input', clearNicknameStatus);
    void loadSignupContext();

    checkButton?.addEventListener('click', async () => {
      const nickname = nicknameInput?.value.trim() || '';
      if (!nickname) {
        showBanner('닉네임을 입력해 주세요.', 'warning');
        nicknameInput?.focus();
        return;
      }

      try {
        checkButton.disabled = true;
        checkButton.textContent = '확인 중...';

        const result = await apiGet(`/api/auth/check-username?username=${encodeURIComponent(nickname)}`);
        if (result?.success && result?.data?.available) {
          nicknameChecked = true;
          setNicknameStatus('사용 가능한 닉네임입니다.', 'success');
          return;
        }

        nicknameChecked = false;
        setNicknameStatus(result?.data?.message || '이미 사용 중인 닉네임입니다.', 'error');
      } catch (error) {
        nicknameChecked = false;
        setNicknameStatus(error.message || '닉네임 확인에 실패했습니다.', 'error');
      } finally {
        checkButton.disabled = false;
        checkButton.textContent = '중복 확인';
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const nickname = nicknameInput?.value.trim() || '';
      const email = emailInput?.value.trim() || '';
      const name = nameInput?.value.trim() || '';
      const password = passwordInput?.value || '';
      const passwordConfirm = passwordConfirmInput?.value || '';
      const phone = document.getElementById('signupPhone')?.value.trim() || '';

      if (!nickname) {
        showBanner('닉네임을 입력해 주세요.', 'error');
        nicknameInput?.focus();
        return;
      }

      if (!nicknameChecked) {
        showBanner('닉네임 중복 확인을 먼저 진행해 주세요.', 'warning');
        checkButton?.focus();
        return;
      }

      if (!email || !email.includes('@')) {
        showBanner('이메일 형식이 올바르지 않습니다.', 'error');
        emailInput?.focus();
        return;
      }

      if (!name) {
        showBanner('이름을 입력해 주세요.', 'error');
        nameInput?.focus();
        return;
      }

      if (password.length < 8) {
        showBanner('비밀번호는 8자 이상이어야 합니다.', 'error');
        passwordInput?.focus();
        return;
      }

      if (password !== passwordConfirm) {
        showBanner('비밀번호가 서로 일치하지 않습니다.', 'error');
        passwordConfirmInput?.focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = '가입 처리 중...';
      showBanner('회원가입 정보를 저장하는 중입니다.', 'info');

      try {
        const result = await apiPost('/api/auth/register', {
          email,
          password,
          name,
          phone: phone || null,
          username: nickname,
          signup_path: signupContext?.provider?.id ? `oauth:${signupContext.provider.id}` : 'email',
        });

        if (!result?.success) {
          throw new Error(result?.error || '회원가입에 실패했습니다.');
        }

        window.location.replace('../index.html');
      } catch (error) {
        console.error('[Signup] submit failed:', error);
        showBanner(error.message || '회원가입에 실패했습니다.', 'error');
        submitButton.disabled = false;
        submitButton.textContent = '회원가입 완료';
      }
    });
  }

  async function apiGet(path) {
    if (window.BSQAuthAPI?.getJson) {
      return window.BSQAuthAPI.getJson(path);
    }

    const response = await fetch(path, { credentials: 'include', headers: { Accept: 'application/json' } });
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
      throw new Error(payload?.error || payload?.message || '회원가입에 실패했습니다.');
    }

    return payload;
  }
})();
