// main.js - homepage data loader (D1 API)
document.addEventListener('DOMContentLoaded', async () => {
  await window.BSQ.ready;
  const currentCategory = new URLSearchParams(window.location.search).get('cat') || 'all';

  await renderHomepageCategories(currentCategory);
  initMainPage();

  window.addEventListener('bsq_sync', (e) => {
    console.log('[BSQ Sync] Data refresh requested:', e.detail);
    initMainPage();
    initBanners();
    renderHomepageCategories(new URLSearchParams(window.location.search).get('cat') || 'all');
  });

  initBanners();

  document.querySelector('.category-grid')?.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-cat]');
    if (!link) return;
    event.preventDefault();
    const categoryName = String(link.dataset.cat || 'all');
    const allGrid = document.getElementById('allClassGrid');
    document.querySelectorAll('.category-grid li').forEach((li) => li.classList.remove('active'));
    link.parentElement.classList.add('active');
    if (categoryName === 'all') {
      if (allGrid) renderClassCards(globalAllClasses, allGrid);
      document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    filterAllClassesByCategory(categoryName);
    document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
  });

  initDrawer();
});

let globalAllClasses = [];
const FALLBACK_HOME_CATEGORIES = [
  { name: '소모임/동아리', emoji: '👥' },
  { name: '맛있는 클래스', emoji: '🍽️' },
  { name: '운동 클래스', emoji: '🏋️' },
  { name: '디자인', emoji: '🎨' },
  { name: '생산성', emoji: '⚡' },
  { name: '스포츠', emoji: '🏅' },
  { name: '디지털 드로잉', emoji: '✏️' },
  { name: '성공 마인드', emoji: '🧠' },
  { name: '음악', emoji: '🎵' },
  { name: '요리', emoji: '🍳' },
  { name: '베이킹', emoji: '🧁' },
  { name: '사진', emoji: '📷' },
  { name: '영상', emoji: '🎬' },
  { name: '공예', emoji: '🧵' },
  { name: '여행', emoji: '🧭' },
];

async function renderHomepageCategories(currentCategory = 'all') {
  const nav = document.querySelector('.category-grid');
  if (!nav) return;

  let categories = FALLBACK_HOME_CATEGORIES;
  try {
    const res = await window.BSQ.api(`/api/class-categories?t=${Date.now()}`);
    if (res.success && Array.isArray(res.data) && res.data.length > 0) {
      categories = res.data.map((item) => ({
        name: String(item.name || '').trim(),
        emoji: String(item.emoji || '✨').trim() || '✨',
      })).filter((item) => item.name);
    }
  } catch (error) {
    console.warn('[Main] category load failed, fallback used:', error);
  }

  nav.innerHTML = `
    <ul>
      <li class="${currentCategory === 'all' ? 'active' : ''}"><a href="#" data-cat="all"><span class="icon">🌐</span>전체</a></li>
      ${categories.map((item) => `<li class="${currentCategory === item.name ? 'active' : ''}"><a href="#" data-cat="${escapeHtml(item.name)}"><span class="icon">${escapeHtml(item.emoji || '✨')}</span>${escapeHtml(item.name)}</a></li>`).join('')}
    </ul>
  `;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function setVisible(el, visible) {
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const bannerTimers = {
  hero: null,
  bottom: null,
};

function clearBannerTimer(key) {
  if (bannerTimers[key]) {
    clearInterval(bannerTimers[key]);
    bannerTimers[key] = null;
  }
}

function buildBannerLinkMarkup(banner, className, innerHTML, targetBlank = true) {
  const link = (banner.linkUrl || '').trim();
  if (!link) {
    return `<div class="${className}">${innerHTML}</div>`;
  }
  return `<a class="${className}" href="${escapeHtml(link)}"${targetBlank ? ' target="_blank" rel="noopener noreferrer"' : ''}>${innerHTML}</a>`;
}

function renderHeroBanner(container, banners) {
  clearBannerTimer('hero');
  if (!container) return;

  if (!banners.length) {
    container.innerHTML = `
      <div class="banner-hero-empty" style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.5rem;background:linear-gradient(135deg,#151515 0%,#070707 100%);border-radius:24px;color:#fff;">
        <h2 style="margin:0;font-size:clamp(2rem, 4vw, 3.5rem);color:rgba(255,255,255,0.18);letter-spacing:0.28em;font-weight:900;">광고</h2>
        <p style="margin:0;color:rgba(255,255,255,0.55);font-size:0.95rem;">메인 홈페이지 배너를 등록해 주세요.</p>
      </div>
    `;
    return;
  }

  const slides = banners.map((banner, index) => {
    const inner = `
      <img src="${escapeHtml(banner.imgUrl || '')}" alt="${escapeHtml(banner.title || `배너 ${index + 1}`)}"
        style="width:100%;height:100%;object-fit:contain;display:block;background:#0b0b0b;">
    `;
    return buildBannerLinkMarkup(banner, `banner-hero-slide${index === 0 ? ' is-active' : ''}`, inner);
  }).join('');

  const dots = banners.length > 1
    ? `<div class="banner-hero-dots" style="display:flex;gap:0.5rem;align-items:center;">
        ${banners.map((_, index) => `<button type="button" class="banner-dot${index === 0 ? ' active' : ''}" data-banner-dot="${index}" aria-label="배너 ${index + 1}" style="width:10px;height:10px;border-radius:999px;border:none;background:${index === 0 ? '#fff' : 'rgba(255,255,255,0.35)'};cursor:pointer;padding:0;"></button>`).join('')}
      </div>`
    : '';

  container.innerHTML = `
    <div class="banner-hero-shell" style="position:relative;width:100%;height:100%;min-height:280px;overflow:hidden;border-radius:24px;background:linear-gradient(135deg,#111 0%,#050505 100%);box-shadow:0 20px 40px rgba(0,0,0,0.4);">
      ${slides}
      ${banners.length > 1 ? `
        <div class="banner-hero-controls" style="position:absolute;left:1rem;right:1rem;bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;pointer-events:none;z-index:5;">
          <button type="button" class="banner-nav banner-nav-prev" aria-label="이전 배너" style="pointer-events:auto;">‹</button>
          ${dots}
          <button type="button" class="banner-nav banner-nav-next" aria-label="다음 배너" style="pointer-events:auto;">›</button>
        </div>
      ` : ''}
    </div>
  `;

  if (banners.length <= 1) return;

  const slideNodes = Array.from(container.querySelectorAll('.banner-hero-slide'));
  const dotNodes = Array.from(container.querySelectorAll('[data-banner-dot]'));
  let current = 0;

  const applyState = (index) => {
    current = (index + banners.length) % banners.length;
    slideNodes.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.style.opacity = active ? '1' : '0';
      slide.style.transform = `translate3d(0, 0, 0) scale(${active ? '1' : '0.98'})`;
      slide.style.zIndex = active ? '2' : '1';
    });
    dotNodes.forEach((dot, dotIndex) => {
      dot.classList.toggle('active', dotIndex === current);
      dot.style.background = dotIndex === current ? '#fff' : 'rgba(255,255,255,0.35)';
    });
  };

  const next = () => applyState(current + 1);
  const prev = () => applyState(current - 1);

  container.querySelector('.banner-nav-prev')?.addEventListener('click', prev);
  container.querySelector('.banner-nav-next')?.addEventListener('click', next);
  dotNodes.forEach((dot) => {
    dot.addEventListener('click', () => applyState(Number(dot.dataset.bannerDot || 0)));
  });

  applyState(0);
  bannerTimers.hero = window.setInterval(next, 6000);
}

function renderBottomBanner(container, banners) {
  clearBannerTimer('bottom');
  if (!container) return;

  if (!banners.length) {
    container.innerHTML = `
      <div class="bottom-banner-empty" style="min-height:260px;border-radius:28px;background:linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03));display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.55);letter-spacing:0.2em;font-weight:700;">
        배너
      </div>
    `;
    return;
  }

  const slides = banners.map((banner, index) => {
    const inner = `
      <img src="${escapeHtml(banner.imgUrl || '')}" alt="${escapeHtml(banner.title || `하단 배너 ${index + 1}`)}"
        style="width:100%;height:100%;object-fit:contain;display:block;background:#111;">
    `;
    return buildBannerLinkMarkup(banner, 'banner-bottom-slide', inner);
  }).join('');

  container.innerHTML = `
    <div class="banner-bottom-shell" style="position:relative;width:100%;min-height:280px;padding:0 4.75rem;">
      <div class="banner-bottom-stage" style="position:relative;width:100%;min-height:280px;overflow:hidden;">
        ${slides}
      </div>
      ${banners.length > 1 ? `
        <button type="button" class="banner-nav banner-nav-prev banner-bottom-prev" aria-label="이전 배너" style="position:absolute;left:1rem;top:50%;transform:translateY(-50%);">‹</button>
        <button type="button" class="banner-nav banner-nav-next banner-bottom-next" aria-label="다음 배너" style="position:absolute;right:1rem;top:50%;transform:translateY(-50%);">›</button>
      ` : ''}
    </div>
  `;

  const slideNodes = Array.from(container.querySelectorAll('.banner-bottom-slide'));
  if (slideNodes.length === 0) return;

  let current = 0;
  const applyState = (index) => {
    current = (index + banners.length) % banners.length;
    slideNodes.forEach((slide, slideIndex) => {
      let offset = slideIndex - current;
      if (offset > banners.length / 2) offset -= banners.length;
      if (offset < -banners.length / 2) offset += banners.length;

      const isCenter = offset === 0;
      const isSide = Math.abs(offset) === 1;
      const isVisible = isCenter || isSide;

      let translateX = '0%';
      let scale = isCenter ? '1' : '0.86';
      let opacity = isCenter ? '1' : '0.32';
      let blur = isCenter ? '0' : '1px';
      let zIndex = isCenter ? '3' : '2';

      if (offset === -1) translateX = '-62%';
      if (offset === 1) translateX = '62%';
      if (Math.abs(offset) > 1) {
        translateX = offset < 0 ? '-115%' : '115%';
        opacity = '0';
        scale = '0.75';
        blur = '3px';
        zIndex = '1';
      }

      slide.style.opacity = opacity;
      slide.style.transform = `translate3d(-50%, -50%, 0) translateX(${translateX}) scale(${scale})`;
      slide.style.filter = `blur(${blur})`;
      slide.style.zIndex = zIndex;
      slide.style.pointerEvents = isVisible ? 'auto' : 'none';
    });
  };

  const next = () => applyState(current + 1);
  const prev = () => applyState(current - 1);

  container.querySelector('.banner-bottom-prev')?.addEventListener('click', prev);
  container.querySelector('.banner-bottom-next')?.addEventListener('click', next);

  applyState(0);
  if (banners.length > 1) {
    bannerTimers.bottom = window.setInterval(next, 6500);
  }
}

async function initMainPage() {
  console.log('[Main] Initializing page from D1...');
  const popularGrid = document.getElementById('popularClassGrid');
  const allGrid = document.getElementById('allClassGrid');
  const recommendContainer = document.getElementById('dynamicRecommendContainer');
  const popularSection = document.getElementById('popularSection');
  const recommendSection = document.getElementById('recommendSection');

  try {
    const allRes = await window.BSQ.api(`/api/classes?limit=100&t=${Date.now()}`);
    if (allRes.success) {
      const list = safeArray(allRes.data?.classes ?? allRes.data);
      globalAllClasses = list;
      if (allGrid) renderClassCards(globalAllClasses, allGrid);
    } else if (allGrid) {
      allGrid.innerHTML = '<p class="empty-state">Failed to load classes.</p>';
    }

    const recRes = await window.BSQ.api(`/api/recommendations?t=${Date.now()}`);
    if (recRes.success) {
      const folders = safeArray(recRes.data?.folders ?? recRes.data);
      console.log('[Main] Recommendation folders received:', folders);

      const popularFolder = folders.find((f) => f.type === 'popular');
      const popularClasses = safeArray(popularFolder?.classes);
      if (popularClasses.length > 0) {
        const popularTitle = document.getElementById('popularGroupTitle');
        if (popularTitle) popularTitle.textContent = popularFolder.title || 'Popular Classes';
        if (popularGrid) renderClassCards(popularClasses, popularGrid);
        setVisible(popularSection, true);
      } else {
        setVisible(popularSection, false);
      }

      const regularFolders = folders.filter((f) => f.type === 'regular');
      if (regularFolders.length > 0 && recommendContainer) {
        recommendContainer.innerHTML = '';
        regularFolders.forEach((folder) => {
          const folderClasses = safeArray(folder.classes);
          const columnHTML = `
            <div class="recommend-column">
              <div class="column-header">
                <div class="header-text">
                  <h4>${folder.title}</h4>
                  <p class="desc">${folder.description || ''}</p>
                </div>
                <a href="../class/class_list.html?cat=${folder.category || 'all'}" class="btn-more-arrow">More</a>
              </div>
              <div class="mini-card-list">
                ${folderClasses.map((cls) => {
                  const thumb = cls.thumbnail || cls.image_url || '';
                  return `
                    <div class="mini-class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
                      <div class="mini-thumb" style="background-image:url('${thumb}'); background-size:cover; background-position:center;"></div>
                      <div class="mini-info">
                        <h5 class="m-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${cls.title}</h5>
                        <p class="m-meta">${cls.category || ''} | ${cls.instructor_name || ''}</p>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
          recommendContainer.insertAdjacentHTML('beforeend', columnHTML);
        });
        setVisible(recommendSection, true);
      } else {
        setVisible(recommendSection, false);
      }
    } else {
      setVisible(recommendSection, false);
    }
  } catch (err) {
    console.error('[Main] Init failed', err);
    if (allGrid) {
      allGrid.innerHTML = '<p class="empty-state">Failed to load classes.</p>';
    }
  }
}

function filterAllClassesByCategory(categoryName) {
  const allGrid = document.getElementById('allClassGrid');
  const filtered = globalAllClasses.filter((cls) => String(cls.category || '').trim() === String(categoryName || '').trim());
  if (allGrid) renderClassCards(filtered, allGrid);
}

function renderClassCards(classes, container) {
  if (!container) return;
  if (!classes || classes.length === 0) {
    container.innerHTML = '<p class="empty-state">No classes available.</p>';
    return;
  }

  container.innerHTML = classes.map((cls) => {
    const discountRate = parseInt(cls.discount_rate, 10) || 0;
    const originalPrice = parseInt(cls.price, 10) || 0;
    const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;
    const thumb = cls.thumbnail || cls.image_url || 'https://via.placeholder.com/400x250';
    const likeCount = Number(cls.like_count || cls.bookmark_count || 0);

    return `
      <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
        <div class="card-thumbnail">
          <img src="${thumb}" alt="${cls.title}" style="width:100%; height:100%; object-fit:cover;">
          <div class="card-badges">
            ${cls.coupon_pack ? '<span class="badge-coupon">Coupon</span>' : ''}
            ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% OFF</span>` : ''}
          </div>
          <button type="button" class="btn-bookmark" data-action="bookmark-class" data-class-id="${cls.id}" onclick="event.stopPropagation();">♡</button>
        </div>
        <div class="card-info">
          <span class="category">${cls.category || 'Class'}</span>
          <h4 class="title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${cls.title}</h4>
          <span class="creator">${cls.instructor_name || 'Instructor'}</span>
          <div class="rating-info">
            <span class="star">★</span>
            <span class="score">${cls.avg_rating || '0.0'}</span>
            <span class="count">(${cls.review_count || '0'})</span>
            <span class="count">♥ ${likeCount}</span>
          </div>
          <div class="price-info">
            ${cls.discount_rate > 0 ? `<span class="discount">${cls.discount_rate}%</span>` : ''}
            <span class="price">${Math.round(currentPrice).toLocaleString()} KRW</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-action="bookmark-class"]').forEach((button) => {
    button.addEventListener('click', async (event) => {
      event.stopPropagation();
      const classId = button.dataset.classId;
      if (!window.BSQ?.isLoggedIn) {
        if (confirm('찜하기를 사용하려면 로그인이 필요합니다. 로그인 화면으로 이동할까요?')) {
          window.location.href = `../login/login.html?redirect=${encodeURIComponent(window.location.href)}`;
        }
        return;
      }

      const original = button.textContent;
      button.disabled = true;
      try {
        const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: classId });
        if (!res.success) throw new Error(res.error || '찜하기 실패');
        button.textContent = res.data?.bookmarked ? '♥' : '♡';
      } catch (error) {
        alert(`찜하기 처리에 실패했습니다: ${error.message}`);
        button.textContent = original;
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderMiniCards(classes, container) {
  if (!container) return;
  if (!classes || classes.length === 0) {
    container.innerHTML = '<p style="font-size:0.8rem; color:#999; padding: 1rem;">No recommended classes.</p>';
    return;
  }

  container.innerHTML = classes.map((cls) => {
    const thumb = cls.thumbnail || cls.image_url || '';
    return `
      <div class="mini-class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
        <div class="mini-thumb" style="background-image:url('${thumb}'); background-size:cover; background-position:center;"></div>
        <div class="mini-info">
          <h5 class="m-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${cls.title}</h5>
          <p class="m-meta">${cls.category || ''} | ${cls.instructor_name || cls.creator_name || ''}</p>
        </div>
      </div>
    `;
  }).join('');
}

async function initBanners() {
  const adBanner = document.querySelector('.main-ad-banner');
  const bottomBanner = document.querySelector('.bottom-banner-section');
  const result = await window.BSQ.api('/api/site-settings');
  if (!result.success) return;

  const topBanners = safeArray(result.data?.banners);
  const bottomBanners = safeArray(result.data?.bottom_banners);

  if (adBanner) {
    renderHeroBanner(adBanner, topBanners);
  }
  if (bottomBanner) {
    renderBottomBanner(bottomBanner, bottomBanners);
  }
}

function initDrawer() {
  const btnHamburger = document.getElementById('btnHamburger');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const drawerOverlay = document.getElementById('drawerOverlay');
  const drawerMenu = document.getElementById('drawerMenu');

  if (btnHamburger && btnCloseDrawer && drawerOverlay && drawerMenu) {
    const toggleDrawer = (force) => {
      const active = typeof force === 'boolean' ? force : !drawerMenu.classList.contains('active');
      drawerMenu.classList.toggle('active', active);
      drawerOverlay.classList.toggle('active', active);
      document.body.style.overflow = active ? 'hidden' : '';
    };
    btnHamburger.addEventListener('click', toggleDrawer);
    btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
    drawerOverlay.addEventListener('click', () => toggleDrawer(false));
  }
}
