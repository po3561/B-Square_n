// admin_core.js - Core logic for Admin Dashboard (Auth, Navigation, Utilities)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🛠️ Admin Dashboard Core Initializing...");

    // 1. Authentication & Role Guard
    await verifyAdminAccess();

    // 2. Sidebar Navigation Setup
    setupSidebarNavigation();

    // 3. Global Refresh Button
    document.getElementById('btnAdminRefresh')?.addEventListener('click', () => {
        location.reload();
    });
});

/**
 * Ensures only `promise1` or explicit admins can access this page.
 * Boots unauthorized users back to the index page immediately.
 */
async function verifyAdminAccess() {
    const adminUserName = document.getElementById('adminUserName');

    // ★ bsq_server.js 의 전역 초기화 완전 대기
    if (window.BSQ && window.BSQ.ready) {
        await window.BSQ.ready;
    } else {
        await new Promise(resolve => setTimeout(resolve, 800));
    }

    let isAuthorized = false;
    let userName = "총괄 운영자";

    // 1. 전역 DEV_MODE 플래그 체크 (가장 확실한 방법)
    if (window.__BSQ_DEV_MODE__) {
        isAuthorized = true;
    }

    // 2. Firebase Auth 하드코딩 폴백
    if (!isAuthorized) {
        const fbUser = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
        if (fbUser && (fbUser.email === 'promise9907@naver.com' || fbUser.email === 'ej210651392@naver.com' || fbUser.email === 'po3561@naver.com')) {
            isAuthorized = true;
            userName = fbUser.displayName || fbUser.email.split('@')[0];
        }
    }

    // 3. Supabase Auth 
    if (!isAuthorized && window.supabaseClient) {
        try {
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session && session.user) {
                const userEmail = session.user.email || '';
                const { data: profile } = await window.supabaseClient.from('users').select('name, username').eq('id', session.user.id).maybeSingle();
                const currentUsername = profile?.username || '';
                
                if (userEmail === 'promise9907@naver.com' || userEmail === 'ej210651392@naver.com' || userEmail === 'po3561@naver.com' || userEmail.includes('promise1') || currentUsername === 'promise1') {
                    isAuthorized = true;
                    if (profile && profile.name) userName = profile.name;
                }
            }
        } catch (err) {
            console.error("Admin Supabase Check Failed", err);
        }
    }

    if (!isAuthorized) {
        console.warn("🚫 UNAUTHORIZED ACCESS ATTEMPT TO ADMIN DASHBOARD");
        alert("접근 권한이 없습니다. 관리자 계정으로 로그인해주세요.");
        window.location.replace('../index.html');
        return;
    }

    console.log("✅ Admin Access Granted for:", userName);
    if (adminUserName) adminUserName.textContent = userName;
}

/**
 * Handles Tab Switching and Collapsible Sidebar Groups
 */
function setupSidebarNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    const tabContents = document.querySelectorAll('.admin-tab-content');
    const currentTabTitle = document.getElementById('currentTabTitle');
    const groupBtns = document.querySelectorAll('.nav-group-btn');

    // Collapsible Groups
    groupBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const expanded = btn.getAttribute('aria-expanded') === 'true';
            btn.setAttribute('aria-expanded', !expanded);
            const subNav = btn.nextElementSibling;
            if (subNav) {
                subNav.style.display = expanded ? 'none' : 'block';
            }
        });
    });

    // Tab Navigation SPA Logic
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTabId = item.getAttribute('data-tab');
            if (!targetTabId) return;

            // Update Active State on Sidebar
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // Update Header Title
            if (currentTabTitle) {
                // If it's a sub-item, grab parent group name + item name
                const groupParent = item.closest('.nav-group');
                let titleText = item.textContent.trim();
                if (groupParent && item.textContent.trim() !== '대시보드') {
                   const groupTitle = groupParent.querySelector('.nav-group-btn span').textContent.replace('▼','').trim();
                   titleText = `${groupTitle} > ${item.textContent.trim()}`;
                }
                currentTabTitle.textContent = titleText;
            }

            // Switch Content Section
            tabContents.forEach(tab => tab.classList.remove('active'));
            const targetTab = document.getElementById(targetTabId);
            if (targetTab) {
                targetTab.classList.add('active');
            }

            // Trigger Custom Event for Modules to Catch (e.g. refresh data when tab opened)
            window.dispatchEvent(new CustomEvent('adminTabChanged', { detail: { tabId: targetTabId } }));
        });
    });
}
