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

        _readyResolve({
            db: db,
            supabase: supabaseClient,
            firebaseUser: firebaseAuthUser
        });

        console.log('[BSQ Server] ✅ 서버 연결 초기화 완료', {
            firebase: !!db,
            supabase: !!supabaseClient,
            auth: !!firebaseAuthUser
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
