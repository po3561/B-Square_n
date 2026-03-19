// dev_mode.js - 개발자/운영자 모드 총괄 보안 시스템 (순수 D1 API 기반)
// 모든 페이지에 포함되어 운영자 모드(Ctrl+Shift+Alt+D) 활성화 및 UI/API 권한 해제 관리
(function () {
    'use strict';

    // ---- 비밀 코드 (고정값) ----
    const RAW_CODE = '502ACpp\u314C%%!\u3141\uB108\uB140\u3151\u3148\u3137sjshwh!!@*^';
    const STORAGE_KEY = '__bsq_dev_mode__';
    const SESSION_TTL = 1000 * 60 * 60 * 4; // 4시간

    // ---- 상태 ----
    let isDevMode = false;
    let devPanel = null;
    let keyBuffer = '';
    let keyTimer = null;

    // ---- 초기화 ----
    async function init() {
        // 이미 활성화 상태 유무 확인
        checkSavedSession();

        // 키보드 입력 감지 (어떤 페이지에서든)
        document.addEventListener('keydown', captureKeyInput);

        // 이미 활성화 상태면 즉시 권한 개방
        if (isDevMode) {
            activateDevMode(true);
        }

        // 로그인 후 본인(운영자) 계정이면 자동 활성화 감지 리스너
        window.addEventListener('bsq_dev_mode_activated', () => {
            if (!isDevMode) {
                activateDevMode(true);
            }
        });
    }

    // 세션 확인
    function checkSavedSession() {
        try {
            const saved = sessionStorage.getItem(STORAGE_KEY);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.active && Date.now() - data.timestamp < SESSION_TTL) {
                    isDevMode = true;
                }
            }
        } catch (e) { /* 무시 */ }
    }

    // 키 입력 캡처 (비밀 코드 감지)
    function captureKeyInput(e) {
        if (isDevMode) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        keyBuffer += e.key;
        clearTimeout(keyTimer);
        keyTimer = setTimeout(() => { keyBuffer = ''; }, 5000);

        // Ctrl+Shift+Alt+D로 개발자 인증 시작
        if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'D' || e.key === 'd')) {
            e.preventDefault();
            showCodePrompt();
        }
    }

    // 2단계 인증 프롬프트
    function showCodePrompt() {
        const pin = prompt('🔐 1차 인증 - 키패드 코드를 입력하세요:');
        if (pin !== '1862') {
            if (pin !== null) alert('❌ 키패드 코드가 올바르지 않습니다.');
            return;
        }

        const code = prompt('🔑 2차 인증 - 개발자 코드를 입력하세요:');
        if (code === RAW_CODE) {
            activateDevMode(false);
        } else if (code) {
            alert('❌ 개발자 코드가 올바르지 않습니다.');
        }
    }

    // ---- 개발자/운영자 모드 활성화 ----
    function activateDevMode(isRestore) {
        isDevMode = true;
        
        // ★ 전역 플래그 오픈
        window.__BSQ_DEV_MODE__ = true;
        // 강사 권한 우회
        window.isInstructor = true;
        window.isEnrolled = true;
        
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            active: true,
            timestamp: Date.now()
        }));

        createDevPanel();
        unlockPagePermissions();

        if (!isRestore) {
            showDevToast('✅ 운영자 모드 활성화', '최고 관리자 권한이 시스템 전역에 부여되었습니다.');
            console.log('%c🛡️ B-SQUARE OPERATOR MODE ACTIVATED', 'color: #ff4d4d; font-size: 16px; font-weight: bold;');
        }
    }

    // ---- 페이지 내 통제 요소 활성화 ----
    function unlockPagePermissions() {
        // 숨겨진 편집 UI 표시 (data-dev-only, view-tab-edit 등)
        document.querySelectorAll('[data-dev-only], .dev-only, .view-tab-edit, #tabEditBtn').forEach(el => {
            el.style.display = 'inline-block';
        });

        // 잠긴 폼 컨트롤 해제
        document.querySelectorAll('[disabled]').forEach(el => {
            el.removeAttribute('disabled');
        });

        // 뷰 탭에서 잠긴 콘텐츠를 강제로 엽니다
        document.querySelectorAll('.tab-locked-content').forEach(el => {
            el.style.display = 'none'; // 잠금 화면 숨김
        });
        document.querySelectorAll('.tab-unlocked-content').forEach(el => {
            el.style.display = 'block'; // 본문 노출
        });

        applyOperatorToHeader();
    }

    // 헤더 프로필 강제 교체 (가상 운영자 계정 연출)
    function applyOperatorToHeader() {
        const loginBtn = document.querySelector('.btn-login, .header-login-btn, [href*="login"]');
        if (loginBtn) loginBtn.style.display = 'none';

        const profileArea = document.querySelector('.header-profile, .user-profile-area, .header-user');
        if (profileArea) {
            profileArea.style.display = 'flex';
            const nameEl = profileArea.querySelector('.user-name, .profile-name');
            if (nameEl) nameEl.textContent = '총괄운영자';
            const avatarEl = profileArea.querySelector('.user-avatar img, .profile-avatar img');
            if (avatarEl) avatarEl.src = 'https://cdn-icons-png.flaticon.com/512/6024/6024190.png';
        }
    }

    // ---- 개발자 툴박스 UI (매우 간소화) ----
    function createDevPanel() {
        if (devPanel) return;

        devPanel = document.createElement('div');
        devPanel.id = 'devModePanel';
        devPanel.innerHTML = `
            <style>
                #devModePanel { position: fixed; bottom: 12px; right: 12px; z-index: 99999; font-family: 'Segoe UI', sans-serif; }
                #devModeToggle { width:48px; height:48px; border-radius:50%; background:#ff4d4d; border:2px solid #fff; color:#fff; font-size:1.3rem; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 20px rgba(255,77,77,0.4); }
                #devDrawer { display:none; position:absolute; bottom:58px; right:0; width:280px; background:#111; border:1px solid #333; border-radius:14px; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,0.6); }
                #devDrawer.open { display:flex; flex-direction:column; }
                .dev-header { padding:12px; background:#ff4d4d; color:#fff; font-weight:700; font-size:0.9rem; display:flex; justify-content:space-between; align-items:center; }
                .dev-header button { background:rgba(0,0,0,0.2); border:none; color:#fff; padding:4px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer; }
                .dev-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
                .dev-btn { padding:10px; background:#1e1e1e; border:1px solid #333; border-radius:8px; color:#e8e8e8; font-size:0.85rem; cursor:pointer; text-align:center; transition:0.2s; }
                .dev-btn:hover { border-color:#ff4d4d; }
                .dev-toast { position:fixed; top:16px; right:16px; background:#111; border:1px solid #ff4d4d; border-radius:10px; padding:12px 20px; color:#fff; z-index:999999; font-size:0.85rem; animation:devSlideIn 0.3s ease; }
                @keyframes devSlideIn { from { transform:translateX(100%); opacity:0; } to { transform:translateX(0); opacity:1; } }
            </style>
            <button id="devModeToggle" title="운영자 툴킷">👁️</button>
            <div id="devDrawer">
                <div class="dev-header">
                    <span>👑 OPERATOR MODE</span>
                    <button onclick="window.__BSQ_DEV_API__.deactivate()">종료</button>
                </div>
                <div class="dev-body">
                    <button class="dev-btn" onclick="window.__BSQ_DEV_API__.forceUnlock()">전체 권한 락해제 재시도</button>
                    <button class="dev-btn" onclick="location.href='/class_create/create_class.html'">클래스 강제 신규 생성</button>
                    <button class="dev-btn" onclick="location.reload()">페이지 캐시 새로고침</button>
                </div>
            </div>
        `;
        document.body.appendChild(devPanel);

        document.getElementById('devModeToggle').addEventListener('click', () => {
            document.getElementById('devDrawer').classList.toggle('open');
        });
    }

    // ---- API 객체 할당 ----
    window.__BSQ_DEV_API__ = {
        forceUnlock: () => {
            unlockPagePermissions();
            showDevToast('권한 리로딩', '현재 페이지의 강사 및 관리자 권한을 강제로 다시 부여합니다.');
        },
        deactivate: () => {
            isDevMode = false;
            window.__BSQ_DEV_MODE__ = false;
            window.isInstructor = false;
            sessionStorage.removeItem(STORAGE_KEY);
            if (devPanel) devPanel.remove();
            showDevToast('🔒 일반 모드 전환', '운영자 권한이 회수되었습니다.');
            setTimeout(() => location.reload(), 1000);
        }
    };

    function showDevToast(title, msg) {
        const toast = document.createElement('div');
        toast.className = 'dev-toast';
        toast.innerHTML = `<strong style="display:block;margin-bottom:4px;">${title}</strong><span>${msg}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
