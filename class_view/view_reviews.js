window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initReviews = function (_, classId, userId, __, hasAccess, isInstructor) {
    loadReviews(classId, isInstructor);
    setupReviewForm(classId, userId, hasAccess, isInstructor);
};

let reviewLoadToken = 0;

function devLog(level, ...args) {
    if (typeof window.__BSQ_DEV_LOG__ === 'function') {
        window.__BSQ_DEV_LOG__(level, ...args);
        return;
    }

    const fn = typeof console?.[level] === 'function' ? console[level].bind(console) : console.log.bind(console);
    fn(...args);
}

function renderReviewLoadingState(reviewList, photoGrid) {
    if (photoGrid) {
        photoGrid.innerHTML = `
            <div class="section-skeleton-list" aria-hidden="true">
                <div class="section-skeleton-item" style="min-height: 112px;">
                    <div class="section-skeleton-row">
                        <span class="section-skeleton-chip" style="width:72px;"></span>
                        <span class="section-skeleton-line" style="width:48%; height:18px;"></span>
                        <span class="section-skeleton-line" style="width:82%;"></span>
                    </div>
                </div>
                <div class="section-skeleton-item" style="min-height: 112px;">
                    <div class="section-skeleton-row">
                        <span class="section-skeleton-chip" style="width:64px;"></span>
                        <span class="section-skeleton-line" style="width:58%; height:18px;"></span>
                        <span class="section-skeleton-line" style="width:76%;"></span>
                    </div>
                </div>
            </div>
        `;
    }

    if (reviewList) {
        reviewList.innerHTML = `
            <div class="section-skeleton-list" aria-hidden="true">
                ${Array.from({ length: 3 }).map(() => `
                    <div class="section-skeleton-item">
                        <div class="section-skeleton-row">
                            <span class="section-skeleton-chip" style="width:84px;"></span>
                            <span class="section-skeleton-line" style="width:54%; height:18px;"></span>
                            <span class="section-skeleton-line" style="width:90%;"></span>
                            <span class="section-skeleton-line" style="width:76%;"></span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

function renderReviewStateCard({ eyebrow = '', title = '', message = '', actionLabel = '', actionAction = '', detail = '' } = {}) {
    return `
        <div class="section-state-card" data-tone="soft">
            <div class="section-state-copy">
                ${eyebrow ? `<p class="section-state-eyebrow">${eyebrow}</p>` : ''}
                <strong class="section-state-title">${title}</strong>
                <p class="section-state-text">${message}</p>
                ${detail ? `<p class="class-view-status-detail" style="margin-top:0.15rem;">${detail}</p>` : ''}
            </div>
            ${actionLabel ? `
                <div class="section-state-actions">
                    <button type="button" class="section-state-btn primary" data-action="${actionAction}">${actionLabel}</button>
                </div>
            ` : ''}
        </div>
    `;
}

function renderReviewEmptyState(reviewList) {
    if (!reviewList) return;
    reviewList.innerHTML = renderReviewStateCard({
        eyebrow: '후기',
        title: '아직 작성된 후기가 없습니다.',
        message: '첫 후기를 남겨주면 다른 수강생에게도 도움이 됩니다.',
    });
}

function renderReviewErrorState(reviewList, error) {
    if (!reviewList) return;
    reviewList.innerHTML = renderReviewStateCard({
        eyebrow: '후기',
        title: '후기를 불러오지 못했습니다.',
        message: String(error?.error || error?.message || '잠시 후 다시 시도해 주세요.').trim(),
        actionLabel: '다시 불러오기',
        actionAction: 'retry-review-load',
        detail: String(error?.detail || error?.message || '').trim(),
    });
}

async function loadReviews(classId, isInstructor) {
    const reviewList = document.getElementById('reviewsList');
    const photoGrid = document.getElementById('photoReviewGrid');
    const heroAvgRating = document.getElementById('heroAvgRating');
    const heroReviewCount = document.getElementById('heroReviewCount');
    const avgRatingVal = document.getElementById('avgRatingVal');
    const reviewTotalCount = document.getElementById('reviewTotalCount');
    const avgStarsLarge = document.getElementById('avgStarsLarge');
    const sideAvgRating = document.getElementById('sideAvgRating');
    const sideReviewCount = document.getElementById('sideReviewCount');

    const requestToken = ++reviewLoadToken;
    renderReviewLoadingState(reviewList, photoGrid);

    try {
        const result = await window.BSQ.api(`/api/reviews?class_id=${classId}`);
        if (requestToken !== reviewLoadToken) return;
        const items = result?.success && Array.isArray(result.data) ? result.data : [];

        if (!items.length) {
            renderReviewEmptyState(reviewList);
            if (photoGrid) photoGrid.innerHTML = '';
            if (heroAvgRating) heroAvgRating.textContent = '0.0';
            if (heroReviewCount) heroReviewCount.textContent = '0';
            if (avgRatingVal) avgRatingVal.textContent = '0.0';
            if (reviewTotalCount) reviewTotalCount.textContent = '0';
            if (avgStarsLarge) avgStarsLarge.textContent = '☆☆☆☆☆';
            if (sideAvgRating) sideAvgRating.textContent = '0.0';
            if (sideReviewCount) sideReviewCount.textContent = '0';
            return;
        }

        const count = Number(result.summary?.count || items.length);
        const avg = String(result.summary?.avg_rating || '0.0');
        const rounded = Math.max(0, Math.min(5, Math.round(parseFloat(avg) || 0)));
        const starsText = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);

        if (heroAvgRating) heroAvgRating.textContent = avg;
        if (heroReviewCount) heroReviewCount.textContent = String(count);
        if (avgRatingVal) avgRatingVal.textContent = avg;
        if (reviewTotalCount) reviewTotalCount.textContent = String(count);
        if (avgStarsLarge) avgStarsLarge.textContent = starsText;
        if (sideAvgRating) sideAvgRating.textContent = avg;
        if (sideReviewCount) sideReviewCount.textContent = String(count);

        if (reviewList) {
            reviewList.innerHTML = items.map((r) => {
                const starCount = Math.max(0, Math.min(5, Number(r.rating || 0)));
                const stars = '★'.repeat(starCount) + '☆'.repeat(5 - starCount);
                const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-';
                const avatarUrl = '/assets/default-avatar.svg';

                return `
                    <div class="review-item-premium">
                        <div class="rip-header">
                            <div class="rip-user" style="display:flex; align-items:center; gap:8px;">
                                <img src="${avatarUrl}" alt="profile" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);">
                                <div style="display:flex; flex-direction:column;">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span class="rip-name" style="color:var(--text-primary); font-weight:700;">${r.user_name || '수강생'}</span>
                                    </div>
                                    <span class="rip-stars" style="color:#ffb100; font-size:0.8rem;">${stars}</span>
                                </div>
                            </div>
                            <div class="rip-header-right">
                                <span class="rip-date">${dateStr}</span>
                            </div>
                        </div>
                        <div class="rip-body">
                            <p class="rip-text">${r.content || ''}</p>
                        </div>
                        ${r.instructor_reply ? `
                            <div class="rip-reply" style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                                <strong>강사 답변:</strong>
                                <p style="margin-top:5px; font-size:0.9rem;">${r.instructor_reply}</p>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }
    } catch (err) {
        if (requestToken !== reviewLoadToken) return;
        devLog('warn', '[class_view] reviews load error:', err);
        renderReviewErrorState(reviewList, err);
        if (photoGrid) photoGrid.innerHTML = '';
        if (heroAvgRating) heroAvgRating.textContent = '0.0';
        if (heroReviewCount) heroReviewCount.textContent = '0';
        if (avgRatingVal) avgRatingVal.textContent = '0.0';
        if (reviewTotalCount) reviewTotalCount.textContent = '0';
        if (avgStarsLarge) avgStarsLarge.textContent = '☆☆☆☆☆';
        if (sideAvgRating) sideAvgRating.textContent = '0.0';
        if (sideReviewCount) sideReviewCount.textContent = '0';
    }
}

function setupReviewForm(classId, userId, hasAccess, isInstructor) {
    const lockedForm = document.getElementById('reviewFormLocked');
    const unlockedForm = document.getElementById('reviewFormUnlocked');
    const btnSubmit = document.getElementById('btnSubmitReview');

    if (hasAccess && userId) {
        if (lockedForm) lockedForm.style.display = 'none';
        if (unlockedForm) unlockedForm.style.display = 'block';
    } else {
        if (lockedForm) lockedForm.style.display = 'block';
        if (unlockedForm) unlockedForm.style.display = 'none';
    }

    if (!btnSubmit || !btnSubmit.parentNode) return;

    const newBtnSubmit = btnSubmit.cloneNode(true);
    btnSubmit.parentNode.replaceChild(newBtnSubmit, btnSubmit);

    const ratingInput = document.getElementById('reviewRating');
    const ratingHint = document.getElementById('reviewRatingHint');
    const ratingButtons = Array.from(document.querySelectorAll('.star-rating-option'));
    const ratingLabels = {
        1: '1점 - 많이 아쉬워요',
        2: '2점 - 조금 아쉬워요',
        3: '3점 - 보통이에요',
        4: '4점 - 만족해요',
        5: '5점 - 아주 좋아요',
    };

    function setRating(value) {
        const next = Math.max(0, Math.min(5, Number(value) || 0));
        if (ratingInput) ratingInput.value = next ? String(next) : '';
        ratingButtons.forEach((button) => {
            const rating = Number(button.dataset.rating || 0);
            const selected = next > 0 && rating <= next;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', rating === next ? 'true' : 'false');
        });
        if (ratingHint) {
            ratingHint.textContent = next ? (ratingLabels[next] || `${next}점`) : '별점을 선택해 주세요.';
        }
    }

    ratingButtons.forEach((button) => {
        button.addEventListener('click', () => setRating(button.dataset.rating));
    });
    setRating(ratingInput?.value || 0);

    document.getElementById('reviewsList')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="retry-review-load"]');
        if (!button) return;
        void loadReviews(classId, isInstructor);
    });

    newBtnSubmit.addEventListener('click', async () => {
        if (!userId) return showToast('info', '로그인이 필요합니다', '후기를 작성하려면 먼저 로그인해 주세요.');
        if (!hasAccess) return showToast('info', '수강 후 작성 가능', '수강을 완료한 뒤 후기를 남길 수 있습니다.');

        const content = document.getElementById('reviewText')?.value.trim();
        const rating = ratingInput?.value || document.querySelector('input[name="rating"]:checked')?.value;

        if (!rating) return showToast('info', '별점을 선택해 주세요', '별점은 1점부터 5점까지 선택할 수 있습니다.');
        if (!content) return showToast('info', '내용을 입력해 주세요', '후기 내용을 입력한 뒤 등록할 수 있습니다.');

        newBtnSubmit.disabled = true;
        newBtnSubmit.textContent = '등록 중...';

        try {
            const userName = window.BSQ?.session?.user?.name || '수강생';
            const result = await window.BSQ.api('/api/reviews', {
                method: 'POST',
                body: JSON.stringify({
                    class_id: classId,
                    user_id: userId,
                    user_name: userName,
                    rating: parseInt(rating, 10),
                    content,
                }),
            });

            if (result?.success) {
                const textArea = document.getElementById('reviewText');
                if (textArea) textArea.value = '';
                setRating(0);
                showToast('success', '후기가 등록되었습니다', '다른 수강생들에게 큰 도움이 됩니다.');
                loadReviews(classId, isInstructor);
            } else {
                showToast('error', '등록에 실패했습니다', result?.error || '잠시 후 다시 시도해 주세요.');
            }
        } catch (err) {
            devLog('warn', '[class_view] review submit error:', err);
            showToast('error', '등록에 실패했습니다', '서버와의 통신 중 오류가 발생했습니다.');
        } finally {
            newBtnSubmit.disabled = false;
            newBtnSubmit.textContent = '후기 등록';
        }
    });
}
