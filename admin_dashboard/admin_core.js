// admin_core.js - core logic for the admin dashboard

const DASHBOARD_ROLE_ORDER = {
  user: 0,
  instructor: 1,
  operator: 2,
  admin: 3,
  super_admin: 3,
};

function normalizeDashboardRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (!value) return 'user';
  if (['super-admin', 'superadmin', 'root', 'owner'].includes(value)) return 'super_admin';
  if (value in DASHBOARD_ROLE_ORDER) return value;
  return 'user';
}

function getDashboardRoleRank(role) {
  return DASHBOARD_ROLE_ORDER[normalizeDashboardRole(role)] ?? 0;
}

function canEnterDashboard(role) {
  return getDashboardRoleRank(role) >= getDashboardRoleRank('operator');
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Admin Dashboard] Core initializing...');

  await verifyAdminAccess();
  setupSidebarNavigation();
  setupMobileSidebar();
});

async function verifyAdminAccess() {
  const adminUserNameLabel = document.getElementById('adminUserName');

  if (window.BSQ?.ready) {
    await window.BSQ.ready;
  } else {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const user = window.BSQ?.userProfile;
  const isLoggedIn = window.BSQ?.isLoggedIn && !!user;
  const role = normalizeDashboardRole(user?.role);

  if (!isLoggedIn || !canEnterDashboard(role)) {
    alert('운영자 권한이 필요합니다. 운영자 계정으로 로그인해주세요.');
    const loginUrl = '../login/login.html?redirect=' + encodeURIComponent(window.location.href);
    window.location.replace(loginUrl);
    return;
  }

  if (adminUserNameLabel) {
    adminUserNameLabel.textContent = user.name || user.username || 'Admin';
  }

  document.body.dataset.adminRole = role;
  applyRoleVisibility(role);
}

function applyRoleVisibility(role) {
  const rank = getDashboardRoleRank(role);
  if (rank >= getDashboardRoleRank('admin')) return;

  const restrictedTabs = [
    'tabOperators',
    'tabBoards',
    'tabClassBoards',
    'tabMenuSettings',
    'tabHomepage',
    'tabRecommend',
    'tabFooter',
    'tabPages',
    'tabSEO',
    'tabForms',
    'tabMarketingTools',
    'tabCampaigns',
    'tabFinancial',
    'tabSettlementInfo',
    'tabSettlementHistory',
    'tabTax',
  ];

  restrictedTabs.forEach((tabId) => {
    const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (navItem) navItem.style.display = 'none';
    const section = document.getElementById(tabId);
    if (section) section.style.display = 'none';
  });
}

function setupSidebarNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const getTabContents = () => document.querySelectorAll('.admin-tab-content');
  const currentTabTitle = document.getElementById('currentTabTitle');
  const groupBtns = document.querySelectorAll('.nav-group-btn');

  groupBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      const subNav = btn.nextElementSibling;
      if (subNav) subNav.style.display = expanded ? 'none' : 'block';
    });
  });

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTabId = item.getAttribute('data-tab');
      if (!targetTabId || item.style.display === 'none') return;

      navItems.forEach((nav) => nav.classList.remove('active'));
      item.classList.add('active');

      if (currentTabTitle) {
        const groupParent = item.closest('.nav-group');
        let titleText = item.textContent.trim();
        if (groupParent) {
          const groupBtn = groupParent.querySelector('.nav-group-btn span');
          const groupTitle = groupBtn ? groupBtn.textContent.replace(/\s+/g, ' ').trim() : '';
          if (groupTitle && titleText !== groupTitle) {
            titleText = `${groupTitle} > ${titleText}`;
          }
        }
        currentTabTitle.textContent = titleText;
      }

      getTabContents().forEach((tab) => tab.classList.remove('active'));
      let targetTab = document.getElementById(targetTabId);
      if (!targetTab) {
        const wrapper = document.querySelector('.admin-content-wrapper');
        if (wrapper) {
          targetTab = document.createElement('section');
          targetTab.id = targetTabId;
          targetTab.className = 'admin-tab-content';
          targetTab.innerHTML = `
            <div class="admin-card" style="text-align:center; padding:5rem 2rem;">
              <h2 style="color:var(--admin-text-muted); margin-bottom:1rem;">준비 중인 탭입니다.</h2>
              <p style="color:#777;">해당 기능은 현재 개발 중입니다.</p>
            </div>
          `;
          wrapper.appendChild(targetTab);
        }
      }
      if (targetTab) targetTab.classList.add('active');

      window.dispatchEvent(new CustomEvent('adminTabChanged', { detail: { tabId: targetTabId } }));

      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('adminSidebar');
        const overlay = document.getElementById('adminSidebarOverlay');
        sidebar?.classList.remove('open');
        overlay?.classList.remove('active');
      }
    });
  });
}

function setupMobileSidebar() {
  const hamburgerBtn = document.getElementById('adminHamburgerBtn');
  const sidebar = document.getElementById('adminSidebar');
  const overlay = document.getElementById('adminSidebarOverlay');

  if (!hamburgerBtn || !sidebar) return;

  function openSidebar() {
    sidebar.classList.add('open');
    overlay?.classList.add('active');
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    overlay?.classList.remove('active');
  }

  hamburgerBtn.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });

  overlay?.addEventListener('click', closeSidebar);
  console.log('[Admin Dashboard] Mobile sidebar toggle initialized');
}
