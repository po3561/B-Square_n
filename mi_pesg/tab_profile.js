window.initProfileTab = function (userId, user) {
    const profileForm = document.getElementById('profileForm');
    const categoryChips = document.getElementById('categoryChips');
    const profileImageInput = document.getElementById('profileImage');
    const profileImagePreview = document.getElementById('profileImagePreview');
    const profileReferrerCode = document.getElementById('profileReferrerCode');
    const referrerDisplayMode = String(profileReferrerCode?.dataset.referrerDisplay || 'code-only').trim().toLowerCase();

    function syncStoredUserProfile(patch) {
        try {
            const currentSession = window.BSQ?.session || null;
            const currentUser = currentSession?.user && typeof currentSession.user === 'object'
                ? currentSession.user
                : null;
            const raw = localStorage.getItem('bsq_user');
            const current = raw ? JSON.parse(raw) : {};
            const next = {
                ...(current || {}),
                ...(currentUser || {}),
                ...(patch || {}),
            };

            if (currentUser) {
                Object.assign(currentUser, next);
            }

            localStorage.setItem('bsq_user', JSON.stringify(next));
            window.dispatchEvent(new CustomEvent('bsq_session', {
                detail: {
                    reason: 'profile-update',
                    session: currentSession,
                    user: currentUser || next,
                    timestamp: Date.now(),
                },
            }));
        } catch (error) {
            console.warn('[tab_profile] bsq_user sync failed:', error);
        }
    }

    function normalizeUserProfile(payload) {
        const source = payload && typeof payload === 'object'
            ? (payload.user && typeof payload.user === 'object'
                ? { ...payload.user, ...payload }
                : { ...payload })
            : {};

        const email = String(source.email || source.email_address || '').trim();
        const name = String(source.name || source.display_name || source.nickname || source.full_name || '').trim();
        const username = String(source.username || source.user_name || source.handle || '').trim();
        const phone = String(source.phone || source.mobile || source.tel || '').trim();
        const snsLink = String(source.sns_link || source.snsLink || source.instagram || source.instagram_url || '').trim();
        const referrerCode = String(source.referrer_code || source.referrerCode || source.referrer || '').trim();
        const referrerName = String(source.referrer_name || source.referrerName || '').trim();
        const preferredCategory = Array.isArray(source.preferred_category)
            ? source.preferred_category.map((value) => String(value || '').trim()).filter(Boolean).join(', ')
            : String(source.preferred_category || source.preferredCategory || source.categories || '').trim();
        const profileImageUrl = String(source.profile_image_url || source.profileImageUrl || source.avatar_url || source.avatarUrl || '').trim();

        return {
            ...source,
            email,
            name,
            username,
            phone,
            sns_link: snsLink,
            referrer_code: referrerCode,
            referrer_name: referrerName,
            preferred_category: preferredCategory,
            profile_image_url: profileImageUrl,
        };
    }

    function readStoredUserProfile() {
        try {
            const raw = localStorage.getItem('bsq_user');
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            console.warn('[tab_profile] stored user parse failed:', error);
            return {};
        }
    }

    function mergeProfileSnapshot(...sources) {
        const merged = {};

        for (const source of sources) {
            const normalized = normalizeUserProfile(source);
            Object.entries(normalized).forEach(([key, value]) => {
                if (value === '' || value == null) return;
                merged[key] = value;
            });
        }

        const emailLocalPart = merged.email ? String(merged.email).split('@')[0] : '';
        if (!merged.name) merged.name = merged.username || emailLocalPart || '사용자';
        if (!merged.username) merged.username = emailLocalPart || merged.name || 'user';
        if (!merged.email && user?.email) merged.email = String(user.email || '').trim();

        return merged;
    }

    function updateProfileSummaryUI(profile = {}) {
        const summaryNameEl = document.getElementById('profileSummaryName');
        const summaryEmailEl = document.getElementById('profileSummaryEmail');
        const summaryUsernameEl = document.getElementById('profileSummaryUsername');
        const summaryPhoneEl = document.getElementById('profileSummaryPhone');
        const summaryReferrerEl = document.getElementById('profileSummaryReferrer');
        const summaryCategoriesEl = document.getElementById('profileSummaryCategories');

        const displayName = profile.name || profile.username || user?.name || user?.username || '사용자';
        const emailLabel = profile.email || user?.email || '이메일 정보가 자동으로 채워집니다.';
        const usernameLabel = profile.username || user?.username || user?.email?.split('@')[0] || '-';
        const phoneLabel = profile.phone || '미입력';
        const referrerLabel = String(profile.referrer_code || profile.referrerCode || '').trim();
        const referrerNameLabel = String(profile.referrer_name || profile.referrerName || '').trim();
        const categoryLabel = String(profile.preferred_category || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
            .join(' · ') || '미선택';

        if (summaryNameEl) summaryNameEl.textContent = displayName;
        if (summaryEmailEl) summaryEmailEl.textContent = emailLabel;
        if (summaryUsernameEl) summaryUsernameEl.textContent = usernameLabel;
        if (summaryPhoneEl) summaryPhoneEl.textContent = phoneLabel;
        if (summaryReferrerEl) summaryReferrerEl.textContent = referrerLabel ? `${referrerLabel}${referrerNameLabel ? ` · ${referrerNameLabel}` : ''}` : '미선택';
        if (summaryCategoriesEl) summaryCategoriesEl.textContent = categoryLabel;
    }

    async function applyProfileSnapshotToForm(profile) {
        const nameEl = document.getElementById('profileName');
        const phoneEl = document.getElementById('profilePhone');
        const usernameEl = document.getElementById('profileUsername');
        const snsEl = document.getElementById('profileSns');
        const referrerEl = document.getElementById('profileReferrerCode');

        if (nameEl) nameEl.value = profile.name || '';
        if (phoneEl) phoneEl.value = profile.phone || '';
        if (usernameEl) usernameEl.value = profile.username || '';
        if (snsEl) snsEl.value = profile.sns_link || '';
        if (referrerEl) ensureReferrerValue(profile.referrer_code || '', profile.referrer_name || '');

        selectedCategories = String(profile.preferred_category || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

        await refreshCategoryChips(selectedCategories);
        renderProfileImagePreview(profile.profile_image_url || '');
        updateProfileSummaryUI(profile);
    }

    if (!profileForm) return;

    function renderProfileImagePreview(imageUrl) {
        if (!profileImagePreview) return;
        const safeImageUrl = String(imageUrl || '').trim();
        profileImagePreview.innerHTML = safeImageUrl
            ? `<img src="${escapeHtml(safeImageUrl)}" alt="Profile preview">`
            : '<span class="placeholder-icon">👤</span>';
        profileImagePreview.insertAdjacentHTML('beforeend', `
            <label for="profileImage" class="profile-image-camera" aria-label="프로필 사진 변경">
                <i class="fa-solid fa-camera" aria-hidden="true"></i>
            </label>
        `);
    }

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
            label: '추천코드 그룹 A',
            options: [
                { value: 'aj001', label: '추천코드 01' },
                { value: 'aj002', label: '추천코드 02' },
                { value: 'aj003', label: '추천코드 03' },
                { value: 'aj004', label: '추천코드 04' },
                { value: 'aj005', label: '추천코드 05' },
            ],
        },
        {
            label: '추천코드 그룹 B',
            options: [
                { value: 'ab001', label: '추천코드 06' },
                { value: 'ab002', label: '추천코드 07' },
                { value: 'ab003', label: '추천코드 08' },
                { value: 'ab004', label: '추천코드 09' },
                { value: 'ab005', label: '추천코드 10' },
            ],
        },
        {
            label: '추천코드 그룹 C',
            options: [
                { value: 'ac001', label: '추천코드 11' },
                { value: 'ac002', label: '추천코드 12' },
                { value: 'ac003', label: '추천코드 13' },
                { value: 'ac004', label: '추천코드 14' },
                { value: 'ac005', label: '추천코드 15' },
            ],
        },
        {
            label: '추천코드 그룹 D',
            options: [
                { value: 'as001', label: '추천코드 16' },
                { value: 'as002', label: '추천코드 17' },
                { value: 'as003', label: '추천코드 18' },
                { value: 'as004', label: '추천코드 19' },
            ],
        },
        {
            label: '추천코드 그룹 E',
            options: [
                { value: 'cs020', label: '추천코드 20' },
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
            customOption.dataset.referrerLabel = '';
            customOption.dataset.referrerName = label || '';
            customOption.title = normalizedValue;
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

        const seenValues = new Set();
        for (const group of (safeGroups.length ? safeGroups : normalizeReferrerGroups(FALLBACK_REFERRER_GROUPS))) {
            const options = Array.isArray(group?.options) ? group.options : [];
            for (const option of options) {
                const value = String(option.value || '').trim();
                if (!value || seenValues.has(value)) continue;
                seenValues.add(value);
                const opt = document.createElement('option');
                opt.value = value;
                opt.textContent = value;
                opt.dataset.referrerLabel = '';
                opt.dataset.referrerName = String(option.label || '').trim();
                opt.title = value;
                fragment.appendChild(opt);
            }
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
                    renderProfileImagePreview(event.target.result);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    async function loadProfile() {
        try {
            const referrerData = await loadReferrerOptions();
            renderReferrerOptions(referrerData.groups, referrerData.source);

            const seedProfile = mergeProfileSnapshot(
                readStoredUserProfile(),
                window.BSQ?.session?.user,
                user,
            );

            let apiProfile = {};
            try {
                const res = await window.BSQ.api(`/api/users/${userId}`);
                if (res && res.success && res.data) {
                    apiProfile = normalizeUserProfile(res.data);
                }
            } catch (error) {
                console.warn('[tab_profile] profile load error:', error);
            }

            const resolvedProfile = mergeProfileSnapshot(seedProfile, apiProfile);
            await applyProfileSnapshotToForm(resolvedProfile);
            updateSidebarUI(resolvedProfile);
        } catch (error) {
            console.warn('[tab_profile] profile load error:', error);
            const fallbackProfile = mergeProfileSnapshot(
                readStoredUserProfile(),
                window.BSQ?.session?.user,
                user,
            );
            await applyProfileSnapshotToForm(fallbackProfile);
            updateSidebarUI(fallbackProfile);
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
                const savedProfile = normalizeUserProfile(res.data);
                const nextProfile = {
                    ...savedProfile,
                    ...updates,
                    email: savedProfile.email || user?.email || '',
                };
                showMypageNotice?.('success', '프로필 저장 완료', '프로필 정보가 안전하게 저장되었습니다.');
                await applyProfileSnapshotToForm(mergeProfileSnapshot(nextProfile));
                updateSidebarUI(nextProfile);
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
        updateProfileSummaryUI(profile);
        const nicknameEl = document.getElementById('displayNickname');
        const displayNameEl = document.getElementById('displayName');
        const emailEl = document.getElementById('displayEmail');
        const usernameEl = document.getElementById('displayUsername');
        const referrerCodeEl = document.getElementById('displayReferrerCode');
        const profileImgEl = document.getElementById('profileImg');
        const displayLabel = profile.name || profile.username || user?.name || user?.username || '사용자';
        const emailLabel = profile.email || user?.email || '';
        const referrerLabel = String(profile.referrer_code || profile.referrerCode || '').trim();
        if (nicknameEl) nicknameEl.textContent = displayLabel + ' 님';
        if (displayNameEl) displayNameEl.textContent = displayLabel;
        if (emailEl) emailEl.textContent = emailLabel;
        if (usernameEl) usernameEl.textContent = 'ID: ' + (profile.username || username || '-');
        if (referrerCodeEl) {
            if (referrerLabel) {
                referrerCodeEl.hidden = false;
                referrerCodeEl.textContent = `추천인 코드: ${referrerLabel}`;
            } else {
                referrerCodeEl.hidden = true;
                referrerCodeEl.textContent = '';
            }
        }
        if (profileImgEl) {
            const imageUrl = String(profile.profile_image_url || '').trim();
            if (imageUrl) {
                profileImgEl.style.backgroundImage = `url("${imageUrl.replace(/"/g, '%22')}")`;
                profileImgEl.style.backgroundSize = 'cover';
                profileImgEl.style.backgroundPosition = 'center';
                profileImgEl.textContent = '';
            } else {
                profileImgEl.style.backgroundImage = '';
                profileImgEl.textContent = '👤';
            }
        }
        syncStoredUserProfile(profile);
        window.updateDashboardProfileCard?.(profile, { guest: false, isOperatorEligible: false });
    }

    loadProfile();
};
