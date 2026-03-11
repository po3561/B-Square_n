// main.js — BSQ.ready 기반 리팩토링 + 배너 로딩 + 검색 연동

document.addEventListener('DOMContentLoaded', async () => {
    // ★ bsq_server.js 초기화 완전 대기 (이중 초기화 제거)
    await window.BSQ.ready;

    const supabase = window.BSQ.supabase || window.supabaseClient;
    const db = window.BSQ.db || firebase.database();

    // 1. 유저 메뉴 (header.js에서도 처리하지만 main.js 고유 로직)
    const userMenu = document.getElementById('userMenu');
    // header.js가 이미 처리하므로 main.js에서는 생략 가능

    // 2. 메인 페이지 클래스 목록 로드 (실시간)
    initRealtimeClasses(supabase, db);

    // 3. 추천 클래스 폴더 로드
    initRecommendations(supabase, db);

    // 4. 광고 배너 로드 (Firebase site_settings/banners)
    initBanners(db);

    // 5. 카테고리 필터링 이벤트 연결
    const categoryLinks = document.querySelectorAll('.category-grid a');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const categoryName = link.textContent.replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, '').trim();
            filterClassesByCategory(categoryName);

            // 시각적 피드백
            categoryLinks.forEach(l => {
                l.style.fontWeight = '400';
                l.style.color = '';
            });
            link.style.fontWeight = '700';
            link.style.color = 'var(--accent-color)';
        });
    });

    // 6. Hamburger Drawer Menu 제어
    const btnHamburger = document.getElementById('btnHamburger');
    const btnCloseDrawer = document.getElementById('btnCloseDrawer');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const drawerMenu = document.getElementById('drawerMenu');

    if (btnHamburger && btnCloseDrawer && drawerOverlay && drawerMenu) {
        const toggleDrawer = (force) => {
            if (typeof force === 'boolean') {
                if (force) {
                    drawerMenu.classList.add('active');
                    drawerOverlay.classList.add('active');
                    document.body.style.overflow = 'hidden';
                } else {
                    drawerMenu.classList.remove('active');
                    drawerOverlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            } else {
                drawerMenu.classList.toggle('active');
                drawerOverlay.classList.toggle('active');
                document.body.style.overflow = drawerMenu.classList.contains('active') ? 'hidden' : '';
            }
        };

        btnHamburger.addEventListener('click', toggleDrawer);
        btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
        drawerOverlay.addEventListener('click', () => toggleDrawer(false));

        const drawerCats = document.querySelectorAll('.drawer-main-categories li:not(.divider)');
        drawerCats.forEach(li => {
            li.addEventListener('click', function () {
                drawerCats.forEach(c => c.classList.remove('active'));
                this.classList.add('active');
            });
        });
    }
});

let globalAllClasses = [];

// ==========================================
// 광고 배너 로딩 (Firebase → 메인페이지 반영)
// ==========================================
function initBanners(db) {
    const adBanner = document.querySelector('.main-ad-banner');
    const bottomBanner = document.querySelector('.banner-content');

    db.ref('site_settings/banners').on('value', (snap) => {
        const banners = snap.val();

        if (!banners || !Array.isArray(banners) || banners.length === 0) {
            // 배너 데이터 없으면 기본 표시
            if (adBanner) {
                adBanner.innerHTML = `<div class="ad-content"><h2 style="color:var(--text-secondary);opacity:0.5;">광고 배너 준비 중</h2></div>`;
            }
            return;
        }

        // 상단 메인 배너 슬라이더
        if (adBanner) {
            let currentSlide = 0;
            adBanner.innerHTML = `
                <div class="banner-slider" style="position:relative;width:100%;height:100%;overflow:hidden;border-radius:16px;">
                    ${banners.map((b, i) => `
                        <div class="banner-slide" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:${i === 0 ? 1 : 0};transition:opacity 0.6s ease;cursor:${b.linkUrl ? 'pointer' : 'default'};" ${b.linkUrl ? `onclick="window.open('${b.linkUrl}','_blank')"` : ''}>
                            <img src="${b.imgUrl}" alt="배너 ${i + 1}" style="width:100%;height:100%;object-fit:cover;">
                        </div>
                    `).join('')}
                    ${banners.length > 1 ? `
                        <div class="banner-dots" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:5;">
                            ${banners.map((_, i) => `<span class="dot" data-idx="${i}" style="width:8px;height:8px;border-radius:50%;background:${i === 0 ? '#fff' : 'rgba(255,255,255,0.4)'};cursor:pointer;transition:background 0.3s;"></span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;

            // 자동 슬라이드
            if (banners.length > 1) {
                const slides = adBanner.querySelectorAll('.banner-slide');
                const dots = adBanner.querySelectorAll('.dot');

                const showSlide = (idx) => {
                    slides.forEach((s, i) => s.style.opacity = i === idx ? '1' : '0');
                    dots.forEach((d, i) => d.style.background = i === idx ? '#fff' : 'rgba(255,255,255,0.4)');
                    currentSlide = idx;
                };

                dots.forEach(dot => {
                    dot.addEventListener('click', () => showSlide(parseInt(dot.dataset.idx)));
                });

                setInterval(() => {
                    showSlide((currentSlide + 1) % banners.length);
                }, 5000);
            }
        }

        // 하단 배너
        if (bottomBanner && banners.length > 0) {
            bottomBanner.innerHTML = banners.map(b => `
                <div class="bottom-banner-item" style="flex:0 0 auto;min-width:250px;cursor:${b.linkUrl ? 'pointer' : 'default'};border-radius:12px;overflow:hidden;" ${b.linkUrl ? `onclick="window.open('${b.linkUrl}','_blank')"` : ''}>
                    <img src="${b.imgUrl}" alt="배너" style="width:100%;height:100%;object-fit:cover;">
                </div>
            `).join('');
            bottomBanner.style.cssText = 'display:flex;gap:16px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:8px 0;';
        }
    });

    // 하단 배너 좌우 스크롤 버튼
    const btnPrev = document.querySelector('.btn-prev');
    const btnNext = document.querySelector('.btn-next');
    const bannerContent = document.querySelector('.banner-content');

    if (btnPrev && btnNext && bannerContent) {
        btnPrev.addEventListener('click', () => {
            bannerContent.scrollBy({ left: -200, behavior: 'smooth' });
        });
        btnNext.addEventListener('click', () => {
            bannerContent.scrollBy({ left: 200, behavior: 'smooth' });
        });
    }
}

// ==========================================
// 클래스 실시간 로딩
// ==========================================
async function initRealtimeClasses(supabase, db) {
    const cardGrid = document.querySelector('.card-grid');
    const largeGrid = document.querySelector('.large-grid');
    if (!cardGrid) return;

    console.log("📡 Initializing Realtime Class Listener...");

    db.ref('classes').on('value', async (snapshot) => {
        console.log("🔄 Realtime Update Received from Firebase");
        let allClasses = [];

        if (snapshot.exists()) {
            const fbData = snapshot.val();
            Object.keys(fbData).forEach(key => {
                allClasses.push({ ...fbData[key], id: key });
            });
        }

        try {
            if (supabase) {
                const { data: sbData } = await supabase.from('classes').select('*');
                if (sbData) {
                    sbData.forEach(cls => {
                        if (!allClasses.some(a => a.supabase_uid === cls.creator_id && a.title === cls.title)) {
                            allClasses.push(cls);
                        }
                    });
                }
            }
        } catch (e) {
            console.warn("Supabase load failed, using Firebase only.", e);
        }

        allClasses.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

        globalAllClasses = allClasses;
        renderClassCards(allClasses, cardGrid, db);
        if (largeGrid) renderClassCards(allClasses, largeGrid, db);
    });
}

function filterClassesByCategory(categoryName) {
    const cardGrid = document.querySelector('.card-grid');
    const largeGrid = document.querySelector('.large-grid');
    const db = window.BSQ.db || firebase.database();

    const filtered = globalAllClasses.filter(cls =>
        cls.category && cls.category.includes(categoryName)
    );

    renderClassCards(filtered, cardGrid, db);
    if (largeGrid) renderClassCards(filtered, largeGrid, db);

    document.querySelector('.class-lists-section')?.scrollIntoView({ behavior: 'smooth' });
}

function renderClassCards(classes, container, db) {
    if (!classes || classes.length === 0) {
        container.innerHTML = '<p class="empty-state">등록된 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map(cls => {
        const discountRate = parseInt(cls.discount_rate) || 0;
        const originalPrice = parseInt(cls.price) || 0;
        const currentPrice = discountRate > 0 ? originalPrice * (1 - discountRate / 100) : originalPrice;

        return `
        <div class="class-card" onclick="location.href='../class_view/class_view.html?id=${cls.id}'" style="cursor:pointer;">
            <div class="card-thumbnail">
                <img src="${cls.image_url || cls.thumbnail || 'https://via.placeholder.com/400x250'}" alt="${cls.title}">
                <div class="card-badges">
                    ${cls.coupon_pack ? '<span class="badge-coupon">쿠폰팩</span>' : ''}
                    ${discountRate > 0 ? `<span class="badge-discount">${discountRate}% 할인</span>` : ''}
                </div>
                <button type="button" class="btn-bookmark" onclick="event.stopPropagation();">🔖</button>
            </div>
            <div class="card-info">
                <span class="category">${cls.category || '미분류'}</span>
                <h4 class="title">${cls.title}</h4>
                <span class="creator">작성자: ${cls.creator_name || cls.instructorName || '크리에이터'}</span>
                <div class="meta">
                    <span class="rating" id="rating-${cls.id}">⭐ -</span>
                    <span class="reviews" id="reviews-${cls.id}">(-)</span>
                </div>
                <div class="price-area">
                    ${discountRate > 0 ? `<span class="original-price">${originalPrice.toLocaleString()}원</span>` : ''}
                    <span class="current-price">${Math.round(currentPrice).toLocaleString()}원</span>
                </div>
            </div>
        </div>
    `}).join('');

    // 실시간 별점/후기수 로드
    if (db) {
        classes.forEach(cls => {
            db.ref(`reviews/${cls.id}`).on('value', (snap) => {
                const ratingEl = document.getElementById(`rating-${cls.id}`);
                const reviewsEl = document.getElementById(`reviews-${cls.id}`);
                if (!ratingEl || !reviewsEl) return;

                const reviews = snap.val();
                if (!reviews) {
                    ratingEl.textContent = '⭐ 0.0';
                    reviewsEl.textContent = '(0)';
                    return;
                }

                const items = Object.values(reviews);
                const count = items.length;
                const sum = items.reduce((a, b) => a + parseInt(b.rating || 5), 0);
                const avg = (sum / count).toFixed(1);

                ratingEl.textContent = `⭐ ${avg}`;
                reviewsEl.textContent = `(${count})`;
            });
        });
    }
}

// ==========================================
// 추천 클래스 폴더
// ==========================================
async function initRecommendations(supabase, db) {
    const recommendColumns = document.querySelector('.recommend-columns');
    if (!recommendColumns) return;

    recommendColumns.style.cssText = 'display: flex !important; overflow-x: auto; gap: 20px; padding: 10px 5px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none;';
    recommendColumns.classList.add('hide-scrollbar');

    db.ref('site_design/recommendations').on('value', async (snap) => {
        const data = snap.val() || {};
        const folders = Object.values(data).sort((a, b) => (a.order || 0) - (b.order || 0));

        if (folders.length === 0) {
            recommendColumns.innerHTML = '<p style="color:#888; padding:20px;">공개된 추천 클래스가 없습니다.</p>';
            return;
        }

        recommendColumns.innerHTML = '';

        for (const folder of folders) {
            const folderDiv = document.createElement('div');
            folderDiv.className = 'column';
            folderDiv.style.cssText = 'flex: 0 0 300px; scroll-snap-align: start; background: var(--card-bg); border-radius: var(--card-radius); border: 1px solid var(--border-color); padding: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);';

            const detailUrl = `recommend_view.html?id=${folder.id}`;

            folderDiv.innerHTML = `
                <div class="column-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                    <h4 style="margin:0; font-size:1.1rem; font-weight:700;">${folder.title}</h4>
                    <a href="${detailUrl}" class="btn-more" style="background:#007aff; color:#fff; width:24px; height:24px; border-radius:4px; display:flex; align-items:center; justify-content:center; text-decoration:none; font-size:12px;">➔</a>
                </div>
                <ul class="column-list" style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px;">
                </ul>
            `;

            recommendColumns.appendChild(folderDiv);

            if (folder.classIds && Array.isArray(folder.classIds)) {
                const listUl = folderDiv.querySelector('.column-list');
                const previewIds = folder.classIds.slice(0, 3);

                for (const cid of previewIds) {
                    const cSnap = await db.ref(`classes/${cid}`).once('value');
                    const cData = cSnap.val();
                    if (cData) {
                        const li = document.createElement('li');
                        li.className = 'list-item';
                        li.style.cssText = 'display:flex; align-items:center; gap:12px; cursor:pointer;';
                        li.onclick = () => location.href = `../class_view/class_view.html?id=${cid}`;
                        li.innerHTML = `
                            <div class="item-thumbnail" style="width:50px; height:35px; border-radius:4px; overflow:hidden; background:#eee;">
                                <img src="${cData.thumbnail || cData.image_url || ''}" style="width:100%; height:100%; object-fit:cover;">
                            </div>
                            <div class="item-info">
                                <p class="title" style="margin:0; font-size:0.9rem; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">${cData.title}</p>
                                <p class="rating" style="margin:0; font-size:0.75rem; color:var(--text-secondary);">⭐ ${cData.rating || '4.5'}</p>
                            </div>
                        `;
                        listUl.appendChild(li);
                    }
                }
            }
        }
    });
}
