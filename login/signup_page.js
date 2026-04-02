(function () {
  'use strict';

  const FALLBACK_REFERRER_GROUPS = [
    {
      label: '중부',
      options: [
        { value: 'aj001', label: '중부1' },
        { value: 'aj002', label: '중부2' },
        { value: 'aj003', label: '중부3' },
        { value: 'aj004', label: '중부4' },
        { value: 'aj005', label: '중부5' },
      ],
    },
    {
      label: '북부',
      options: [
        { value: 'ab001', label: '북부1' },
        { value: 'ab002', label: '북부2' },
        { value: 'ab003', label: '북부3' },
        { value: 'ab004', label: '북부4' },
        { value: 'ab005', label: '북부5' },
      ],
    },
    {
      label: '동부',
      options: [
        { value: 'ac001', label: '동부1' },
        { value: 'ac002', label: '동부2' },
        { value: 'ac003', label: '동부3' },
        { value: 'ac004', label: '동부4' },
        { value: 'ac005', label: '동부5' },
      ],
    },
    {
      label: '대학',
      options: [
        { value: 'as001', label: '대학1' },
        { value: 'as002', label: '대학2' },
        { value: 'as003', label: '대학3' },
        { value: 'as004', label: '대학4' },
      ],
    },
    {
      label: '행정',
      options: [
        { value: 'cs020', label: '행정' },
      ],
    },
  ];

  let idChecked = false;
  let signupContext = null;

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      if (window.BSQSocialAuth?.init) {
        await window.BSQSocialAuth.init({ root: '#socialAuthSignup' });
      }
    } catch (error) {
      console.warn('[Signup] social auth init failed:', error);
    }

    initSignupPage();
  });

  function initSignupPage() {
    const form = document.getElementById('signupForm');
    const submitButton = document.getElementById('btnSubmit');
    const idInput = document.getElementById('signupId');
    const idStatus = document.getElementById('idStatusMsg');
    const checkButton = document.getElementById('btnCheckId');
    const emailInput = document.getElementById('signupEmail');
    const nameInput = document.getElementById('signupName');
    const passwordInput = document.getElementById('signupPassword');
    const passwordConfirmInput = document.getElementById('signupPasswordConfirm');
    const phoneInput = document.getElementById('signupPhone');
    const referrerSelect = document.getElementById('signupReferrerCode');
    const referrerStatus = document.getElementById('referrerCodeStatus');
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

    const setIdStatus = (message, type = 'info') => {
      if (!idStatus) return;
      idStatus.textContent = message || '';
      idStatus.className = message ? `status-msg ${type}` : 'status-msg';
    };

    const setReferrerStatus = (message, type = 'info') => {
      if (!referrerStatus) return;
      referrerStatus.textContent = message || '';
      referrerStatus.className = message ? `status-msg ${type}` : 'status-msg';
    };

    const clearIdStatus = () => {
      idChecked = false;
      setIdStatus('', '');
    };

    const renderReferrerGroups = (groups, source = 'database') => {
      if (!referrerSelect) return;

      const safeGroups = Array.isArray(groups) && groups.length ? groups : FALLBACK_REFERRER_GROUPS;
      const fragment = document.createDocumentFragment();

      referrerSelect.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '추천인 코드를 선택해 주세요 (선택사항)';
      fragment.appendChild(placeholder);

      for (const group of safeGroups) {
        const options = Array.isArray(group?.options) ? group.options : [];
        if (!options.length) continue;

        const optgroup = document.createElement('optgroup');
        optgroup.label = String(group.label || '추천인 코드').trim();

        for (const option of options) {
          const opt = document.createElement('option');
          opt.value = String(option.value || '').trim();
          opt.textContent = String(option.label || option.value || '').trim();
          optgroup.appendChild(opt);
        }

        fragment.appendChild(optgroup);
      }

      referrerSelect.appendChild(fragment);
      referrerSelect.disabled = false;
      setReferrerStatus(
        source === 'database'
          ? '실제 추천인 코드 목록을 불러왔습니다.'
          : '기본 추천인 코드 목록을 표시하고 있습니다.',
        'info',
      );
    };

    const suggestId = (context) => {
      const candidates = [
        context?.profile?.nickname,
        context?.profile?.name,
        context?.account?.username,
        context?.profile?.provider_email ? String(context.profile.provider_email).split('@')[0] : '',
      ];

      for (const candidate of candidates) {
        const value = String(candidate || '').trim();
        if (value) return value;
      }

      return '';
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
        verificationSummary.textContent = `${providerLabel}에서 확인한 정보로 가입 정보를 이어서 입력할 수 있습니다.`;
      }
      if (verificationEmail) {
        verificationEmail.textContent = profileEmail || '인증 이메일 없음';
      }
      if (verificationName) {
        verificationName.textContent = profileName || '인증 이름 없음';
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

      if (idInput && !idInput.value) {
        idInput.value = suggestId(context);
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

    const loadReferrerCodes = async () => {
      try {
        const result = await apiGet('/api/auth/referrer-codes');
        const groups = result?.data?.groups || [];
        renderReferrerGroups(groups, result?.data?.source || 'fallback');
      } catch (error) {
        console.warn('[Signup] referrer codes unavailable:', error);
        renderReferrerGroups(FALLBACK_REFERRER_GROUPS, 'fallback');
      }
    };

    idInput?.addEventListener('input', clearIdStatus);
    void loadSignupContext();
    void loadReferrerCodes();

    checkButton?.addEventListener('click', async () => {
      const id = idInput?.value.trim() || '';
      if (!id) {
        showBanner('아이디를 입력해 주세요.', 'warning');
        idInput?.focus();
        return;
      }

      try {
        checkButton.disabled = true;
        checkButton.textContent = '확인 중...';

        const result = await apiGet(`/api/auth/check-username?username=${encodeURIComponent(id)}`);
        if (result?.success && result?.data?.available) {
          idChecked = true;
          setIdStatus('사용 가능한 아이디입니다.', 'success');
          return;
        }

        idChecked = false;
        setIdStatus(result?.data?.message || '이미 사용 중인 아이디입니다.', 'error');
      } catch (error) {
        idChecked = false;
        setIdStatus(error.message || '아이디 확인에 실패했습니다.', 'error');
      } finally {
        checkButton.disabled = false;
        checkButton.textContent = '중복 확인';
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const id = idInput?.value.trim() || '';
      const email = emailInput?.value.trim() || '';
      const name = nameInput?.value.trim() || '';
      const password = passwordInput?.value || '';
      const passwordConfirm = passwordConfirmInput?.value || '';
      const phone = phoneInput?.value.trim() || '';
      const referrerCode = referrerSelect?.value || '';

      if (!id) {
        showBanner('아이디를 입력해 주세요.', 'error');
        idInput?.focus();
        return;
      }

      if (!idChecked) {
        showBanner('아이디 중복 확인을 먼저 진행해 주세요.', 'warning');
        checkButton?.focus();
        return;
      }

      if (!email || !email.includes('@')) {
        showBanner('유효한 이메일 주소를 입력해 주세요.', 'error');
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
          username: id,
          referrer_code: referrerCode || null,
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
      throw new Error(payload?.error || payload?.message || '회원가입에 실패했습니다.');
    }

    return payload;
  }
})();
