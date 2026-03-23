// view_reviews.js - Review System (D1 API 기반 적용)
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initReviews = function (_, classId, userId, __, hasAccess, isInstructor) {
    console.log("⭐ Reviews Module Initializing (D1)... | Access:", hasAccess, "| Instructor:", isInstructor);
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

    try {
        const result = await window.BSQ.api(`/api/reviews?class_id=${classId}`);
        if (!result.success || !result.data || result.data.length === 0) {
            if (reviewList) reviewList.innerHTML = '<p class="empty-state">아직 작성된 후기가 없습니다.</p>';
            if (photoGrid) photoGrid.innerHTML = '';
            if (heroAvgRating) heroAvgRating.textContent = '0.0';
            if (heroReviewCount) heroReviewCount.textContent = '0';
            if (avgRatingVal) avgRatingVal.textContent = '0.0';
            if (reviewTotalCount) reviewTotalCount.textContent = '0';
            if (avgStarsLarge) avgStarsLarge.textContent = '☆☆☆☆☆';
            return;
        }

        const items = result.data;
        const count = result.summary?.count || items.length;
        const avg = result.summary?.avg_rating || '5.0';
        const rounded = Math.round(parseFloat(avg));
        const starsText = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);

        if (heroAvgRating) heroAvgRating.textContent = avg;
        if (heroReviewCount) heroReviewCount.textContent = count;
        if (avgRatingVal) avgRatingVal.textContent = avg;
        if (reviewTotalCount) reviewTotalCount.textContent = count;
        if (avgStarsLarge) avgStarsLarge.textContent = starsText;

        // 사이드바
        const sideAvgRating = document.getElementById('sideAvgRating');
        const sideReviewCount = document.getElementById('sideReviewCount');
        if (sideAvgRating) sideAvgRating.textContent = avg;
        if (sideReviewCount) sideReviewCount.textContent = count;

        if (reviewList) {
            reviewList.innerHTML = items.map(r => {
                const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
                const dateStr = new Date(r.created_at).toLocaleDateString();
                const avatarUrl = 'https://cdn-icons-png.flaticon.com/512/847/847969.png';

                return `
                <div class="review-item-premium">
                    <div class="rip-header">
                        <div class="rip-user" style="display:flex; align-items:center; gap:8px;">
                            <img src="${avatarUrl}" alt="profile" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1px solid var(--border-color);">
                            <div style="display:flex; flex-direction:column;">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <span class="rip-name" style="color:var(--text-primary); font-weight:700;">${r.user_name}</span>
                                </div>
                                <span class="rip-stars" style="color:#ffb100; font-size:0.8rem;">${stars}</span>
                            </div>
                        </div>
                        <div class="rip-header-right">
                            <span class="rip-date">${dateStr}</span>
                        </div>
                    </div>
                    <div class="rip-body">
                        <p class="rip-text">${r.content}</p>
                    </div>
                    ${r.instructor_reply ? `
                    <div class="rip-reply" style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
                        <strong>↳ 강사의 답변:</strong>
                        <p style="margin-top:5px; font-size:0.9rem;">${r.instructor_reply}</p>
                    </div>` : ''}
                </div>
                `;
            }).join('');
        }
    } catch (err) {
        console.error("Reviews Loading Error:", err);
        if (reviewList) reviewList.innerHTML = '<p class="empty-state">후기를 불러올 수 없습니다.</p>';
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

    if (!btnSubmit) return;

    const newBtnSubmit = btnSubmit.cloneNode(true);
    btnSubmit.parentNode.replaceChild(newBtnSubmit, btnSubmit);

    newBtnSubmit.addEventListener('click', async () => {
        if (!userId) return showToast('info', '로그인 필요', '로그인 후 후기를 작성할 수 있습니다.');
        if (!hasAccess) return showToast('info', '수강 필요', '수강 신청 후 후기를 작성할 수 있습니다.');

        const content = document.getElementById('reviewText').value.trim();
        const rating = document.querySelector('input[name="rating"]:checked')?.value;

        if (!rating) return showToast('info', '별점 선택', '별점을 선택해주세요.');
        if (!content) return showToast('info', '내용 입력', '후기 내용을 입력해주세요.');

        newBtnSubmit.disabled = true;
        newBtnSubmit.textContent = '등록 중...';

        try {
            const userName = window.BSQ?.session?.user?.name || "익명";
            const result = await window.BSQ.api('/api/reviews', {
                method: 'POST',
                body: JSON.stringify({ class_id: classId, user_id: userId, user_name: userName, rating: parseInt(rating), content })
            });

            if (result.success) {
                document.getElementById('reviewText').value = '';
                const checked = document.querySelector('input[name="rating"]:checked');
                if (checked) checked.checked = false;
                showToast('success', '후기 등록 완료 ✍️', '소중한 후기 감사합니다!');
                loadReviews(classId, isInstructor);
            } else {
                showToast('error', '등록 실패', result.error || '오류가 발생했습니다.');
            }
        } catch (err) {
            console.error(err);
            showToast('error', '등록 실패', '서버 통신 중 오류가 발생했습니다.');
        } finally {
            newBtnSubmit.disabled = false;
            newBtnSubmit.textContent = '후기 등록하기';
        }
    });
}
