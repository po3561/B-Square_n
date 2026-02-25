// view_reviews.js
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initReviews = function (db, classId, userId, supabase) {
    console.log("⭐ Reviews Module Initializing...");
    loadReviews(db, classId);
    setupReviewSubmission(db, classId, userId, supabase);
};

async function loadReviews(db, classId) {
    const reviewList = document.getElementById('reviewsList');
    const photoGrid = document.getElementById('photoReviewGrid');
    const avgRatingVal = document.getElementById('avgRatingVal');
    const avgStarsLarge = document.getElementById('avgStarsLarge');
    const reviewTotalCount = document.getElementById('reviewTotalCount');

    try {
        db.ref(`reviews/${classId}`).on('value', (snapshot) => {
            const reviews = snapshot.val();
            if (!reviews) {
                if (reviewList) reviewList.innerHTML = '<p class="empty-state">아직 작성된 후기가 없습니다.</p>';
                if (photoGrid) photoGrid.innerHTML = '';
                return;
            }

            const items = Object.values(reviews).reverse();
            const count = items.length;
            if (reviewTotalCount) reviewTotalCount.textContent = count;

            const sum = items.reduce((a, b) => a + parseInt(b.rating || 5), 0);
            const avg = (sum / count).toFixed(1);
            if (avgRatingVal) avgRatingVal.textContent = avg;
            if (avgStarsLarge) {
                const rounded = Math.round(parseFloat(avg));
                avgStarsLarge.textContent = '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
            }

            // Populate Photo Grid (Mocking images since current review data might not have them)
            if (photoGrid) {
                const reviewImages = items.filter(r => r.image_url).map(r => r.image_url);
                // For demonstration, if no images exist, show a few placeholders like the Class101 design
                const demoImages = reviewImages.length > 0 ? reviewImages : [
                    'https://images.unsplash.com/photo-1516259762381-22954d7d3ad2?w=200',
                    'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=200',
                    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=200'
                ];

                photoGrid.innerHTML = demoImages.slice(0, 5).map((url, idx) => `
                    <div class="photo-review-item">
                        <img src="${url}" alt="Review Image">
                        ${idx === 4 && demoImages.length > 5 ? `<div class="more-photos-overlay">+${demoImages.length - 5}</div>` : ''}
                    </div>
                `).join('');
            }

            if (reviewList) {
                reviewList.innerHTML = items.map(r => {
                    const stars = '★'.repeat(r.rating || 5) + '☆'.repeat(5 - (r.rating || 5));
                    const dateStr = new Date(r.created_at).toLocaleDateString();
                    // Mocking helpful count for design parity
                    const helpfulCount = r.helpful_count || Math.floor(Math.random() * 50);

                    return `
                    <div class="review-item-premium">
                        <div class="rip-header">
                            <div class="rip-user">
                                <span class="rip-stars">${stars}</span>
                                <span class="rip-name">${r.user_name}</span>
                            </div>
                            <span class="rip-date">${dateStr}</span>
                        </div>
                        <div class="rip-body">
                            <p class="rip-text">${r.content}</p>
                            ${r.content.length > 100 ? '<button class="btn-expand">펼치기 ▼</button>' : ''}
                        </div>
                        <div class="rip-footer">
                            <button class="btn-helpful">👍 ${helpfulCount}명에게 도움 됐어요</button>
                        </div>
                    </div>
                `}).join('');
            }
        }, (err) => {
            console.warn("Reviews access denied:", err.message);
            if (reviewList) reviewList.innerHTML = '<p class="empty-state">회원 전용 후기 공간입니다.</p>';
        });
    } catch (err) {
        console.error("Reviews Loading Module Error:", err);
    }
}

function setupReviewSubmission(db, classId, userId, supabase) {
    const btnSubmit = document.getElementById('btnSubmitReview');
    if (!btnSubmit) return;

    btnSubmit.addEventListener('click', async () => {
        if (!userId) {
            alert("로그인이 필요합니다.");
            return;
        }

        const content = document.getElementById('reviewText').value.trim();
        const rating = document.querySelector('input[name="rating"]:checked')?.value;

        if (!rating) { alert("별점을 선택해주세요."); return; }
        if (!content) { alert("내용을 입력해주세요."); return; }

        const { data: profile } = await supabase.from('users').select('name').eq('id', userId).maybeSingle();

        const reviewData = {
            user_id: userId,
            user_name: profile?.name || "익명",
            rating: rating,
            content: content,
            created_at: firebase.database.ServerValue.TIMESTAMP,
            helpful_count: 0
        };

        await db.ref(`reviews/${classId}`).push(reviewData);
        document.getElementById('reviewText').value = '';
        alert("후기가 등록되었습니다!");
    });
}
