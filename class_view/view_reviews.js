// view_reviews.js - Review System with Instructor Role
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initReviews = function (db, classId, userId, supabase, hasAccess, isInstructor) {
    console.log("⭐ Reviews Module Initializing... | Access:", hasAccess, "| Instructor:", isInstructor);
    loadReviews(db, classId, userId, isInstructor);
    setupReviewForm(db, classId, userId, supabase, hasAccess, isInstructor);
};

function loadReviews(db, classId, userId, isInstructor) {
    const reviewList = document.getElementById('reviewsList');
    const photoGrid = document.getElementById('photoReviewGrid');
    const avgRatingVal = document.getElementById('avgRatingVal');
    const avgStarsLarge = document.getElementById('avgStarsLarge');
    const reviewTotalCount = document.getElementById('reviewTotalCount');
    const heroAvgRating = document.getElementById('heroAvgRating');
    const heroAvgStars = document.getElementById('heroAvgStars');
    const heroReviewCount = document.getElementById('heroReviewCount');

    try {
        db.ref(`reviews/${classId}`).on('value', (snapshot) => {
            const reviews = snapshot.val();
            if (!reviews) {
                if (reviewList) reviewList.innerHTML = '<p class="empty-state">아직 작성된 후기가 없습니다.</p>';
                if (photoGrid) photoGrid.innerHTML = '';
                if (heroAvgRating) heroAvgRating.textContent = '0.0';
                if (heroReviewCount) heroReviewCount.textContent = '0';
                if (heroAvgStars) heroAvgStars.textContent = '⭐';
                if (avgRatingVal) avgRatingVal.textContent = '0.0';
                if (reviewTotalCount) reviewTotalCount.textContent = '0';
                if (avgStarsLarge) avgStarsLarge.textContent = '☆☆☆☆☆';
                return;
            }

            const entries = Object.entries(reviews);
            const items = entries.map(([key, val]) => ({ ...val, _key: key })).reverse();
            const count = items.length;
            const sum = items.reduce((a, b) => a + parseInt(b.rating || 5), 0);
            const avg = (sum / count).toFixed(1);
            const rounded = Math.round(parseFloat(avg));
            const starsText = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);

            if (reviewTotalCount) reviewTotalCount.textContent = count;
            if (avgRatingVal) avgRatingVal.textContent = avg;
            if (avgStarsLarge) avgStarsLarge.textContent = starsText;
            if (heroAvgRating) heroAvgRating.textContent = avg;
            if (heroReviewCount) heroReviewCount.textContent = count;
            if (heroAvgStars) heroAvgStars.textContent = '⭐';

            if (photoGrid) {
                const reviewImages = items.filter(r => r.image_url).map(r => r.image_url);
                photoGrid.innerHTML = reviewImages.length > 0 ? reviewImages.slice(0, 5).map((url, idx) => `
                    <div class="photo-review-item">
                        <img src="${url}" alt="Review Image">
                        ${idx === 4 && reviewImages.length > 5 ? `<div class="more-photos-overlay">+${reviewImages.length - 5}</div>` : ''}
                    </div>
                `).join('') : '';
            }

            if (reviewList) {
                reviewList.innerHTML = items.map(r => {
                    const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
                    const dateStr = new Date(r.created_at).toLocaleDateString();
                    const helpfulCount = r.helpful_count || 0;
                    const isCreatorReview = r.is_instructor;

                    return `
                    <div class="review-item-premium">
                        <div class="rip-header">
                            <div class="rip-user">
                                <span class="rip-stars">${stars}</span>
                                ${isCreatorReview ? '<span class="rip-instructor-badge">강사</span>' : ''}
                                <span class="rip-name">${r.user_name}</span>
                            </div>
                            <div class="rip-header-right">
                                <span class="rip-date">${dateStr}</span>
                                ${isInstructor ? `<button class="btn-delete-review" data-key="${r._key}" title="삭제">✕</button>` : ''}
                            </div>
                        </div>
                        <div class="rip-body">
                            <p class="rip-text">${r.content}</p>
                        </div>
                        <div class="rip-footer">
                            <button class="btn-helpful">👍 ${helpfulCount}명에게 도움 됐어요</button>
                        </div>
                    </div>
                `}).join('');

                // 강사 삭제 버튼 이벤트
                if (isInstructor) {
                    reviewList.querySelectorAll('.btn-delete-review').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            if (!confirm('이 후기를 삭제하시겠습니까?')) return;
                            const key = btn.dataset.key;
                            try {
                                await db.ref(`reviews/${classId}/${key}`).remove();
                                if (typeof showToast === 'function') showToast('success', '삭제 완료', '후기가 삭제되었습니다.');
                            } catch (err) {
                                console.error("Review delete error:", err);
                            }
                        });
                    });
                }
            }
        }, (err) => {
            console.warn("Reviews access denied:", err.message);
            if (reviewList) reviewList.innerHTML = '<p class="empty-state">후기를 불러올 수 없습니다.</p>';
        });
    } catch (err) {
        console.error("Reviews Loading Error:", err);
    }
}

function setupReviewForm(db, classId, userId, supabase, hasAccess, isInstructor) {
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

    btnSubmit.addEventListener('click', async () => {
        if (!userId) {
            if (typeof showToast === 'function') showToast('info', '로그인 필요', '로그인 후 후기를 작성할 수 있습니다.');
            return;
        }
        if (!hasAccess) {
            if (typeof showToast === 'function') showToast('info', '수강 필요', '수강 신청 후 후기를 작성할 수 있습니다.');
            return;
        }

        const content = document.getElementById('reviewText').value.trim();
        const rating = document.querySelector('input[name="rating"]:checked')?.value;

        if (!rating) { if (typeof showToast === 'function') showToast('info', '별점 선택', '별점을 선택해주세요.'); return; }
        if (!content) { if (typeof showToast === 'function') showToast('info', '내용 입력', '후기 내용을 입력해주세요.'); return; }

        try {
            const { data: profile } = await supabase.from('users').select('name').eq('id', userId).maybeSingle();
            const reviewData = {
                user_id: userId,
                user_name: profile?.name || "익명",
                rating: parseInt(rating),
                content: content,
                created_at: firebase.database.ServerValue.TIMESTAMP,
                helpful_count: 0,
                is_instructor: isInstructor
            };

            await db.ref(`reviews/${classId}`).push(reviewData);
            document.getElementById('reviewText').value = '';
            const checked = document.querySelector('input[name="rating"]:checked');
            if (checked) checked.checked = false;

            if (typeof showToast === 'function') showToast('success', '후기 등록 완료 ✍️', '소중한 후기 감사합니다!');
        } catch (err) {
            console.error("Review submit error:", err);
            if (typeof showToast === 'function') showToast('error', '등록 실패', '후기 등록에 실패했습니다.');
        }
    });
}
