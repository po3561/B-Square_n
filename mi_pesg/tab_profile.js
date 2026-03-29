window.initProfileTab = function (userId, user) {
    const profileForm = document.getElementById('profileForm');
    const categoryChips = document.getElementById('categoryChips');
    const profileImageInput = document.getElementById('profileImage');
    const profileImagePreview = document.getElementById('profileImagePreview');

    if (!profileForm) return;

    const FALLBACK_PROFILE_CATEGORIES = [
        { name: '댄스', emoji: '💃' },
        { name: '사진', emoji: '📷' },
        { name: '요리', emoji: '🍳' },
        { name: '디자인', emoji: '🎨' },
        { name: '개발', emoji: '💻' },
        { name: '영상', emoji: '🎬' },
        { name: '마케팅', emoji: '📣' },
        { name: '비즈니스', emoji: '💼' },
        { name: '음악', emoji: '🎵' },
        { name: '공예', emoji: '🧵' },
        { name: '운동', emoji: '🏃' },
        { name: '언어', emoji: '🗣️' },
        { name: '글쓰기', emoji: '✍️' },
        { name: '교육', emoji: '📚' },
        { name: '기타', emoji: '✨' },
    ];

    let selectedCategories = [];

    function cacheSharedCategories(categories) {
        const normalized = Array.isArray(categories) && categories.length
            ? categories.map((item) => ({ ...item }))
            : FALLBACK_PROFILE_CATEGORIES.map((item) => ({ ...item }));
        window.__BSQ_MYPAGE_CACHE__ = {
            ...(window.__BSQ_MYPAGE_CACHE__ || {}),
            categories: normalized,
            categoriesUpdatedAt: Date.now(),
        };
        return normalized;
    }

    function normalizeCategories(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map((item) => ({
                name: String(item.name || '').trim(),
                emoji: String(item.emoji || '✨').trim() || '✨',
            }))
            .filter((item) => item.name);
    }

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function loadCategories() {
        const bootCache = window.__BSQ_MYPAGE_CACHE__ || {};
        if (Array.isArray(bootCache.categories) && bootCache.categories.length) {
            return bootCache.categories.map((item) => ({ ...item }));
        }

        if (!window.__BSQ_MYPAGE_CATEGORY_PROMISE__) {
            window.__BSQ_MYPAGE_CATEGORY_PROMISE__ = (async () => {
                try {
                    const res = await window.BSQ.api('/api/class-categories', { cacheBust: false });
                    if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                        return normalizeCategories(res.data);
                    }
                } catch (error) {
                    console.warn('[tab_profile] category load failed, using fallback:', error);
                }

                return FALLBACK_PROFILE_CATEGORIES.map((item) => ({ ...item }));
            })();
        }

        try {
            return cacheSharedCategories(await window.__BSQ_MYPAGE_CATEGORY_PROMISE__);
        } catch (error) {
            console.warn('[tab_profile] category load failed, using fallback:', error);
            return cacheSharedCategories(FALLBACK_PROFILE_CATEGORIES.map((item) => ({ ...item })));
        }
    }

    function mergeSelectedCategories(categories, selected) {
        const merged = [...categories];
        const known = new Set(merged.map((item) => item.name));
        (selected || []).forEach((name) => {
            const trimmed = String(name || '').trim();
            if (!trimmed || known.has(trimmed)) return;
            merged.push({ name: trimmed, emoji: '✨' });
            known.add(trimmed);
        });
        return merged;
    }

    function updateSelectedCategoriesFromDOM() {
        if (!categoryChips) return;
        selectedCategories = Array.from(categoryChips.querySelectorAll('.category-chip.active'))
            .map((chip) => String(chip.dataset.category || '').trim())
            .filter(Boolean);
    }

    async function refreshCategoryChips(selected = selectedCategories) {
        if (!categoryChips) return;
        const categories = mergeSelectedCategories(await loadCategories(), selected);
        const selectedSet = new Set((selected || []).map((value) => String(value || '').trim()).filter(Boolean));

        categoryChips.innerHTML = categories.map((item) => `
            <button type="button" class="category-chip${selectedSet.has(item.name) ? ' active' : ''}" data-category="${escapeHtml(item.name)}">
                ${escapeHtml(item.emoji)} ${escapeHtml(item.name)}
            </button>
        `).join('');
    }

    if (categoryChips) {
        categoryChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.category-chip');
            if (chip) {
                chip.classList.toggle('active');
                updateSelectedCategoriesFromDOM();
            }
        });
    }

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

                selectedCategories = String(data.preferred_category || '')
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                await refreshCategoryChips(selectedCategories);

                if (data.profile_image_url && profileImagePreview) {
                    profileImagePreview.innerHTML = `<img src="${data.profile_image_url}" alt="Profile">`;
                }

                updateSidebarUI(data.name, data.username);
            } else {
                const defaultName = user?.email?.split('@')[0] || '사용자';
                const nameEl = document.getElementById('profileName');
                const usernameEl = document.getElementById('profileUsername');
                if (nameEl) nameEl.value = defaultName;
                if (usernameEl) usernameEl.value = defaultName;
                selectedCategories = [];
                await refreshCategoryChips([]);
            }
        } catch (error) {
            console.warn('[tab_profile] profile load error:', error);
        }
    }

    if (!window.__BSQ_MYPAGE_PROFILE_SYNC_BOUND) {
        window.__BSQ_MYPAGE_PROFILE_SYNC_BOUND = true;
        window.addEventListener('bsq_sync', (event) => {
            if (event.detail?.type === 'class-categories') {
                refreshCategoryChips(selectedCategories).catch((error) => {
                    console.warn('[tab_profile] category refresh failed:', error);
                });
            }
        });
    }

    profileForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = profileForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = '저장 중...';
        }

        try {
            const activeChips = categoryChips
                ? Array.from(categoryChips.querySelectorAll('.category-chip.active')).map((c) => c.dataset.category)
                : selectedCategories;

            const updates = {
                name: document.getElementById('profileName')?.value || '',
                phone: document.getElementById('profilePhone')?.value || '',
                sns_link: document.getElementById('profileSns')?.value || '',
                preferred_category: activeChips.join(', '),
            };

            const imgEl = profileImagePreview?.querySelector('img');
            if (imgEl && imgEl.src) {
                updates.profile_image_url = imgEl.src;
            }

            const res = await window.BSQ.api(`/api/users/${userId}`, {
                method: 'PUT',
                body: JSON.stringify(updates),
            });

            if (res && res.success) {
                showMypageNotice?.('success', '프로필 저장 완료', '프로필 정보가 안전하게 저장되었습니다.');
                updateSidebarUI(updates.name, document.getElementById('profileUsername')?.value);
                selectedCategories = activeChips.map((value) => String(value || '').trim()).filter(Boolean);
            } else {
                throw new Error(res?.error || '저장에 실패했습니다.');
            }
        } catch (error) {
            console.error('[tab_profile] save error:', error);
            showMypageNotice?.('error', '프로필 저장 실패', error.message || '알 수 없는 오류');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = '기본 정보 저장';
            }
        }
    };

    function updateSidebarUI(name, username) {
        const nicknameEl = document.getElementById('displayNickname');
        const usernameEl = document.getElementById('displayUsername');
        if (nicknameEl) nicknameEl.textContent = (name || '사용자') + ' 님';
        if (usernameEl) usernameEl.textContent = 'ID: ' + (username || '-');
    }

    loadProfile();
};
