// recommend_view.js - Detailed view for recommended folders

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const folderId = params.get('id');

    if (!folderId) {
        alert('잘못된 접근입니다.');
        location.href = 'index.html';
        return;
    }

    await window.BSQ.ready;
    loadFolderData(folderId);
    setupCategoryFilter();
});

let currentFolderClasses = [];
const bookmarkMap = new Map();
let bookmarkProbeDisabled = false;

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getThumb(cls) {
    return cls?.thumbnail || cls?.image_url || '/assets/default-cover.svg';
}

function cssEsc(value = '') {
    const raw = String(value || '');
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
        return CSS.escape(raw);
    }
    return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function text(value = '') {
    return String(value || '').trim();
}

function formatCardMode(cls) {
    const classType = text(cls?.class_type || '').toUpperCase();
    if (classType === 'ONLINE') return '온라인';
    if (classType === 'OFFLINE') return '오프라인';
    if (classType === 'VOD') return 'VOD';
    if (classType) return classType;

    const operatingMode = text(cls?.operating_mode || '').toUpperCase();
    if (operatingMode === 'ONEDAY') return '원데이';
    if (operatingMode === 'SEASON') return '시즌';
    if (operatingMode === 'WEEKLY') return '주간';
    if (operatingMode === 'MONTHLY') return '월간';
    return operatingMode;
}

function formatCardBadge() {
    return 'CLASS101+';
}

function bookmarkIcon(bookmarked = false) {
    const path = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>';
    const filled = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="currentColor"></path>';
    return `<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="bsq-icon">${bookmarked ? filled : path}</svg>`;
}

function updateBookmarkButton(button, classId, bookmarked, count) {
    if (!button) return;
    const nextCount = Number(count || 0);
    button.dataset.classId = String(classId || '');
    button.dataset.bookmarked = bookmarked ? '1' : '0';
    button.dataset.likeCount = String(nextCount);
    button.classList.toggle('is-bookmarked', !!bookmarked);
    button.setAttribute('aria-pressed', bookmarked ? 'true' : 'false');
    button.setAttribute('aria-label', bookmarked ? '찜 취소' : '찜하기');
    button.innerHTML = bookmarkIcon(bookmarked);
}

function syncBookmarkUi(classId, bookmarked, count) {
    const id = text(classId);
    if (!id) return;
    const nextCount = Number(count || 0);
    bookmarkMap.set(id, { bookmarked: !!bookmarked, count: nextCount, synced: true });
    document.querySelectorAll(`.class-card[data-class-id="${cssEsc(id)}"]`).forEach((card) => {
        card.querySelectorAll('[data-action="bookmark-class"]').forEach((button) => {
            updateBookmarkButton(button, id, bookmarked, nextCount);
        });
    });
}

async function hydrateBookmarkStates(items = []) {
    if (bookmarkProbeDisabled || !window.BSQ?.isLoggedIn) {
        bookmarkProbeDisabled = true;
        return;
    }

    const ids = Array.from(new Set(items.map((item) => text(item?.id || item?.class_id || item)).filter(Boolean)));
    if (!ids.length) return;

    await Promise.all(ids.map(async (id) => {
        const cached = bookmarkMap.get(id);
        if (cached?.synced) return;
        try {
            const res = await window.BSQ.api(`/api/class-bookmarks?class_id=${encodeURIComponent(id)}`);
            if (!res?.success || !res.data) throw new Error(res?.error || '찜 상태를 불러오지 못했습니다.');
            syncBookmarkUi(id, !!res.data.bookmarked, Number(res.data.count || 0));
        } catch (error) {
            const message = String(error?.message || '');
            if (/401|403|unauthorized|로그인/i.test(message)) {
                bookmarkProbeDisabled = true;
                return;
            }
            console.warn('[recommend] bookmark probe failed:', error);
        }
    }));
}

async function toggleBookmark(classId, button) {
    const id = text(classId);
    if (!id || !window.BSQ?.api) return;
    if (!window.BSQ?.isLoggedIn) {
        alert('로그인이 필요합니다.');
        return;
    }
    if (button?.dataset.pending === '1') return;

    const previous = bookmarkMap.get(id) || {
        bookmarked: button?.dataset.bookmarked === '1',
        count: Number(button?.dataset.likeCount || 0),
    };

    if (button) {
        button.dataset.pending = '1';
        button.disabled = true;
    }

    try {
        const res = await window.BSQ.api('/api/class-bookmarks', 'POST', { class_id: id });
        if (!res?.success) throw new Error(res?.error || '찜 상태를 변경하지 못했습니다.');
        syncBookmarkUi(id, !!res.data?.bookmarked, Number(res.data?.count || 0));
    } catch (error) {
        syncBookmarkUi(id, previous.bookmarked, previous.count);
        console.error('[recommend] bookmark toggle failed:', error);
        alert(error?.message || '찜 상태를 변경하지 못했습니다.');
    } finally {
        if (button) {
            button.dataset.pending = '0';
            button.disabled = false;
        }
    }
}

function classUrl(id) {
    return `../class_view/class_view.html?id=${encodeURIComponent(id)}`;
}

async function loadFolderData(folderId) {
    const titleEl = document.getElementById('folderTitle');
    const gridEl = document.getElementById('folderClassGrid');

    if (!window.BSQ || !window.BSQ.api) {
        console.error('BSQ API not ready');
        return;
    }

    try {
        const res = await window.BSQ.api('/api/recommendations', { cacheBust: false });
        if (!res.success || !res.data) {
            titleEl.textContent = '데이터를 불러오지 못했습니다.';
            return;
        }

        const folders = res.data;
        const folder = folders.find((f) => String(f.id) === String(folderId));

        if (!folder) {
            titleEl.textContent = '폴더를 찾을 수 없습니다.';
            gridEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:5rem; color:#888;">준비된 클래스가 없습니다.</div>';
            return;
        }

        titleEl.textContent = folder.title || '';
        const descEl = document.getElementById('folderDesc');
        if (descEl) descEl.textContent = folder.description || '';

        gridEl.innerHTML = '';
        if (Array.isArray(folder.classes) && folder.classes.length > 0) {
            currentFolderClasses = folder.classes;
            renderClasses(folder.classes);
        } else {
            gridEl.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:5rem; color:#888;">이 폴더에 담긴 클래스가 없습니다.</div>';
        }
    } catch (err) {
        console.error('Load folder data failed', err);
        titleEl.textContent = '오류가 발생했습니다.';
    }
}

function renderClasses(classes) {
    const container = document.getElementById('folderClassGrid');
    if (!container) return;

    if (!Array.isArray(classes) || classes.length === 0) {
        container.innerHTML = '<p class="empty-state" style="grid-column:1/-1; text-align:center; padding:5rem; color:#888;">해당하는 클래스가 없습니다.</p>';
        return;
    }

    container.innerHTML = classes.map((cls) => {
        const id = text(cls.id || '');
        if (!id) return '';
        const thumb = getThumb(cls);
        const title = escapeHtml(cls.title || '제목 없음');
        const category = escapeHtml(cls.category || '미분류');
        const instructor = escapeHtml(cls.instructor_name || cls.creator_name || '작성자 정보 없음');
        const reviews = Number(cls.review_count || cls.reviews_count || 0);
        const avgRating = Number(cls.avg_rating || cls.rating || 0).toFixed(1);
        const cached = bookmarkMap.get(id);
        const bookmarked = !!cached?.bookmarked;
        const likeCount = Number(cached?.count ?? cls.like_count ?? cls.bookmark_count ?? 0);
        const mode = text(formatCardMode(cls));
        const badge = formatCardBadge();

        return `
        <article class="class-card class-card-recommend" data-class-id="${escapeHtml(id)}">
            <a class="class-card-link" href="${escapeHtml(classUrl(id))}" aria-label="${title} 상세 보기">
                <div class="card-thumbnail">
                    <img src="${escapeHtml(thumb)}" alt="${title}" loading="lazy">
                    <div class="card-badges" aria-hidden="true">
                        <span class="card-badge">${escapeHtml(badge)}</span>
                    </div>
                </div>
                <div class="card-info">
                    <h4 class="title">${title}</h4>
                    <div class="card-topline">
                        <span class="card-author">${instructor}</span>
                        ${mode ? '<span class="card-divider" aria-hidden="true">|</span>' : ''}
                        ${mode ? `<span class="card-mode">${escapeHtml(mode)}</span>` : ''}
                    </div>
                    <div class="meta">
                        <span class="rating">★ ${avgRating} (${reviews})</span>
                        <span class="meta-category">${category}</span>
                    </div>
                </div>
            </a>
            <button type="button" class="btn-bookmark${bookmarked ? ' is-bookmarked' : ''}" data-action="bookmark-class" data-class-id="${escapeHtml(id)}" data-bookmarked="${bookmarked ? '1' : '0'}" data-like-count="${likeCount}" aria-pressed="${bookmarked ? 'true' : 'false'}" aria-label="${bookmarked ? '찜 취소' : '찜하기'}">${bookmarkIcon(bookmarked)}</button>
        </article>
    `;
    }).join('');

    void hydrateBookmarkStates(classes);
}

function setupCategoryFilter() {
    const links = document.querySelectorAll('#categoryList a');
    links.forEach((link) => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const cat = link.dataset.cat;

            links.forEach((l) => l.classList.remove('active'));
            link.classList.add('active');

            if (cat === 'all') {
                renderClasses(currentFolderClasses);
            } else {
                const filtered = currentFolderClasses.filter((c) => c.category && c.category.includes(cat));
                renderClasses(filtered);
            }
        });
    });
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="bookmark-class"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    void toggleBookmark(button.dataset.classId, button);
});
