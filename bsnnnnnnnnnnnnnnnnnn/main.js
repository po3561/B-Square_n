// main.js - homepage data loader (D1 API)
document.addEventListener('DOMContentLoaded', async () => {
  await window.BSQ.ready;
  const currentCategory = new URLSearchParams(window.location.search).get('cat') || 'all';

  initMainPage();

  window.addEventListener('bsq_sync', (e) => {
    console.log('[BSQ Sync] Data refresh requested:', e.detail);
    initMainPage();
  });

  initBanners();

  const categoryLinks = document.querySelectorAll('.category-grid a');
  categoryLinks.forEach((link) => {
    if (link.dataset.cat === currentCategory) {
      document.querySelectorAll('#categoryFilter li').forEach((li) => li.classList.remove('active'));
      link.parentElement.classList.add('active');
    }

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const categoryName = link.textContent.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '').trim();
      filterAllClassesByCategory(categoryName);

      categoryLinks.forEach((l) => {
        l.classList.remove('active');
        l.parentElement.classList.remove('active');
      });
      link.classList.add('active');

      document.querySelector('.all-classes')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  initDrawer();
});

let globalAllClasses = [];

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function setVisible(el, visible) {
  if (!el) return;
  el.style.display = visible ? 'block' : 'none';
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
  const filtered = globalAllClasses.filter((cls) => cls.category && cls.category.includes(categoryName));
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

    return `
      <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
        <div class="card-thumbnail">
          <img src="${thumb}" alt="${cls.title}" style="width:100%; height:100%; object-fit:cover;">
          <div class="card-badges">
            ${cls.coupon_pack ? '<span class="badge-coupon">Coupon</span>' : ''}
            ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% OFF</span>` : ''}
          </div>
          <button type="button" class="btn-bookmark" onclick="event.stopPropagation();">★</button>
        </div>
        <div class="card-info">
          <span class="category">${cls.category || 'Class'}</span>
          <h4 class="title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${cls.title}</h4>
          <span class="creator">${cls.instructor_name || 'Instructor'}</span>
          <div class="rating-info">
            <span class="star">★</span>
            <span class="score">${cls.avg_rating || '0.0'}</span>
            <span class="count">(${cls.review_count || '0'})</span>
          </div>
          <div class="price-info">
            ${cls.discount_rate > 0 ? `<span class="discount">${cls.discount_rate}%</span>` : ''}
            <span class="price">${Math.round(currentPrice).toLocaleString()} KRW</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
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
  const result = await window.BSQ.api('/api/site-settings');
  if (!result.success) return;

  const banners = result.data ? result.data.banners : [];
  if (!banners || banners.length === 0) return;

  if (adBanner) {
    let currentSlide = 0;
    adBanner.innerHTML = `
      <div class="banner-slider" style="position:relative;width:100%;height:100%;overflow:hidden;border-radius:24px;">
        ${banners.map((b, i) => `
          <div class="banner-slide" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:${i === 0 ? 1 : 0};transition:opacity 0.6s ease;cursor:pointer;" onclick="if('${b.linkUrl}')window.open('${b.linkUrl}','_blank')">
            <img src="${b.imgUrl}" alt="Banner" style="width:100%;height:100%;object-fit:cover;">
          </div>
        `).join('')}
      </div>
    `;
    if (banners.length > 1) {
      setInterval(() => {
        const slides = adBanner.querySelectorAll('.banner-slide');
        slides[currentSlide].style.opacity = '0';
        currentSlide = (currentSlide + 1) % banners.length;
        slides[currentSlide].style.opacity = '1';
      }, 5000);
    }
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
