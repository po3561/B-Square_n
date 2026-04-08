window.initProfileTab = function (userId, user) {
    const profileForm = document.getElementById('profileForm');
    const categoryChips = document.getElementById('categoryChips');
    const profileImageInput = document.getElementById('profileImage');
    const profileImagePreview = document.getElementById('profileImagePreview');
    const profileReferrerCode = document.getElementById('profileReferrerCode');
    const referrerDisplayMode = String(profileReferrerCode?.dataset.referrerDisplay || 'code-only').trim().toLowerCase();

    function syncStoredUserProfile(patch) {
        try {
            const raw = localStorage.getItem('bsq_user');
            const current = raw ? JSON.parse(raw) : {};
            const next = { ...(current || {}), ...(patch || {}) };
            localStorage.setItem('bsq_user', JSON.stringify(next));
        } catch (error) {
            console.warn('[tab_profile] bsq_user sync failed:', error);
        }
    }

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

    const FALLBACK_REFERRER_GROUPS = [
        {
            label: '중부',
            options: [
                { value: 'aj001', label: '중부1' },
                { value: 'aj002', label: '중부2' },
                { value: 'aj003', label: '중부3' },
                { value: 'aj004', label: '중부4' },
                { value: 'aj005', label: '중부5' },
            ],
        },
        {
            label: '북부',
            options: [
                { value: 'ab001', label: '북부1' },
                { value: 'ab002', label: '북부2' },
                { value: 'ab003', label: '북부3' },
                { value: 'ab004', label: '북부4' },
                { value: 'ab005', label: '북부5' },
            ],
        },
        {
            label: '동부',
            options: [
                { value: 'ac001', label: '동부1' },
                { value: 'ac002', label: '동부2' },
                { value: 'ac003', label: '동부3' },
                { value: 'ac004', label: '동부4' },
                { value: 'ac005', label: '동부5' },
            ],
        },
        {
            label: '대학',
            options: [
                { value: 'as001', label: '대학1' },
                { value: 'as002', label: '대학2' },
                { value: 'as003', label: '대학3' },
                { value: 'as004', label: '대학4' },
            ],
        },
        {
            label: '행정',
            options: [
                { value: 'cs020', label: '행정' },
            ],
        },
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

    function invalidateCategoryCache() {
        const bootCache = window.__BSQ_MYPAGE_CACHE__ || {};
        if (bootCache.categories || bootCache.categoriesUpdatedAt) {
            const nextCache = { ...bootCache };
            delete nextCache.categories;
            delete nextCache.categoriesUpdatedAt;
            window.__BSQ_MYPAGE_CACHE__ = nextCache;
        }

        delete window.__BSQ_MYPAGE_CATEGORY_PROMISE__;
    }

    function normalizeCategories(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map((item) => ({
                name: String(item.name || '').trim(),
                emoji: String(item.emoji || '✨').trim() || '✨',
            }))
            .filter((item) => item.name);
    }

    function normalizeReferrerGroups(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map((group) => {
                const label = String(group?.label || group?.name || '').trim();
                const options = Array.isArray(group?.options) ? group.options : [];
                const normalizedOptions = options
                    .map((option) => {
                        const value = String(option?.value || option?.code || '').trim();
                        if (!value) return null;
                        return {
                            value,
                            label: String(option?.label || option?.name || '').trim() || value,
                        };
                    })
                    .filter(Boolean);

                return label && normalizedOptions.length
                    ? { label, options: normalizedOptions }
                    : null;
            })
            .filter(Boolean);
    }

    function ensureReferrerValue(value, label = '') {
        if (!profileReferrerCode) return;

        const normalizedValue = String(value || '').trim();
        if (!normalizedValue) {
            profileReferrerCode.value = '';
            return;
        }

        const currentOptions = Array.from(profileReferrerCode.options || []);
        const exists = currentOptions.some((option) => String(option.value || '').trim() === normalizedValue);

        if (!exists) {
            const customOption = document.createElement('option');
            customOption.value = normalizedValue;
            customOption.textContent = normalizedValue;
            customOption.dataset.referrerLabel = label || '직접 선택';
            customOption.title = label ? `${label} · ${normalizedValue}` : normalizedValue;
            profileReferrerCode.appendChild(customOption);
        }

        profileReferrerCode.value = normalizedValue;
    }

    function renderReferrerOptions(groups, source = 'database') {
        if (!profileReferrerCode) return;

        const currentValue = String(profileReferrerCode.value || '').trim();
        const safeGroups = normalizeReferrerGroups(groups);
        const fragment = document.createDocumentFragment();

        profileReferrerCode.innerHTML = '';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = '추천인 코드를 선택해 주세요';
        placeholder.selected = !currentValue;
        fragment.appendChild(placeholder);

        const displayMode = referrerDisplayMode || 'code-only';
        for (const group of (safeGroups.length ? safeGroups : normalizeReferrerGroups(FALLBACK_REFERRER_GROUPS))) {
            const optgroup = document.createElement('optgroup');
            optgroup.label = group.label;

            for (const option of group.options) {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = displayMode === 'label-code'
                    ? `${group.label} · ${option.value}`
                    : option.value;
                opt.dataset.referrerLabel = group.label;
                opt.dataset.referrerName = option.label;
                opt.title = `${group.label} · ${option.label} · ${option.value}`;
                optgroup.appendChild(opt);
            }

            fragment.appendChild(optgroup);
        }

        profileReferrerCode.appendChild(fragment);
        profileReferrerCode.disabled = false;
        setReferrerStatus(
            source === 'database'
                ? '추천인 코드 목록을 불러왔습니다.'
                : '기본 추천인 코드 목록을 표시합니다.',
            'info',
        );

        if (currentValue) {
            ensureReferrerValue(currentValue);
        } else {
            profileReferrerCode.value = '';
        }
    }

    async function loadReferrerOptions() {
        if (!window.__BSQ_MYPAGE_REFERRER_PROMISE__) {
            window.__BSQ_MYPAGE_REFERRER_PROMISE__ = (async () => {
                try {
                    const res = await window.BSQ.api('/api/auth/referrer-codes');
                    if (res && res.success && res.data && Array.isArray(res.data.groups)) {
                        return {
                            groups: normalizeReferrerGroups(res.data.groups),
                            source: res.data.source || 'database',
                        };
                    }
                } catch (error) {
                    console.warn('[tab_profile] referrer load failed, using fallback:', error);
                }

                return {
                    groups: normalizeReferrerGroups(FALLBACK_REFERRER_GROUPS),
                    source: 'fallback',
                };
            })();
        }

        return window.__BSQ_MYPAGE_REFERRER_PROMISE__;
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
                    const res = await window.BSQ.api('/api/class-categories');
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
            const referrerData = await loadReferrerOptions();
            renderReferrerOptions(referrerData.groups, referrerData.source);

            const res = await window.BSQ.api(`/api/users/${userId}`);
            if (res && res.success && res.data) {
                const data = res.data;
                const nameEl = document.getElementById('profileName');
                const phoneEl = document.getElementById('profilePhone');
                const usernameEl = document.getElementById('profileUsername');
                const snsEl = document.getElementById('profileSns');
                const referrerEl = document.getElementById('profileReferrerCode');

                if (nameEl) nameEl.value = data.name || '';
                if (phoneEl) phoneEl.value = data.phone || '';
                if (usernameEl) usernameEl.value = data.username || '';
                if (snsEl) snsEl.value = data.sns_link || '';
                if (referrerEl) ensureReferrerValue(data.referrer_code || '', data.referrer_name || '');

                selectedCategories = String(data.preferred_category || '')
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean);
                await refreshCategoryChips(selectedCategories);

                if (data.profile_image_url && profileImagePreview) {
                    profileImagePreview.innerHTML = `<img src="${escapeHtml(data.profile_image_url)}" alt="Profile">`;
                }

                updateSidebarUI(data);
            } else {
                const defaultName = user?.email?.split('@')[0] || '사용자';
                const nameEl = document.getElementById('profileName');
                const usernameEl = document.getElementById('profileUsername');
                if (nameEl) nameEl.value = defaultName;
                if (usernameEl) usernameEl.value = defaultName;
                if (profileReferrerCode) profileReferrerCode.value = '';
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
                invalidateCategoryCache();
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
                username: document.getElementById('profileUsername')?.value || '',
                sns_link: document.getElementById('profileSns')?.value || '',
                referrer_code: document.getElementById('profileReferrerCode')?.value || '',
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
                if (res.data) {
                    syncStoredUserProfile({
                        name: res.data.name || updates.name,
                        phone: res.data.phone || updates.phone,
                        username: res.data.username || updates.username,
                        email: res.data.email || user?.email || '',
                        sns_link: res.data.sns_link || updates.sns_link,
                        referrer_code: res.data.referrer_code || updates.referrer_code,
                        preferred_category: res.data.preferred_category || updates.preferred_category,
                        profile_image_url: res.data.profile_image_url || updates.profile_image_url || '',
                    });
                }
                showMypageNotice?.('success', '프로필 저장 완료', '프로필 정보가 안전하게 저장되었습니다.');
                updateSidebarUI({
                    ...(res.data || {}),
                    ...updates,
                    email: res.data?.email || user?.email || '',
                });
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

    function updateSidebarUI(profileOrName, username) {
        const profile = profileOrName && typeof profileOrName === 'object'
            ? profileOrName
            : { name: profileOrName, username };
        const nicknameEl = document.getElementById('displayNickname');
        const usernameEl = document.getElementById('displayUsername');
        const displayLabel = profile.name || profile.username || '사용자';
        if (nicknameEl) nicknameEl.textContent = displayLabel + ' 님';
        if (document.getElementById('displayName')) document.getElementById('displayName').textContent = displayLabel;
        if (usernameEl) usernameEl.textContent = 'ID: ' + (profile.username || username || '-');
        window.updateDashboardProfileCard?.(profile, { guest: false, isOperatorEligible: false });
    }

    loadProfile();
};
