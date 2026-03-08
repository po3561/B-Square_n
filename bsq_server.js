// bsq_server.js - B-Square 중앙 서버 연결 모듈
// 모든 페이지에서 Firebase + Supabase를 한 번에 초기화하고, 인증을 보장합니다.
// 사용법: window.BSQ.db, window.BSQ.supabase, await window.BSQ.ready
(function () {
    'use strict';

    // ---- 설정 ----
    const FIREBASE_CONFIG = {
        apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
        authDomain: "b-square-39b11.firebaseapp.com",
        databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
        projectId: "b-square-39b11",
        storageBucket: "b-square-39b11.firebasestorage.app",
        messagingSenderId: "1012056920961",
        appId: "1:1012056920961:web:8342bfdf123b78f6a38e80"
    };

    const SUPABASE_URL = "https://tqyckxgtavviatkfsymb.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw";

    // ---- 상태 ----
    let db = null;
    let supabaseClient = null;
    let firebaseAuthUser = null;
    let _readyResolve = null;
    const readyPromise = new Promise(resolve => { _readyResolve = resolve; });

    // ---- Firebase 초기화 ----
    function initFirebase() {
        if (typeof firebase === 'undefined') {
            console.warn('[BSQ Server] Firebase SDK 미로드');
            return Promise.resolve(null);
        }
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        db = firebase.database();

        // 익명 인증 — write 권한(auth != null) 확보
        return new Promise((resolve) => {
            if (typeof firebase.auth !== 'function') {
                console.warn('[BSQ Server] Firebase Auth SDK 미로드');
                resolve(null);
                return;
            }
            const auth = firebase.auth();
            // 이미 로그인 되어있으면 바로 resolve
            const unsubscribe = auth.onAuthStateChanged(user => {
                unsubscribe();
                if (user) {
                    firebaseAuthUser = user;
                    console.log('[BSQ Server] Firebase Auth 확인:', user.uid, user.isAnonymous ? '(익명)' : '');
                    resolve(user);
                } else {
                    // 익명 로그인 시도
                    auth.signInAnonymously()
                        .then(cred => {
                            firebaseAuthUser = cred.user;
                            console.log('[BSQ Server] ✅ Firebase 익명 로그인 성공:', cred.user.uid);
                            resolve(cred.user);
                        })
                        .catch(err => {
                            console.error('[BSQ Server] ❌ Firebase 익명 로그인 실패:', err.message);
                            console.error('[BSQ Server] → Firebase Console에서 Authentication → Sign-in method → 익명(Anonymous) 활성화 필요');
                            resolve(null);
                        });
                }
            });
        });
    }

    // ---- Supabase 초기화 ----
    function initSupabase() {
        if (typeof window.supabase === 'undefined') {
            console.warn('[BSQ Server] Supabase SDK 미로드');
            return null;
        }
        if (!supabaseClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        // 전역 호환성 (header.js 등에서 window.supabaseClient 사용)
        window.supabaseClient = supabaseClient;
        return supabaseClient;
    }

    // ---- 초기화 실행 ----
    async function init() {
        initSupabase();
        await initFirebase();

        // 전역 호환성
        if (db) window.firebaseDB = db;

        // ---- 개발자(총괄) 권한 자동 체크 ----
        if (supabaseClient) {
            const { data: sessionData } = await supabaseClient.auth.getSession();
            const session = sessionData?.session;
            if (session && session.user) {
                const userEmail = session.user.email || '';
                const userId = session.user.id;
                
                // profile 정보 (username 등) 조회
                const { data: profile } = await supabaseClient.from('users').select('username').eq('id', userId).maybeSingle();
                const username = profile?.username || '';

                // promise1 계정이거나 특정 이메일/UID인 경우 총괄 개발자 모드 켬
                if (userEmail.includes('promise1') || userEmail === 'po3561@naver.com' || username === 'promise1') {
                    window.__BSQ_DEV_MODE__ = true;
                    console.log('💎 [BSQ Server] 총괄 개발자(promise1) 세션 감지: DEV_MODE 활성화');
                    window.dispatchEvent(new Event('bsq_dev_mode_activated'));
                }
            }
        }

        _readyResolve({
            db: db,
            supabase: supabaseClient,
            firebaseUser: firebaseAuthUser
        });

        console.log('[BSQ Server] ✅ 서버 연결 초기화 완료', {
            firebase: !!db,
            supabase: !!supabaseClient,
            auth: !!firebaseAuthUser,
            devMode: !!window.__BSQ_DEV_MODE__
        });

        // 글로벌 디자인 세팅 적용
        applySiteSettings(db);

        // 방문자 트래킹 시작
        trackVisitor(db);
    }

    // ==========================================
    // 6. Global Site Settings (디자인 동적 반영) & Visitors
    // ==========================================
    function trackVisitor(database) {
        if (!database) return;
        try {
            // 1. 일일 방문수 트래킹 (단순 카운터)
            const today = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"
            const visitorsRef = database.ref(`site_settings/visitors/${today}`);
            
            visitorsRef.transaction((current_value) => {
                return (current_value || 0) + 1;
            }).catch(e => console.error("Visitor tracking failed", e));

            // 2. 실시간 접속자 트래킹 (Presence)
            const myConnectionsRef = database.ref(`site_settings/presence`);
            const connectedRef = database.ref('.info/connected');
            
            connectedRef.on('value', (snap) => {
                if (snap.val() === true) {
                    const con = myConnectionsRef.push();
                    con.onDisconnect().remove();
                    con.set(true);
                }
            });
        } catch (e) {
            console.error(e);
        }
    }

    function applySiteSettings(database) {
        if (!database) return;
        database.ref('site_settings').once('value').then(snap => {
            const settings = snap.val();
            if (!settings) return;

            // 1. Title 업데이트
            if (settings.siteName) {
                document.title = settings.siteName + (document.title.includes('|') ? document.title.substring(document.title.indexOf(' |')) : ' | B-Square');
            }

            // 2. Favicon 업데이트
            if (settings.faviconURL) {
                let link = document.querySelector("link[rel~='icon']");
                if (!link) {
                    link = document.createElement('link');
                    link.rel = 'icon';
                    document.getElementsByTagName('head')[0].appendChild(link);
                }
                link.href = settings.faviconURL;
            }

            // 3. Footer 정보 업데이트
            const footerCompanyElems = document.querySelectorAll('.footer-company-name, footer p strong');
            const footerInfoElems = document.querySelectorAll('.footer-info-text, footer .info-text');
            
            if (settings.companyName && footerCompanyElems.length > 0) {
                footerCompanyElems.forEach(el => el.textContent = settings.companyName);
            }

            if (footerInfoElems.length > 0) {
                const parts = [];
                if (settings.ceoName) parts.push(`대표: ${settings.ceoName}`);
                if (settings.bizNum) parts.push(`사업자등록번호: ${settings.bizNum}`);
                if (settings.mailOrderNum) parts.push(`통신판매업신고: ${settings.mailOrderNum}`);
                if (settings.csPhone) parts.push(`고객센터: ${settings.csPhone}`);
                if (settings.csEmail) parts.push(`이메일: ${settings.csEmail}`);
                
                let fullText = parts.join(' | ');
                if (settings.address) {
                    fullText += `\n주소: ${settings.address}`;
                }
                
                if (fullText) {
                    footerInfoElems.forEach(el => el.innerText = fullText);
                }
            }

            // 4. SEO 메타 속성 (동적 생성)
            if (settings.seo) {
                const seo = settings.seo;
                if (seo.title) document.title = seo.title;
                
                const injectMeta = (name, content, isProperty = false) => {
                    if(!content) return;
                    let attr = isProperty ? 'property' : 'name';
                    let meta = document.querySelector(`meta[${attr}="${name}"]`);
                    if(!meta) {
                        meta = document.createElement('meta');
                        meta.setAttribute(attr, name);
                        document.head.appendChild(meta);
                    }
                    meta.setAttribute('content', content);
                };

                injectMeta('description', seo.description);
                injectMeta('keywords', seo.keywords);
                injectMeta('og:title', seo.title, true);
                injectMeta('og:description', seo.description, true);
                if (seo.image) injectMeta('og:image', seo.image, true);
            }
        }).catch(err => {
            console.warn('⚠️ [BSQ Server] 사이트 설정 로드 실패:', err);
        });
    }

    // ---- 전역 API ----
    window.BSQ = {
        // Promise: await window.BSQ.ready 로 초기화 완료 대기
        ready: readyPromise,

        // 즉시 접근 (초기화 이후에만 유효)
        get db() { return db; },
        get supabase() { return supabaseClient; },
        get firebaseUser() { return firebaseAuthUser; },

        // Firebase write 가능 여부 체크
        get canWrite() { return !!firebaseAuthUser; },

        // 안전한 Firebase write (auth 보장 후 실행)
        async safeWrite(refPath, data, method = 'update') {
            await readyPromise;
            if (!db) throw new Error('Firebase not initialized');
            if (!firebaseAuthUser) {
                console.warn('[BSQ Server] Auth 없이 write 시도 — 익명 로그인 재시도...');
                try {
                    const cred = await firebase.auth().signInAnonymously();
                    firebaseAuthUser = cred.user;
                } catch (e) {
                    throw new Error('Firebase 인증 실패: ' + e.message);
                }
            }
            const ref = db.ref(refPath);
            switch (method) {
                case 'set': return ref.set(data);
                case 'push': return ref.push(data);
                case 'update': return ref.update(data);
                case 'remove': return ref.remove();
                default: return ref.update(data);
            }
        },

        // Supabase 쿼리 헬퍼
        async query(table) {
            await readyPromise;
            if (!supabaseClient) throw new Error('Supabase not initialized');
            return supabaseClient.from(table);
        }
    };

    // ---- 즉시 실행 ----
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
