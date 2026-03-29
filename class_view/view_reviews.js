window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initReviews = function (_, classId, userId, __, hasAccess, isInstructor) {
    loadReviews(classId, isInstructor);
    setupReviewForm(classId, userId, hasAccess, isInstructor);
};

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

    try {
        const result = await window.BSQ.api(`/api/reviews?class_id=${classId}`);
        const items = result?.success && Array.isArray(result.data) ? result.data : [];

        if (!items.length) {
            if (reviewList) reviewList.innerHTML = '<p class="empty-state">아직 작성된 후기가 없습니다.</p>';
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
        console.error('Reviews Loading Error:', err);
        if (reviewList) reviewList.innerHTML = '<p class="empty-state">후기를 불러오지 못했습니다.</p>';
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

    newBtnSubmit.addEventListener('click', async () => {
        if (!userId) return showToast('info', '로그인이 필요합니다', '후기를 작성하려면 먼저 로그인해 주세요.');
        if (!hasAccess) return showToast('info', '수강 후 작성 가능', '수강을 완료한 뒤 후기를 남길 수 있습니다.');

        const content = document.getElementById('reviewText')?.value.trim();
        const rating = document.querySelector('input[name="rating"]:checked')?.value;

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
                const checked = document.querySelector('input[name="rating"]:checked');
                if (checked) checked.checked = false;
                showToast('success', '후기가 등록되었습니다', '다른 수강생들에게 큰 도움이 됩니다.');
                loadReviews(classId, isInstructor);
            } else {
                showToast('error', '등록에 실패했습니다', result?.error || '잠시 후 다시 시도해 주세요.');
            }
        } catch (err) {
            console.error(err);
            showToast('error', '등록에 실패했습니다', '서버와의 통신 중 오류가 발생했습니다.');
        } finally {
            newBtnSubmit.disabled = false;
            newBtnSubmit.textContent = '후기 등록';
        }
    });
}
