// kakao_quick.js - B-Square floating helper (Home guide / Kakao inquiry / Settings)
(function () {
    'use strict';

    if (window.__BSQ_HELPER_READY__) return;
    window.__BSQ_HELPER_READY__ = true;

    const KAKAO_CHANNEL_PUBLIC_ID = '_ScJxon';
    const KAKAO_CHANNEL_URL = 'https://pf.kakao.com/_ScJxon';
    const KAKAO_CHAT_URL = 'https://pf.kakao.com/_ScJxon/chat';
    const KAKAO_SDK_SRC = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.0/kakao.min.js';
    let kakaoJsKeyPromise = null;
    let kakaoJsKeyCache = '';

    const STORAGE = {
        tourSeen: 'bsq.helper.tourSeen.v1',
        lastTab: 'bsq.helper.lastTab.v1',
    };

    function qs(sel, root) {
        return (root || document).querySelector(sel);
    }

    function clampTheme(value) {
        const raw = String(value || '').trim().toLowerCase();
        return raw === 'light' ? 'light' : 'dark';
    }

    function normalizeConsentState(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;
        const raw = String(value).trim().toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
        if (['0', 'false', 'no', 'off'].includes(raw)) return false;
        return null;
    }

    function getRoleLabel(role) {
        const raw = String(role || '').trim().toLowerCase();
        if (['admin', 'super_admin'].includes(raw)) return '총괄운영자';
        if (raw === 'operator') return '운영자';
        if (raw === 'instructor') return '강사';
        return '일반회원';
    }

    function getTheme() {
        return clampTheme(
            document.documentElement.getAttribute('data-theme')
            || localStorage.getItem('bsq_theme')
            || 'dark'
        );
    }

    async function persistThemePreference(theme) {
        theme = clampTheme(theme);
        try {
            localStorage.setItem('bsq_theme', theme);
        } catch { }

        document.documentElement.setAttribute('data-theme', theme);
        window.BSQ?.applyPreferences?.({ theme });

        const userId = window.BSQ?.session?.user?.id;
        if (!userId || !window.BSQ?.api) return;

        try {
            await window.BSQ.api(`/api/users/${encodeURIComponent(userId)}`, {
                method: 'PUT',
                body: JSON.stringify({ preferred_theme: theme }),
            });
        } catch {
            // Non-fatal; local + applied theme still works.
        }
    }

    async function resolveKakaoJsKey() {
        if (kakaoJsKeyCache) return kakaoJsKeyCache;
        if (kakaoJsKeyPromise) return kakaoJsKeyPromise;

        kakaoJsKeyPromise = (async () => {
            try {
                const fetchFn = window.BSQ?.api
                    ? (path) => window.BSQ.api(path, { cacheBust: false })
                    : async (path) => {
                        const response = await fetch(path, {
                            method: 'GET',
                            credentials: 'include',
                            headers: { Accept: 'application/json' },
                        });
                        return response.json().catch(() => ({}));
                    };

                const result = await fetchFn('/api/auth/providers');
                const key = String(result?.data?.providers?.kakao?.public_key || '').trim();
                kakaoJsKeyCache = key;
                return key;
            } catch {
                return '';
            }
        })();

        return kakaoJsKeyPromise;
    }

    let kakaoSdkPromise = null;
    function loadKakaoSdk() {
        if (kakaoSdkPromise) return kakaoSdkPromise;
        kakaoSdkPromise = new Promise((resolve) => {
            if (window.Kakao) return resolve(true);

            const script = document.createElement('script');
            script.src = KAKAO_SDK_SRC;
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
        return kakaoSdkPromise;
    }

    async function ensureKakaoInit() {
        const ok = await loadKakaoSdk();
        if (!ok) return false;
        if (!window.Kakao) return false;

        try {
            const kakaoJsKey = await resolveKakaoJsKey();
            if (!kakaoJsKey) return false;
            if (!window.Kakao.isInitialized()) {
                window.Kakao.init(kakaoJsKey);
            }
            return true;
        } catch {
            return false;
        }
    }

    async function openKakaoChat() {
        const ready = await ensureKakaoInit();
        if (ready && window.Kakao?.Channel?.chat) {
            try {
                window.Kakao.Channel.chat({ channelPublicId: KAKAO_CHANNEL_PUBLIC_ID });
                return;
            } catch {
                // fall back to URL
            }
        }
        window.open(KAKAO_CHAT_URL, '_blank', 'noopener,noreferrer');
    }

    async function addKakaoChannel() {
        const ready = await ensureKakaoInit();
        if (ready && window.Kakao?.Channel?.addChannel) {
            try {
                window.Kakao.Channel.addChannel({ channelPublicId: KAKAO_CHANNEL_PUBLIC_ID });
                return;
            } catch {
                // fall back to URL
            }
        }
        window.open(KAKAO_CHANNEL_URL, '_blank', 'noopener,noreferrer');
    }

    function ensureStyles() {
        if (document.getElementById('bsqHelperStyle')) return;
        const style = document.createElement('style');
        style.id = 'bsqHelperStyle';
        style.textContent = `
/* Floating launcher */
#bsqHelperLauncher {
  position: fixed;
  right: max(18px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom));
  z-index: 99990;
  display: grid;
  gap: 10px;
}

.bsq-helper-btn {
  width: 58px;
  height: 58px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: radial-gradient(circle at 30% 25%, rgba(142,165,255,0.32), rgba(6,8,13,0.92) 58%);
  box-shadow: 0 18px 50px rgba(0,0,0,0.42);
  color: #eef4ff;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform 220ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 220ms ease, border-color 220ms ease;
}

html[data-theme="light"] .bsq-helper-btn {
  border-color: rgba(15,23,42,0.10);
  background: radial-gradient(circle at 30% 25%, rgba(79,111,255,0.22), rgba(255,255,255,0.96) 60%);
  color: #0f172a;
  box-shadow: 0 18px 50px rgba(15,23,42,0.16);
}

.bsq-helper-btn:hover { transform: translateY(-2px) scale(1.03); }
.bsq-helper-btn:active { transform: translateY(0) scale(0.98); }

.bsq-helper-logo {
  width: 28px;
  height: 28px;
}

.bsq-helper-pulse {
  position: absolute;
  inset: -10px;
  border-radius: 999px;
  pointer-events: none;
  background: radial-gradient(circle, rgba(142,165,255,0.25), transparent 65%);
  filter: blur(10px);
  opacity: 0.75;
  animation: bsqPulse 2.8s ease-in-out infinite;
}

@keyframes bsqPulse {
  0%, 100% { transform: scale(0.92); opacity: 0.55; }
  50% { transform: scale(1.08); opacity: 0.9; }
}

/* Panel */
#bsqHelperPanel {
  position: fixed;
  right: max(18px, env(safe-area-inset-right));
  bottom: calc(max(18px, env(safe-area-inset-bottom)) + 72px);
  width: min(420px, calc(100vw - 24px));
  max-height: min(640px, calc(100vh - 120px));
  z-index: 99991;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(8,10,16,0.86);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow: 0 26px 70px rgba(0,0,0,0.52);
  overflow: hidden;
  transform: translateY(12px) scale(0.98);
  opacity: 0;
  pointer-events: none;
  transition: transform 240ms cubic-bezier(0.2,0.8,0.2,1), opacity 200ms ease;
  display: grid;
  grid-template-rows: auto auto 1fr;
}

html[data-theme="light"] #bsqHelperPanel {
  border-color: rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.92);
  box-shadow: 0 26px 70px rgba(15,23,42,0.18);
}

#bsqHelperPanel[data-open="true"] {
  transform: translateY(0) scale(1);
  opacity: 1;
  pointer-events: auto;
}

.bsq-helper-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 14px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
html[data-theme="light"] .bsq-helper-head {
  border-bottom-color: rgba(15,23,42,0.08);
}

.bsq-helper-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.bsq-helper-title strong {
  font-size: 0.95rem;
  letter-spacing: -0.03em;
  color: #eef4ff;
}
html[data-theme="light"] .bsq-helper-title strong { color: #0f172a; }

.bsq-helper-title span {
  font-size: 0.78rem;
  color: rgba(236,242,255,0.7);
}
html[data-theme="light"] .bsq-helper-title span { color: rgba(15,23,42,0.62); }

.bsq-helper-close {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.06);
  color: inherit;
  cursor: pointer;
  display: grid;
  place-items: center;
}
html[data-theme="light"] .bsq-helper-close {
  border-color: rgba(15,23,42,0.10);
  background: rgba(15,23,42,0.06);
}

.bsq-helper-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 10px 14px 12px;
}

.bsq-helper-tab {
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.04);
  color: rgba(236,242,255,0.82);
  border-radius: 14px;
  padding: 10px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-size: 0.82rem;
}
html[data-theme="light"] .bsq-helper-tab {
  border-color: rgba(15,23,42,0.10);
  background: rgba(15,23,42,0.04);
  color: rgba(15,23,42,0.78);
}

.bsq-helper-tab[aria-selected="true"] {
  border-color: rgba(142,165,255,0.42);
  background: linear-gradient(135deg, rgba(142,165,255,0.20), rgba(28,170,156,0.10));
  color: #eef4ff;
}
html[data-theme="light"] .bsq-helper-tab[aria-selected="true"] {
  border-color: rgba(79,111,255,0.24);
  background: linear-gradient(135deg, rgba(79,111,255,0.14), rgba(28,170,156,0.08));
  color: #0f172a;
}

.bsq-helper-body {
  padding: 12px 14px 14px;
  overflow: auto;
}

.bsq-helper-section {
  display: grid;
  gap: 10px;
}

.bsq-helper-card {
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  padding: 12px 12px;
}
html[data-theme="light"] .bsq-helper-card {
  border-color: rgba(15,23,42,0.10);
  background: rgba(255,255,255,0.70);
}

.bsq-helper-card h4 {
  margin: 0 0 6px 0;
  font-size: 0.9rem;
  letter-spacing: -0.03em;
  color: inherit;
}

.bsq-helper-card p {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.55;
  color: rgba(236,242,255,0.72);
}
html[data-theme="light"] .bsq-helper-card p { color: rgba(15,23,42,0.64); }

.bsq-helper-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.bsq-helper-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.06);
  color: inherit;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 800;
  letter-spacing: -0.02em;
  font-size: 0.82rem;
  text-decoration: none;
}
html[data-theme="light"] .bsq-helper-action {
  border-color: rgba(15,23,42,0.10);
  background: rgba(15,23,42,0.06);
}

.bsq-helper-action.primary {
  border-color: rgba(142,165,255,0.40);
  background: linear-gradient(135deg, rgba(142,165,255,0.24), rgba(28,170,156,0.14));
}

.bsq-helper-iframe {
  width: 100%;
  height: min(420px, 52vh);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  overflow: hidden;
  background: rgba(0,0,0,0.18);
}
html[data-theme="light"] .bsq-helper-iframe {
  border-color: rgba(15,23,42,0.10);
  background: rgba(15,23,42,0.04);
}

.bsq-helper-iframe iframe {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 16px;
}

/* Modal (guide) */
#bsqHelperModal {
  position: fixed;
  inset: 0;
  z-index: 99992;
  display: none;
}
#bsqHelperModal[data-open="true"] { display: grid; place-items: center; }
.bsq-helper-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.54);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}
.bsq-helper-modal-card {
  position: relative;
  width: min(640px, calc(100vw - 24px));
  max-height: min(720px, calc(100vh - 80px));
  overflow: auto;
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(8,10,16,0.92);
  box-shadow: 0 30px 90px rgba(0,0,0,0.60);
  padding: 16px 16px 14px;
}
html[data-theme="light"] .bsq-helper-modal-card {
  background: rgba(255,255,255,0.96);
  border-color: rgba(15,23,42,0.10);
  box-shadow: 0 30px 90px rgba(15,23,42,0.22);
}
.bsq-helper-modal-card h3 { margin: 0 0 8px 0; letter-spacing: -0.04em; }
.bsq-helper-modal-card ol { margin: 0; padding-left: 1.2rem; }
.bsq-helper-modal-card li { margin: 0.4rem 0; line-height: 1.6; font-size: 0.9rem; }
.bsq-helper-modal-footer { display:flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

@media (max-width: 768px) {
  #bsqHelperLauncher {
    bottom: max(92px, calc(env(safe-area-inset-bottom) + 76px));
  }
  #bsqHelperPanel {
    bottom: calc(max(92px, calc(env(safe-area-inset-bottom) + 76px)) + 72px);
    width: min(420px, calc(100vw - 18px));
  }
}
        `;
        document.head.appendChild(style);
    }

    function logoSvg() {
        return `
<svg class="bsq-helper-logo" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M7.2 3.8h6.1c1.2 0 2.2 1 2.2 2.2v6.1c0 1.2-1 2.2-2.2 2.2H7.2c-1.2 0-2.2-1-2.2-2.2V6c0-1.2 1-2.2 2.2-2.2Z" stroke="currentColor" stroke-width="2" opacity="0.9"/>
  <path d="M10.7 9.6h6.1c1.2 0 2.2 1 2.2 2.2v6.1c0 1.2-1 2.2-2.2 2.2h-6.1c-1.2 0-2.2-1-2.2-2.2v-6.1c0-1.2 1-2.2 2.2-2.2Z" stroke="currentColor" stroke-width="2"/>
</svg>`;
    }

    function iconSvg(kind) {
        const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
        if (kind === 'home') {
            return `<svg ${common}><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z"/></svg>`;
        }
        if (kind === 'chat') {
            return `<svg ${common}><path d="M21 11.5a8 8 0 0 1-8 8H8l-5 3 1.4-4.2A8 8 0 1 1 21 11.5Z"/></svg>`;
        }
        if (kind === 'settings') {
            return `<svg ${common}><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"/><path d="M19.4 12a7.5 7.5 0 0 0-.1-1l2-1.6-1.9-3.4-2.5 1a8.2 8.2 0 0 0-1.7-1l-.4-2.7H9.2L8.8 6a8.2 8.2 0 0 0-1.7 1l-2.5-1L2.7 9.4l2 1.6a7.5 7.5 0 0 0 0 2l-2 1.6 1.9 3.4 2.5-1a8.2 8.2 0 0 0 1.7 1l.4 2.7h5.6l.4-2.7a8.2 8.2 0 0 0 1.7-1l2.5 1 1.9-3.4-2-1.6c.1-.3.1-.6.1-1Z"/></svg>`;
        }
        return '';
    }

    function ensureDom() {
        if (document.getElementById('bsqHelperLauncher')) return;

        const launcherWrap = document.createElement('div');
        launcherWrap.id = 'bsqHelperLauncher';
        launcherWrap.innerHTML = `
  <div style="position:relative;">
    <div class="bsq-helper-pulse" aria-hidden="true"></div>
    <button type="button" class="bsq-helper-btn" id="bsqHelperBtn" aria-label="B-Square 도우미 열기">
      ${logoSvg()}
    </button>
  </div>
        `.trim();

        const panel = document.createElement('section');
        panel.id = 'bsqHelperPanel';
        panel.setAttribute('aria-label', 'B-Square 도우미');
        panel.dataset.open = 'false';
        panel.innerHTML = `
  <div class="bsq-helper-head">
    <div class="bsq-helper-title">
      <div style="width:34px;height:34px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);">
        ${logoSvg()}
      </div>
      <div style="min-width:0;">
        <strong>B-Square 도우미</strong>
        <span id="bsqHelperSubline">빠른 안내와 문의</span>
      </div>
    </div>
    <button type="button" class="bsq-helper-close" id="bsqHelperClose" aria-label="닫기">✕</button>
  </div>
  <nav class="bsq-helper-tabs" aria-label="도우미 메뉴">
    <button type="button" class="bsq-helper-tab" data-tab="home" aria-selected="true">${iconSvg('home')} 홈</button>
    <button type="button" class="bsq-helper-tab" data-tab="kakao" aria-selected="false">${iconSvg('chat')} 카카오</button>
    <button type="button" class="bsq-helper-tab" data-tab="settings" aria-selected="false">${iconSvg('settings')} 설정</button>
  </nav>
  <div class="bsq-helper-body" id="bsqHelperBody"></div>
        `.trim();

        const modal = document.createElement('div');
        modal.id = 'bsqHelperModal';
        modal.dataset.open = 'false';
        modal.innerHTML = `
  <div class="bsq-helper-modal-backdrop" data-action="close-modal"></div>
  <div class="bsq-helper-modal-card" role="dialog" aria-modal="true" aria-label="가이드">
    <h3 id="bsqHelperModalTitle">가이드</h3>
    <div id="bsqHelperModalBody"></div>
    <div class="bsq-helper-modal-footer">
      <button type="button" class="bsq-helper-action" data-action="close-modal">닫기</button>
      <button type="button" class="bsq-helper-action primary" data-action="mark-seen">다시 보지 않기</button>
    </div>
  </div>
        `.trim();

        document.body.appendChild(launcherWrap);
        document.body.appendChild(panel);
        document.body.appendChild(modal);
    }

    function setPanelOpen(open) {
        const panel = document.getElementById('bsqHelperPanel');
        if (!panel) return;
        panel.dataset.open = open ? 'true' : 'false';
    }

    function getPanelOpen() {
        return document.getElementById('bsqHelperPanel')?.dataset.open === 'true';
    }

    function setSelectedTab(tab) {
        const panel = document.getElementById('bsqHelperPanel');
        const body = document.getElementById('bsqHelperBody');
        if (!panel || !body) return;

        const tabs = Array.from(panel.querySelectorAll('.bsq-helper-tab'));
        tabs.forEach((btn) => {
            const selected = btn.dataset.tab === tab;
            btn.setAttribute('aria-selected', selected ? 'true' : 'false');
        });

        try { localStorage.setItem(STORAGE.lastTab, tab); } catch { }
        renderTab(tab);
        if (tab === 'settings') {
            enhanceSettingsPanel();
        }
    }

    function modalOpen(open) {
        const modal = document.getElementById('bsqHelperModal');
        if (!modal) return;
        modal.dataset.open = open ? 'true' : 'false';
    }

    function renderGuideModal(title, steps) {
        const modalTitle = document.getElementById('bsqHelperModalTitle');
        const modalBody = document.getElementById('bsqHelperModalBody');
        if (!modalTitle || !modalBody) return;

        modalTitle.textContent = title;
        modalBody.innerHTML = `
  <ol>
    ${steps.map((step) => `<li>${String(step).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`).join('')}
  </ol>
        `.trim();
        modalOpen(true);
    }

    function enhanceSettingsPanel() {
        const body = document.getElementById('bsqHelperBody');
        if (!body) return;

        const user = window.BSQ?.session?.user || null;
        if (!user?.id) return;

        body.querySelector('.bsq-helper-profile-card')?.remove();

        const consentLabel = (value) => {
            const normalized = normalizeConsentState(value);
            if (normalized === null) return '미설정';
            return normalized ? '동의' : '거부';
        };

        const profileImage = user.profile_image_url || '';
        const roleLabel = getRoleLabel(user.role || '');
        const avatarMarkup = profileImage
            ? `<img src="${profileImage}" alt="" style="width:100%;height:100%;object-fit:cover;">`
            : `<span style="font-size:1.05rem;font-weight:900;">${String(user.name || user.username || 'B').slice(0, 1)}</span>`;

        const card = document.createElement('div');
        card.className = 'bsq-helper-card bsq-helper-profile-card';
        card.innerHTML = `
  <h4>내 프로필</h4>
  <div style="display:flex; gap:12px; align-items:center;">
    <div style="width:52px; height:52px; border-radius:18px; overflow:hidden; border:1px solid rgba(255,255,255,0.10); background:rgba(255,255,255,0.06); display:grid; place-items:center; flex-shrink:0;">
      ${avatarMarkup}
    </div>
    <div style="min-width:0;">
      <p style="margin:0 0 3px 0; font-size:0.98rem; font-weight:800; color:inherit;">${String(user.name || user.username || '회원')}</p>
      <p style="margin:0; font-size:0.8rem;">${String(user.email || '이메일 정보 없음')} · ${roleLabel}</p>
    </div>
  </div>
  <div class="bsq-helper-actions" style="margin-top:12px;">
    <span class="bsq-helper-action">${`SMS ${consentLabel(user.marketing_sms_consent)}`}</span>
    <span class="bsq-helper-action">${`이메일 ${consentLabel(user.marketing_email_consent)}`}</span>
  </div>
  <div class="bsq-helper-actions">
    <a class="bsq-helper-action primary" href="/mi_pesg/mypage.html">마이페이지</a>
    <a class="bsq-helper-action" href="/notice/notice.html">공지 확인</a>
  </div>
        `.trim();

        body.prepend(card);
    }

    function renderTab(tab) {
        const body = document.getElementById('bsqHelperBody');
        if (!body) return;

        const theme = getTheme();
        const isLoggedIn = !!window.BSQ?.session?.user?.id;
        const userName = window.BSQ?.session?.user?.name || window.BSQ?.session?.user?.username || '회원';

        if (tab === 'home') {
            body.innerHTML = `
  <div class="bsq-helper-section">
    <div class="bsq-helper-card">
      <h4>핵심 기능 안내</h4>
      <p>처음 방문이라면 1분만 보고 바로 시작할 수 있게 정리했습니다.</p>
      <div class="bsq-helper-actions">
        <button type="button" class="bsq-helper-action primary" data-guide="core">처음 방문 가이드</button>
        <button type="button" class="bsq-helper-action" data-guide="class">클래스 이용/개설</button>
        <button type="button" class="bsq-helper-action" data-guide="chat">채팅 이용 방법</button>
        <button type="button" class="bsq-helper-action" data-guide="mypage">마이페이지/프로필</button>
        <button type="button" class="bsq-helper-action" data-guide="settlement">강사 정산 안내</button>
      </div>
    </div>
    <div class="bsq-helper-card">
      <h4>빠른 이동</h4>
      <p>원하는 화면으로 바로 이동합니다.</p>
      <div class="bsq-helper-actions">
        <a class="bsq-helper-action" href="/index.html">홈</a>
        <a class="bsq-helper-action" href="/class/class_list.html">클래스</a>
        <a class="bsq-helper-action" href="/community/community.html">커뮤니티</a>
        <a class="bsq-helper-action" href="/contact/contact.html">문의</a>
      </div>
    </div>
  </div>
            `.trim();
            return;
        }

        if (tab === 'kakao') {
            body.innerHTML = `
  <div class="bsq-helper-section">
    <div class="bsq-helper-card">
      <h4>카카오톡 문의</h4>
      <p>도우미 안에서 보기가 막히면 아래 버튼으로 바로 상담을 열 수 있습니다.</p>
      <div class="bsq-helper-actions">
        <button type="button" class="bsq-helper-action primary" data-action="kakao-chat">상담 시작하기</button>
        <button type="button" class="bsq-helper-action" data-action="kakao-add">채널 추가</button>
        <a class="bsq-helper-action" href="${KAKAO_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">채널 페이지</a>
      </div>
    </div>
    <div class="bsq-helper-iframe">
      <iframe title="카카오톡 채널" src="${KAKAO_CHANNEL_URL}" loading="lazy" referrerpolicy="no-referrer"></iframe>
    </div>
  </div>
            `.trim();
            return;
        }

        if (tab === 'settings') {
            body.innerHTML = `
  <div class="bsq-helper-section">
    <div class="bsq-helper-card">
      <h4>테마</h4>
      <p>현재 테마: <strong>${theme === 'light' ? '라이트' : '다크'}</strong></p>
      <div class="bsq-helper-actions">
        <button type="button" class="bsq-helper-action ${theme === 'dark' ? 'primary' : ''}" data-action="theme-dark">다크</button>
        <button type="button" class="bsq-helper-action ${theme === 'light' ? 'primary' : ''}" data-action="theme-light">라이트</button>
      </div>
    </div>
    <div class="bsq-helper-card">
      <h4>계정</h4>
      <p>${isLoggedIn ? `${userName}님으로 로그인 중입니다.` : '로그인하면 테마 설정이 계정에 저장됩니다.'}</p>
      <div class="bsq-helper-actions">
        ${isLoggedIn ? `<a class="bsq-helper-action" href="/mi_pesg/mypage.html">마이페이지 열기</a>` : `<a class="bsq-helper-action primary" href="/login/login.html">로그인</a>`}
      </div>
    </div>
  </div>
            `.trim();
            return;
        }
    }

    function bindEvents() {
        const btn = document.getElementById('bsqHelperBtn');
        const close = document.getElementById('bsqHelperClose');
        const panel = document.getElementById('bsqHelperPanel');
        const modal = document.getElementById('bsqHelperModal');

        btn?.addEventListener('click', () => {
            const willOpen = !getPanelOpen();
            setPanelOpen(willOpen);
            if (!willOpen) return;

            let tab = 'home';
            try { tab = localStorage.getItem(STORAGE.lastTab) || 'home'; } catch { }
            setSelectedTab(tab);
        });

        close?.addEventListener('click', () => setPanelOpen(false));

        panel?.addEventListener('click', (event) => {
            const tabBtn = event.target.closest('.bsq-helper-tab');
            if (tabBtn) {
                event.preventDefault();
                setSelectedTab(tabBtn.dataset.tab);
                return;
            }

            const action = event.target.closest('[data-action]')?.dataset.action;
            if (action === 'kakao-chat') {
                event.preventDefault();
                openKakaoChat();
                return;
            }
            if (action === 'kakao-add') {
                event.preventDefault();
                addKakaoChannel();
                return;
            }
            if (action === 'theme-dark') {
                event.preventDefault();
                persistThemePreference('dark').then(() => setSelectedTab('settings'));
                return;
            }
            if (action === 'theme-light') {
                event.preventDefault();
                persistThemePreference('light').then(() => setSelectedTab('settings'));
                return;
            }

            const guide = event.target.closest('[data-guide]')?.dataset.guide;
            if (guide) {
                event.preventDefault();
                if (guide === 'core') {
                    renderGuideModal('처음 방문 가이드', [
                        '클래스: 카테고리/검색으로 클래스를 찾고 상세 페이지에서 바로 시작할 수 있습니다.',
                        '수강/결제: 수강 버튼을 누르면 결제(또는 수강권) 흐름으로 이어집니다.',
                        '채팅: 수강(또는 강사 권한)이 있으면 클래스 채팅이 열립니다.',
                        '마이페이지: 프로필/비밀번호/테마/결제 내역을 관리합니다.',
                        '문의: 문제가 있으면 카카오톡 채널로 빠르게 문의할 수 있습니다.',
                    ]);
                } else if (guide === 'class') {
                    renderGuideModal('클래스 이용/개설', [
                        '클래스 목록에서 관심 카테고리를 선택하거나 검색하세요.',
                        '상세 페이지에서 소개/커리큘럼을 확인하고 수강을 시작합니다.',
                        '강사라면 클래스 개설 메뉴에서 커리큘럼/이미지를 등록하고 공개합니다.',
                    ]);
                } else if (guide === 'chat') {
                    renderGuideModal('채팅 이용 방법', [
                        '클래스를 수강(또는 강사 권한)하면 채팅 탭이 활성화됩니다.',
                        '메시지 검색, 테마 전환, 정보 패널에서 참여자/모임 정보를 확인할 수 있습니다.',
                    ]);
                } else if (guide === 'mypage') {
                    renderGuideModal('마이페이지/프로필', [
                        '프로필에서 기본 정보를 수정할 수 있습니다.',
                        '보안/설정에서 비밀번호와 테마를 관리합니다.',
                        '결제/수강 내역을 확인하고 필요한 경우 문의를 남기세요.',
                    ]);
                } else if (guide === 'settlement') {
                    renderGuideModal('강사 정산 안내', [
                        '정산은 결제/환불 내역과 수강권 사용량을 기준으로 집계됩니다.',
                        '정산 관련 문의는 카카오톡 채널로 연락해 주세요.',
                    ]);
                }
                return;
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (modal?.dataset.open === 'true') {
                modalOpen(false);
                return;
            }
            if (getPanelOpen()) setPanelOpen(false);
        });

        document.addEventListener('click', (event) => {
            const panelEl = document.getElementById('bsqHelperPanel');
            const launcherEl = document.getElementById('bsqHelperLauncher');
            if (!getPanelOpen()) return;
            if (panelEl?.contains(event.target)) return;
            if (launcherEl?.contains(event.target)) return;
            setPanelOpen(false);
        }, true);

        modal?.addEventListener('click', (event) => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            event.preventDefault();
            if (action === 'close-modal') {
                modalOpen(false);
            } else if (action === 'mark-seen') {
                try { localStorage.setItem(STORAGE.tourSeen, '1'); } catch { }
                modalOpen(false);
            }
        });
    }

    function maybeShowFirstTour() {
        let seen = false;
        try { seen = localStorage.getItem(STORAGE.tourSeen) === '1'; } catch { }
        if (seen) return;

        // Show once, a moment after page is interactive.
        window.setTimeout(() => {
            if (getPanelOpen()) return;
            setPanelOpen(true);
            setSelectedTab('home');
            renderGuideModal('환영합니다', [
                '필수 기능만 빠르게 안내합니다. (언제든 도우미에서 다시 볼 수 있습니다.)',
                '상단 카테고리 더보기는 목록 위에 오버레이로 뜹니다.',
                '메인 배너는 5초 주기로 부드럽게 슬라이드됩니다.',
                '문의는 카카오톡 채널로 바로 연결됩니다.',
            ]);
        }, 1200);
    }

    function init() {
        ensureStyles();
        ensureDom();
        bindEvents();
        maybeShowFirstTour();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
