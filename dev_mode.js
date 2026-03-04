// dev_mode.js - 개발자 모드 총괄 보안 시스템
// 모든 페이지에 포함되어 개발자 모드 활성화/관리
(function () {
    'use strict';

    // ---- 보안 코드 (SHA-256 해시 저장) ----
    const DEV_CODE_HASH = '8b7c2f4a9e1d3f5a6b8c0d2e4f6a8b0c'; // placeholder, 실제는 아래 verify 로직
    const RAW_CODE = '502ACpp\u314C%%!\u3141\uB108\uB140\u3151\u3148\u3137sjshwh!!@*^';
    const STORAGE_KEY = '__bsq_dev_mode__';
    const SESSION_TTL = 1000 * 60 * 60 * 4; // 4시간

    // ---- Firebase + Supabase 설정 ----
    const SUPABASE_URL = "https://tqyckxgtavviatkfsymb.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw";

    // Fallback config if not initialized globally
    const fallbackFirebaseConfig = {
        apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
        authDomain: "b-square-39b11.firebaseapp.com",
        databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
        projectId: "b-square-39b11",
        storageBucket: "b-square-39b11.firebasestorage.app",
        messagingSenderId: "1012056920961",
        appId: "1:1012056920961:web:8342bfdf123b78f6a38e80"
    };

    // ---- 상태 ----
    let isDevMode = false;
    let devPanel = null;
    let db = null;
    let supabaseClient = null;
    let keyBuffer = '';
    let keyTimer = null;

    // ---- 초기화 ----
    async function init() {
        initDatabases(); // 세션 조회를 위한 DB 조기 초기화

        // 총괄 개발자 자동 로그인
        await checkSuperAdmin();

        // 저장된 세션 확인
        checkSavedSession();

        // 키보드 입력 감지 (어떤 페이지에서든)
        document.addEventListener('keydown', captureKeyInput);

        // 이미 활성화 상태면 패널 표시
        if (isDevMode) {
            activateDevMode(true);
        }
    }

    // 개발자 본인 로그인 자동 처리
    async function checkSuperAdmin() {
        if (!supabaseClient) return;
        try {
            const { data } = await supabaseClient.auth.getSession();
            const session = data?.session;
            if (session && session.user && session.user.email) {
                if (session.user.email.includes('ej210651392')) {
                    if (!isDevMode) {
                        isDevMode = true;
                        activateDevMode(false); // 자동 모드 켜기
                        showDevToast('👨‍💻 총괄 개발자 모드', '개발자 계정이 인식되어 권한이 자동 부여되었습니다.');
                    }
                }
            }
        } catch (e) {
            console.warn('SuperAdmin check failed:', e.message);
        }
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
        // 이미 활성화된 상태면 무시
        if (isDevMode) return;
        // input/textarea 에서는 무시
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
        // 1차: 키패드 코드
        const pin = prompt('🔐 1차 인증 - 키패드 코드를 입력하세요:');
        if (pin !== '1862') {
            if (pin !== null) alert('❌ 키패드 코드가 올바르지 않습니다.');
            return;
        }

        // 2차: 비밀 코드
        const code = prompt('� 2차 인증 - 개발자 코드를 입력하세요:');
        if (code && verifyCode(code)) {
            activateDevMode(false);
        } else if (code) {
            alert('❌ 개발자 코드가 올바르지 않습니다.');
        }
    }

    // 코드 검증
    function verifyCode(input) {
        return input === RAW_CODE;
    }

    // ---- 개발자 모드 활성화 ----
    function activateDevMode(isRestore) {
        isDevMode = true;
        window.__BSQ_DEV_MODE__ = true;

        // 세션 저장
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            active: true,
            timestamp: Date.now()
        }));

        // DB 연결
        initDatabases();

        // 패널 생성
        createDevPanel();

        // 페이지별 권한 해제
        unlockPagePermissions();

        if (!isRestore) {
            showDevToast('✅ 개발자 모드 활성화', '모든 권한이 해제되었습니다.');
            console.log('%c🛡️ DEV MODE ACTIVATED', 'color: #6e8efb; font-size: 16px; font-weight: bold;');
        }
    }

    // DB 초기화
    function initDatabases() {
        try {
            if (typeof firebase !== 'undefined') {
                if (!firebase.apps.length) firebase.initializeApp(fallbackFirebaseConfig);
                if (!db) db = firebase.database();
                // 익명 로그인으로 Firebase 규칙(auth != null) 우회 권한 획득
                if (typeof firebase.auth === 'function') {
                    firebase.auth().onAuthStateChanged(user => {
                        if (!user) {
                            firebase.auth().signInAnonymously().catch(e => console.warn('Firebase Anon auth error:', e));
                        }
                    });
                }
            }
        } catch (e) { console.warn('Firebase init:', e); }

        try {
            if (typeof window.supabase !== 'undefined' && !supabaseClient) {
                supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            }
        } catch (e) { console.warn('Supabase init:', e); }
    }

    // ---- 페이지 권한 해제 ----
    function unlockPagePermissions() {
        // 전역 플래그 설정 (다른 JS에서 참조 가능)
        window.__BSQ_DEV_MODE__ = true;
        window.__BSQ_DEV_DB__ = db;
        window.__BSQ_DEV_SUPABASE__ = supabaseClient;

        // 강사 권한 강제 부여 (class_view용)
        if (typeof window.isInstructor !== 'undefined') {
            window.isInstructor = true;
        }

        // 숨겨진 편집 UI 표시
        document.querySelectorAll('[data-dev-only], .dev-only').forEach(el => {
            el.style.display = '';
        });

        // 비활성화된 버튼/입력 활성화
        document.querySelectorAll('[disabled]').forEach(el => {
            el.removeAttribute('disabled');
        });
    }

    // ---- 개발자 패널 UI ----
    function createDevPanel() {
        if (devPanel) return;

        devPanel = document.createElement('div');
        devPanel.id = 'devModePanel';
        devPanel.innerHTML = `
            <style>
                #devModePanel {
                    position: fixed;
                    bottom: 12px; right: 12px;
                    z-index: 99999;
                    font-family: 'Segoe UI', sans-serif;
                }
                #devModeToggle {
                    width: 48px; height: 48px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #6e8efb, #a777e3);
                    border: 2px solid #fff;
                    color: #fff;
                    font-size: 1.3rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 4px 20px rgba(110,142,251,0.4);
                    transition: transform 0.2s;
                }
                #devModeToggle:hover { transform: scale(1.1); }
                #devDrawer {
                    display: none;
                    position: absolute;
                    bottom: 58px; right: 0;
                    width: 360px;
                    max-height: 500px;
                    background: #111;
                    border: 1px solid #333;
                    border-radius: 14px;
                    overflow: hidden;
                    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
                }
                #devDrawer.open { display: flex; flex-direction: column; }
                .dev-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: linear-gradient(135deg, #6e8efb, #a777e3);
                    color: #fff;
                    font-weight: 700;
                    font-size: 0.9rem;
                }
                .dev-header button {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: #fff;
                    padding: 4px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.75rem;
                }
                .dev-tabs {
                    display: flex;
                    background: #1a1a1a;
                    border-bottom: 1px solid #333;
                }
                .dev-tab {
                    flex: 1;
                    padding: 8px;
                    background: transparent;
                    border: none;
                    color: #888;
                    font-size: 0.78rem;
                    cursor: pointer;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }
                .dev-tab.active {
                    color: #6e8efb;
                    border-bottom-color: #6e8efb;
                }
                .dev-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 12px;
                    max-height: 380px;
                }
                .dev-body::-webkit-scrollbar { width: 4px; }
                .dev-body::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
                .dev-section-title {
                    font-size: 0.75rem;
                    color: #6e8efb;
                    font-weight: 700;
                    margin: 8px 0 6px;
                    text-transform: uppercase;
                }
                .dev-btn {
                    display: block;
                    width: 100%;
                    padding: 8px 12px;
                    margin-bottom: 6px;
                    background: #1e1e1e;
                    border: 1px solid #333;
                    border-radius: 8px;
                    color: #e8e8e8;
                    font-size: 0.82rem;
                    cursor: pointer;
                    text-align: left;
                    transition: all 0.2s;
                }
                .dev-btn:hover { background: #2a2a2a; border-color: #6e8efb; }
                .dev-btn.danger { border-color: #ff4d4d; color: #ff4d4d; }
                .dev-input {
                    width: 100%;
                    padding: 8px 12px;
                    background: #0e0e0e;
                    border: 1px solid #333;
                    border-radius: 8px;
                    color: #e8e8e8;
                    font-size: 0.82rem;
                    margin-bottom: 8px;
                    outline: none;
                    font-family: monospace;
                }
                .dev-input:focus { border-color: #6e8efb; }
                .dev-output {
                    background: #0a0a0a;
                    border: 1px solid #222;
                    border-radius: 8px;
                    padding: 8px;
                    font-size: 0.75rem;
                    color: #4CAF50;
                    font-family: monospace;
                    max-height: 200px;
                    overflow-y: auto;
                    white-space: pre-wrap;
                    word-break: break-all;
                }
                .dev-toast {
                    position: fixed;
                    top: 16px; right: 16px;
                    background: #111;
                    border: 1px solid #6e8efb;
                    border-radius: 10px;
                    padding: 12px 20px;
                    color: #e8e8e8;
                    z-index: 999999;
                    font-size: 0.85rem;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                    animation: devSlideIn 0.3s ease;
                }
                .dev-toast h4 { margin: 0 0 4px; color: #6e8efb; font-size: 0.9rem; }
                @keyframes devSlideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>

            <button id="devModeToggle" title="개발자 도구">🛡️</button>
            <div id="devDrawer">
                <div class="dev-header">
                    <span>🛡️ DEV MODE</span>
                    <button onclick="window.__BSQ_DEV__.deactivate()">비활성화</button>
                </div>
                <div class="dev-tabs">
                    <button class="dev-tab active" data-tab="firebase">Firebase</button>
                    <button class="dev-tab" data-tab="supabase">Supabase</button>
                    <button class="dev-tab" data-tab="tools">도구</button>
                </div>
                <div class="dev-body" id="devBody">
                    <!-- 동적 콘텐츠 -->
                </div>
            </div>
        `;

        document.body.appendChild(devPanel);

        // 토글 버튼
        document.getElementById('devModeToggle').addEventListener('click', () => {
            const drawer = document.getElementById('devDrawer');
            drawer.classList.toggle('open');
        });

        // 탭 전환
        devPanel.querySelectorAll('.dev-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                devPanel.querySelectorAll('.dev-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                renderTabContent(tab.dataset.tab);
            });
        });

        renderTabContent('firebase');
    }

    // ---- 탭 콘텐츠 렌더링 ----
    function renderTabContent(tab) {
        const body = document.getElementById('devBody');
        if (!body) return;

        if (tab === 'firebase') {
            body.innerHTML = `
                <div class="dev-section-title">📂 Firebase RTDB</div>
                <input class="dev-input" id="devFbPath" placeholder="경로 입력 (예: classes, chats/classId)" value="classes">
                <button class="dev-btn" onclick="window.__BSQ_DEV__.fbRead()">📖 데이터 읽기</button>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.fbWrite()">✏️ 데이터 쓰기</button>
                <button class="dev-btn danger" onclick="window.__BSQ_DEV__.fbDelete()">🗑️ 데이터 삭제</button>
                <textarea class="dev-input" id="devFbData" rows="3" placeholder="쓰기 데이터 (JSON)"></textarea>
                <div class="dev-output" id="devFbOutput">결과가 여기에 표시됩니다...</div>
            `;
        } else if (tab === 'supabase') {
            body.innerHTML = `
                <div class="dev-section-title">🗃️ Supabase</div>
                <input class="dev-input" id="devSbTable" placeholder="테이블 이름 (예: users)" value="users">
                <button class="dev-btn" onclick="window.__BSQ_DEV__.sbRead()">📖 데이터 읽기</button>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.sbQuery()">🔍 조건 검색</button>
                <input class="dev-input" id="devSbColumn" placeholder="검색 컬럼 (예: name)">
                <input class="dev-input" id="devSbValue" placeholder="검색 값">
                <div class="dev-output" id="devSbOutput">결과가 여기에 표시됩니다...</div>
            `;
        } else if (tab === 'tools') {
            body.innerHTML = `
                <div class="dev-section-title">🔧 개발 도구</div>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.pageInfo()">📋 현재 페이지 정보</button>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.listAllClasses()">📚 전체 클래스 목록</button>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.listAllUsers()">👥 전체 사용자 목록</button>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.clearChatHistory()">💬 채팅 기록 초기화</button>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.forceInstructor()">👨‍🏫 강사 권한 강제 부여</button>
                <button class="dev-btn" onclick="window.__BSQ_DEV__.reloadPage()">🔄 페이지 새로고침</button>
                <button class="dev-btn danger" onclick="window.__BSQ_DEV__.deactivate()">🔒 개발자 모드 해제</button>
                <div class="dev-output" id="devToolOutput">도구 결과가 여기에 표시됩니다...</div>
            `;
        }
    }

    // ---- Firebase 명령 ----
    window.__BSQ_DEV__ = {
        // Firebase 읽기
        fbRead: async function () {
            const path = document.getElementById('devFbPath')?.value || 'classes';
            const output = document.getElementById('devFbOutput');
            try {
                const snap = await db.ref(path).once('value');
                const data = snap.val();
                output.textContent = JSON.stringify(data, null, 2) || '(데이터 없음)';
            } catch (e) {
                output.textContent = '❌ 오류: ' + e.message;
            }
        },

        // Firebase 쓰기
        fbWrite: async function () {
            const path = document.getElementById('devFbPath')?.value;
            const dataStr = document.getElementById('devFbData')?.value;
            const output = document.getElementById('devFbOutput');
            try {
                const data = JSON.parse(dataStr);
                await db.ref(path).update(data);
                output.textContent = '✅ 저장 완료: ' + path;
            } catch (e) {
                output.textContent = '❌ 오류: ' + e.message;
            }
        },

        // Firebase 삭제
        fbDelete: async function () {
            const path = document.getElementById('devFbPath')?.value;
            const output = document.getElementById('devFbOutput');
            if (!confirm(`⚠️ "${path}" 경로의 모든 데이터를 삭제합니까?`)) return;
            try {
                await db.ref(path).remove();
                output.textContent = '🗑️ 삭제 완료: ' + path;
            } catch (e) {
                output.textContent = '❌ 오류: ' + e.message;
            }
        },

        // Supabase 읽기
        sbRead: async function () {
            const table = document.getElementById('devSbTable')?.value || 'users';
            const output = document.getElementById('devSbOutput');
            try {
                const { data, error } = await supabaseClient.from(table).select('*').limit(50);
                if (error) throw error;
                output.textContent = JSON.stringify(data, null, 2);
            } catch (e) {
                output.textContent = '❌ 오류: ' + e.message;
            }
        },

        // Supabase 조건 검색
        sbQuery: async function () {
            const table = document.getElementById('devSbTable')?.value;
            const col = document.getElementById('devSbColumn')?.value;
            const val = document.getElementById('devSbValue')?.value;
            const output = document.getElementById('devSbOutput');
            try {
                const { data, error } = await supabaseClient.from(table).select('*').ilike(col, `%${val}%`).limit(20);
                if (error) throw error;
                output.textContent = JSON.stringify(data, null, 2);
            } catch (e) {
                output.textContent = '❌ 오류: ' + e.message;
            }
        },

        // 도구들
        pageInfo: function () {
            const output = document.getElementById('devToolOutput');
            output.textContent = JSON.stringify({
                url: location.href,
                title: document.title,
                scripts: Array.from(document.scripts).map(s => s.src || '(inline)'),
                stylesheets: Array.from(document.styleSheets).map(s => s.href || '(inline)')
            }, null, 2);
        },

        listAllClasses: async function () {
            const output = document.getElementById('devToolOutput');
            try {
                const snap = await db.ref('classes').once('value');
                const data = snap.val() || {};
                const list = Object.entries(data).map(([id, c]) => `${id}: ${c.title} (${c.category})`);
                output.textContent = `📚 클래스 ${list.length}개:\n\n` + list.join('\n');
            } catch (e) { output.textContent = '❌ ' + e.message; }
        },

        listAllUsers: async function () {
            const output = document.getElementById('devToolOutput');
            try {
                const { data } = await supabaseClient.from('users').select('id, name, email, user_type');
                output.textContent = `👥 사용자 ${data.length}명:\n\n` + data.map(u => `${u.name} (${u.email}) - ${u.user_type || 'user'}`).join('\n');
            } catch (e) { output.textContent = '❌ ' + e.message; }
        },

        clearChatHistory: async function () {
            const classId = prompt('채팅을 초기화할 클래스 ID를 입력하세요:');
            if (!classId) return;
            if (!confirm(`⚠️ "${classId}" 채팅을 모두 삭제합니까?`)) return;
            try {
                await db.ref(`chats/${classId}`).remove();
                document.getElementById('devToolOutput').textContent = '✅ 채팅 초기화 완료: ' + classId;
            } catch (e) {
                document.getElementById('devToolOutput').textContent = '❌ ' + e.message;
            }
        },

        forceInstructor: function () {
            window.isInstructor = true;
            window.__BSQ_DEV_MODE__ = true;
            // 편집 탭 표시
            document.querySelectorAll('.view-tab-edit, [data-tab="edit"]').forEach(el => {
                el.style.display = '';
            });
            const output = document.getElementById('devToolOutput');
            if (output) output.textContent = '✅ 강사 권한 활성화됨. 편집 탭이 표시됩니다.';
            showDevToast('👨‍🏫 강사 권한', '강사 권한이 강제 부여되었습니다.');
        },

        reloadPage: function () {
            location.reload();
        },

        deactivate: function () {
            isDevMode = false;
            window.__BSQ_DEV_MODE__ = false;
            sessionStorage.removeItem(STORAGE_KEY);
            if (devPanel) {
                devPanel.remove();
                devPanel = null;
            }
            showDevToast('🔒 개발자 모드 해제', '일반 모드로 전환되었습니다.');
            setTimeout(() => location.reload(), 1000);
        },

        // 외부 접근용
        isActive: () => isDevMode,
        getDb: () => db,
        getSupabase: () => supabaseClient
    };

    // ---- 토스트 알림 ----
    function showDevToast(title, msg) {
        const toast = document.createElement('div');
        toast.className = 'dev-toast';
        toast.innerHTML = `<h4>${title}</h4><span>${msg}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // DOM 로드 후 초기화
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
