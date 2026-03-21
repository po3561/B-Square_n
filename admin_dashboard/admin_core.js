// admin_core.js - Core logic for Admin Dashboard (Auth, Navigation, Utilities)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🛠️ Admin Dashboard Core Initializing...");

    // 1. Authentication & Role Guard
    await verifyAdminAccess();

    // 2. Sidebar Navigation Setup
    setupSidebarNavigation();

    // 3. Mobile Sidebar Toggle (I3)
    setupMobileSidebar();

    // 4. Global Refresh Button
    document.getElementById('btnAdminRefresh')?.addEventListener('click', () => {
        location.reload();
    });
});

/**
 * Ensures only `promise1` or explicit admins can access this page.
 * Boots unauthorized users back to the index page immediately.
 */
async function verifyAdminAccess() {
    const adminUserNameLabel = document.getElementById('adminUserName');

    // ★ bsq_server.js 의 전역 초기화 완전 대기
    if (window.BSQ && window.BSQ.ready) {
        await window.BSQ.ready;
    } else {
        // Fallback wait
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const isLoggedIn = window.BSQ?.isLoggedIn;
    const user = window.BSQ?.userProfile;

    let isAuthorized = false;
    let displayName = "운영자";

    if (isLoggedIn && user) {
        // 관리자 권한 체크 (role 또는 하드코딩된 관리자 이메일/ID)
        const isAdminRole = user.role === 'admin' || user.user_type === 'admin';
        const isDevUser = false; // 하드코딩된 관리자 계정 제거됨

        if (isAdminRole || isDevUser) {
            isAuthorized = true;
            displayName = user.name || user.username || "운영자";
            window.__BSQ_DEV_MODE__ = true; // 관리자 모드 플래그 활성화
            console.log("[Admin Core] Admin access granted for:", displayName);
        }
    }

    if (!isAuthorized) {
        console.warn("🚫 UNAUTHORIZED ACCESS ATTEMPT TO ADMIN DASHBOARD");
        alert("관리자 권한이 없습니다. 관리자 계정으로 로그인해주세요.");
        // 로그인 페이지로 리다이렉트 (현재 위치를 redirect 파라미터로 전달)
        const loginUrl = '../login/login.html?redirect=' + encodeURIComponent(window.location.href);
        window.location.replace(loginUrl);
        return;
    }

    if (adminUserNameLabel) {
        adminUserNameLabel.textContent = displayName;
    }
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
                    const groupTitle = groupParent.querySelector('.nav-group-btn span').textContent.replace('▼', '').trim();
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

            // 모바일에서 탭 전환 시 사이드바 자동으로 닫기
            if (window.innerWidth <= 768) {
                const sidebar = document.getElementById('adminSidebar');
                const overlay = document.getElementById('adminSidebarOverlay');
                if (sidebar) sidebar.classList.remove('open');
                if (overlay) overlay.classList.remove('active');
            }
        });
    });
}

/**
 * Mobile Sidebar Toggle (I3)
 * 768px 이하에서 햄버거 버튼으로 사이드바 열고 닫기
 */
function setupMobileSidebar() {
    const hamburgerBtn = document.getElementById('adminHamburgerBtn');
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');

    if (!hamburgerBtn || !sidebar) return;

    function openSidebar() {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    hamburgerBtn.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    });

    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    console.log("✅ Mobile sidebar toggle initialized");
}
