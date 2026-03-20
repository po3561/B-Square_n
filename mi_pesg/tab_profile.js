// tab_profile.js - 프로필 설정 관련 로직 (D1 API 버전)
window.initProfileTab = function (userId, user) {
    const profileForm = document.getElementById('profileForm');
    const categoryChips = document.getElementById('categoryChips');
    const profileImageInput = document.getElementById('profileImage');
    const profileImagePreview = document.getElementById('profileImagePreview');

    if (!profileForm) return;

    // 1. 카테고리 칩 토글 로직
    if (categoryChips) {
        categoryChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.category-chip');
            if (chip) chip.classList.toggle('active');
        });
    }

    // 2. 이미지 프리뷰 로직
    if (profileImageInput) {
        profileImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    profileImagePreview.innerHTML = `<img src="${event.target.result}" alt="Preview">`;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 3. 프로필 정보 로드 (D1 API)
    async function loadProfile() {
        try {
            const res = await window.BSQ.api(`/api/users/${userId}`);
            if (res && res.success && res.data) {
                const data = res.data;
                const nameEl = document.getElementById('profileName');
                const phoneEl = document.getElementById('profilePhone');
                const usernameEl = document.getElementById('profileUsername');
                const snsEl = document.getElementById('profileSns');

                if (nameEl) nameEl.value = data.name || '';
                if (phoneEl) phoneEl.value = data.phone || '';
                if (usernameEl) usernameEl.value = data.username || '';
                if (snsEl) snsEl.value = data.sns_link || '';

                // 카테고리 칩 활성화
                if (data.preferred_category && categoryChips) {
                    const selected = data.preferred_category.split(',').map(s => s.trim());
                    categoryChips.querySelectorAll('.category-chip').forEach(chip => {
                        if (selected.includes(chip.dataset.category)) {
                            chip.classList.add('active');
                        }
                    });
                }

                // 프로필 이미지
                if (data.profile_image_url && profileImagePreview) {
                    profileImagePreview.innerHTML = `<img src="${data.profile_image_url}" alt="Profile">`;
                }

                updateSidebarUI(data.name, data.username);
            } else {
                // 신규 사용자
                const defaultName = user?.email?.split('@')[0] || '사용자';
                const nameEl = document.getElementById('profileName');
                const usernameEl = document.getElementById('profileUsername');
                if (nameEl) nameEl.value = defaultName;
                if (usernameEl) usernameEl.value = defaultName;
            }
        } catch (error) {
            console.warn("프로필 로드 오류:", error);
        }
    }

    // 4. 프로필 저장 (D1 API)
    profileForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = profileForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '저장 중...';

        try {
            // 선택된 카테고리 수집
            const activeChips = categoryChips 
                ? Array.from(categoryChips.querySelectorAll('.category-chip.active')).map(c => c.dataset.category)
                : [];

            const updates = {
                name: document.getElementById('profileName')?.value || '',
                phone: document.getElementById('profilePhone')?.value || '',
                sns_link: document.getElementById('profileSns')?.value || '',
                preferred_category: activeChips.join(', ')
            };

            // 이미지 URL (Base64인 경우 그대로 저장)
            const imgEl = profileImagePreview?.querySelector('img');
            if (imgEl && imgEl.src) {
                updates.profile_image_url = imgEl.src;
            }

            const res = await window.BSQ.api(`/api/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify(updates)
            });

            if (res && res.success) {
                alert("프로필 정보가 안전하게 저장되었습니다.");
                updateSidebarUI(updates.name, document.getElementById('profileUsername')?.value);
            } else {
                throw new Error(res?.error || '저장 실패');
            }
        } catch (error) {
            console.error("저장 오류:", error);
            alert("저장 실패: " + (error.message || "알 수 없는 오류"));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '기본 정보 저장';
        }
    };

    function updateSidebarUI(name, username) {
        const nicknameEl = document.getElementById('displayNickname');
        const usernameEl = document.getElementById('displayUsername');
        if (nicknameEl) nicknameEl.textContent = (name || '사용자') + " 님";
        if (usernameEl) usernameEl.textContent = "ID: " + (username || '-');
    }

    loadProfile();
};
