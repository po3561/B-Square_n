window.initClassesTab = function initClassesTab(_db, userId) {
    const FALLBACK_CLASS_CATEGORIES = [
        { name: '라이프스타일', emoji: '✨' },
        { name: '창작', emoji: '🎨' },
        { name: '운동', emoji: '🏃' },
        { name: '공예', emoji: '🧵' },
        { name: '디자인', emoji: '🖌️' },
        { name: '스포츠', emoji: '⚽' },
        { name: '음악', emoji: '🎵' },
        { name: '여행', emoji: '✈️' },
        { name: '비즈니스', emoji: '💼' },
        { name: '교육', emoji: '📚' },
    ];

    const createdTargets = [
        document.getElementById('dashboardCreatedClasses'),
        document.getElementById('tabCreatedClasses'),
    ].filter(Boolean);
    const enrolledTargets = [
        document.getElementById('dashboardEnrolledClasses'),
        document.getElementById('tabEnrolledClasses'),
    ].filter(Boolean);

    const dashboardCouponWallet = document.getElementById('dashboardCouponWallet');
    const couponWalletList = document.getElementById('couponWalletList');
    const cartCouponWallet = document.getElementById('cartCouponWallet');
    const dashboardCartItems = document.getElementById('dashboardCartItems');
    const cartItemList = document.getElementById('cartItemList');
    const couponCodeInput = document.getElementById('mypageCouponCode');
    const couponClaimMessage = document.getElementById('mypageCouponClaimMessage');

    const LOCAL_CART_KEY = `bsq-cart:${userId}`;
    const commerceState = {
        wallet: [],
        cart: [],
    };

    let categoryCache = [...FALLBACK_CLASS_CATEGORIES];
    let categoryCacheLoaded = false;

    function getMypageBootCache() {
        return window.__BSQ_MYPAGE_CACHE__ || {};
    }

    function cacheSharedCategories(categories) {
        const normalized = Array.isArray(categories) && categories.length
            ? categories.map((item) => ({ ...item }))
            : [...FALLBACK_CLASS_CATEGORIES];
        categoryCache = normalized;
        categoryCacheLoaded = true;
        window.__BSQ_MYPAGE_CACHE__ = {
            ...(window.__BSQ_MYPAGE_CACHE__ || {}),
            categories: normalized,
            categoriesUpdatedAt: Date.now(),
        };
        return categoryCache;
    }

    async function fetchSharedCategories() {
        try {
            const res = await window.BSQ.api('/api/class-categories', { cacheBust: false });
            if (res?.success && Array.isArray(res.data) && res.data.length) {
                return cacheSharedCategories(normalizeCategories(res.data));
            }
        } catch (error) {
            console.warn('[mypage] category load fallback:', error);
        }
        return cacheSharedCategories([...FALLBACK_CLASS_CATEGORIES]);
    }

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function safeJsonParse(value, fallback) {
        if (value == null) return fallback;
        if (typeof value !== 'string') return value;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }

    function formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('ko-KR');
    }

    function formatMoney(value) {
        const amount = Number(value || 0);
        return `${amount.toLocaleString('ko-KR')}원`;
    }

    function emptyState(message) {
        return `<div class="empty-state compact">${escapeHtml(message)}</div>`;
    }

    function normalizeCategories(rows) {
        return (Array.isArray(rows) ? rows : [])
            .map((item) => ({
                name: String(item?.name || '').trim(),
                emoji: String(item?.emoji || '🏷️').trim() || '🏷️',
            }))
            .filter((item) => item.name);
    }

    async function loadCategories(force = false) {
        const bootCache = getMypageBootCache();
        if (!force && Array.isArray(bootCache.categories) && bootCache.categories.length) {
            categoryCache = bootCache.categories.map((item) => ({ ...item }));
            categoryCacheLoaded = true;
            return categoryCache;
        }
        if (!force && categoryCacheLoaded) return categoryCache;

        if (force || !window.__BSQ_MYPAGE_CATEGORY_PROMISE__) {
            window.__BSQ_MYPAGE_CATEGORY_PROMISE__ = fetchSharedCategories();
        }

        try {
            return await window.__BSQ_MYPAGE_CATEGORY_PROMISE__;
        } catch (error) {
            console.warn('[mypage] category load fallback:', error);
            return cacheSharedCategories([...FALLBACK_CLASS_CATEGORIES]);
        }
    }

    function buildCategoryOptions(selected = '') {
        const selectedValue = String(selected || '').trim();
        const merged = [...categoryCache];
        if (selectedValue && !merged.some((item) => item.name === selectedValue)) {
            merged.push({ name: selectedValue, emoji: '🏷️' });
        }
        return merged
            .map((item) => `<option value="${escapeHtml(item.name)}" ${item.name === selectedValue ? 'selected' : ''}>${escapeHtml(item.emoji)} ${escapeHtml(item.name)}</option>`)
            .join('');
    }

    async function renderEditCategoryOptions(selected = '', forceRefresh = false) {
        const select = document.getElementById('editClassCategory');
        if (!select) return;
        await loadCategories(forceRefresh);
        select.innerHTML = buildCategoryOptions(selected || select.value || '');
        if (selected) select.value = selected;
    }

    function getLocalCartItems() {
        return safeJsonParse(localStorage.getItem(LOCAL_CART_KEY), []) || [];
    }

    function setLocalCartItems(items) {
        localStorage.setItem(LOCAL_CART_KEY, JSON.stringify(items));
    }

    function normalizeWalletItems(payload) {
        const rows = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload)
                    ? payload
                    : [];
        return rows.map((item) => ({
            id: item.id || item.wallet_id || item.claim_id || item.code,
            code: item.code || item.coupon_code || '',
            name: item.name || item.title || item.coupon_name || '이벤트 쿠폰',
            description: item.description || '',
            discountLabel: item.discount_label || item.benefit_label || item.summary || '',
            imageUrl: item.image_url || item.imageUrl || '',
            expiresAt: item.expires_at || item.expiresAt || '',
            minOrderAmount: Number(item.min_order_amount || item.minOrderAmount || 0),
            status: item.status || (item.is_used ? 'used' : 'available'),
        }));
    }

    function normalizeCartItems(payload) {
        const rows = Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload)
                    ? payload
                    : [];
        return rows.map((item) => {
            const referenceId = item.reference_id || item.referenceId || item.class_id || item.content_id || item.item_id || '';
            const rowId = item.id || item.cart_id || item.row_id || '';
            const title = item.title || item.class_title || item.name || '이름 없는 항목';
            const subtitle = item.subtitle || item.instructor_name || item.class_category || item.category || '';
            const price = Number(item.sale_price || item.class_price || item.list_price || item.price || item.amount || item.final_amount || 0);
            const imageUrl = item.thumbnail_url || item.class_image_url || item.image_url || item.thumbnail || item.thumb || '';
            const href = item.href || item.url || (referenceId || item.class_id ? `../class_view/class_view.html?id=${encodeURIComponent(referenceId || item.class_id)}` : '');

            return {
                id: referenceId || rowId || `${item.item_type || item.type || 'item'}-${title || ''}`,
                itemId: referenceId || item.class_id || item.content_id || item.item_id || rowId || '',
                referenceId,
                rowId,
                type: item.item_type || item.type || 'class',
                title,
                subtitle,
                price,
                imageUrl,
                href,
                createdAt: item.created_at || item.added_at || item.saved_at || item.updated_at || '',
            };
        });
    }

    async function requestWithFallbacks(requests, options = {}) {
        let lastError = null;
        for (const request of requests) {
            try {
                const response = await window.BSQ.api(request.url, {
                    method: request.method || options.method || 'GET',
                    body: request.body !== undefined ? request.body : options.body,
                    cacheBust: options.cacheBust ?? false,
                });
                if (response?.success === false) {
                    throw new Error(response.error || 'request failed');
                }
                return response;
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError || new Error('request failed');
    }

    function buildWalletRender(items, compact = false) {
        if (!items.length) return emptyState('보유 중인 쿠폰이 없습니다.');
        const limited = compact ? items.slice(0, 3) : items;
        return limited.map((item) => `
            <article class="wallet-coupon-card ${item.status !== 'available' ? 'is-muted' : ''}">
                <div class="wallet-coupon-media"${item.imageUrl ? ` style="background-image:url('${escapeHtml(item.imageUrl)}')"` : ''}>
                    ${item.imageUrl ? '' : '<span>COUPON</span>'}
                </div>
                <div class="wallet-coupon-body">
                    <div class="wallet-coupon-top">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span class="wallet-coupon-code">${escapeHtml(item.code)}</span>
                    </div>
                    <p>${escapeHtml(item.discountLabel || item.description || '이벤트 혜택 쿠폰')}</p>
                    <div class="wallet-coupon-meta">
                        <span>만료일 ${escapeHtml(formatDate(item.expiresAt))}</span>
                        <span>${item.minOrderAmount > 0 ? `${escapeHtml(formatMoney(item.minOrderAmount))} 이상` : '금액 제한 없음'}</span>
                    </div>
                </div>
            </article>
        `).join('');
    }

    function buildCartRender(items, compact = false) {
        if (!items.length) return emptyState('장바구니에 담긴 항목이 없습니다.');
        const limited = compact ? items.slice(0, 3) : items;
        return limited.map((item) => `
            <article class="cart-item-card">
                <div class="cart-item-thumb"${item.imageUrl ? ` style="background-image:url('${escapeHtml(item.imageUrl)}')"` : ''}>
                    ${item.imageUrl ? '' : '<span>ITEM</span>'}
                </div>
                <div class="cart-item-body">
                    <div class="cart-item-head">
                        <div>
                            <strong>${escapeHtml(item.title)}</strong>
                            <p>${escapeHtml(item.subtitle || (item.type === 'content' ? '컨텐츠' : '클래스'))}</p>
                        </div>
                        <span class="cart-item-price">${escapeHtml(formatMoney(item.price))}</span>
                    </div>
                    <div class="cart-item-actions">
                        ${item.href ? `<button type="button" class="btn-chat-link" onclick="location.href='${escapeHtml(item.href)}'">바로 보기</button>` : ''}
                        <button type="button" class="btn-chat-link subtle" data-cart-remove="${escapeHtml(item.id)}">삭제</button>
                    </div>
                </div>
            </article>
        `).join('');
    }

    function attachCartRemoveEvents(root) {
        root?.querySelectorAll('[data-cart-remove]').forEach((button) => {
            button.addEventListener('click', async () => {
                await removeCartItem(button.dataset.cartRemove);
            });
        });
    }

    async function loadCouponWallet() {
        try {
            const response = await requestWithFallbacks([
                { url: '/api/user/coupons' },
            ]);
            commerceState.wallet = normalizeWalletItems(response);
        } catch (error) {
            console.warn('[mypage] wallet load failed:', error);
            commerceState.wallet = [];
        }

        const compactMarkup = buildWalletRender(commerceState.wallet, true);
        const fullMarkup = buildWalletRender(commerceState.wallet, false);
        if (dashboardCouponWallet) dashboardCouponWallet.innerHTML = compactMarkup;
        if (couponWalletList) couponWalletList.innerHTML = fullMarkup;
        if (cartCouponWallet) cartCouponWallet.innerHTML = fullMarkup;
    }

    async function claimCoupon() {
        const code = couponCodeInput?.value.trim().toUpperCase();
        if (!code) {
            if (couponClaimMessage) {
                couponClaimMessage.textContent = '쿠폰 코드를 입력해주세요.';
                couponClaimMessage.className = 'commerce-message error';
            }
            return;
        }

        try {
            const response = await requestWithFallbacks([
                {
                    url: '/api/user/coupons/claim',
                    method: 'POST',
                    body: { code },
                },
            ], { method: 'POST' });

            if (couponClaimMessage) {
                couponClaimMessage.textContent = response?.message || '쿠폰이 등록되었습니다.';
                couponClaimMessage.className = 'commerce-message success';
            }
            if (couponCodeInput) couponCodeInput.value = '';
            await loadCouponWallet();
            if (window.BSQ?.triggerSync) window.BSQ.triggerSync('coupon_wallet');
        } catch (error) {
            if (couponClaimMessage) {
                couponClaimMessage.textContent = error.message || '쿠폰 등록 중 오류가 발생했습니다.';
                couponClaimMessage.className = 'commerce-message error';
            }
        }
    }

    async function loadCartItems() {
        try {
            const response = await requestWithFallbacks([
                { url: '/api/cart' },
            ]);
            commerceState.cart = normalizeCartItems(response);
            setLocalCartItems(commerceState.cart);
        } catch (error) {
            console.warn('[mypage] cart load fallback:', error);
            commerceState.cart = normalizeCartItems(getLocalCartItems());
        }

        const compactMarkup = buildCartRender(commerceState.cart, true);
        const fullMarkup = buildCartRender(commerceState.cart, false);

        if (dashboardCartItems) {
            dashboardCartItems.innerHTML = compactMarkup;
            attachCartRemoveEvents(dashboardCartItems);
        }
        if (cartItemList) {
            cartItemList.innerHTML = fullMarkup;
            attachCartRemoveEvents(cartItemList);
        }
    }

    async function removeCartItem(cartId) {
        let removed = false;
        try {
            await requestWithFallbacks([
                { url: `/api/cart?id=${encodeURIComponent(cartId)}`, method: 'DELETE' },
            ], { method: 'DELETE' });
            removed = true;
        } catch (error) {
            console.warn('[mypage] remote cart remove fallback:', error);
        }

        if (!removed) {
            const items = getLocalCartItems().filter((item) => {
                const itemKey = item.referenceId || item.reference_id || item.class_id || item.id || item.cart_id;
                return String(itemKey) !== String(cartId);
            });
            setLocalCartItems(items);
        }

        await loadCartItems();
        if (window.BSQ?.triggerSync) window.BSQ.triggerSync('cart');
    }

    async function refreshCommercePanels() {
        await Promise.all([loadCouponWallet(), loadCartItems()]);
    }

    function renderCreatedClasses(items) {
        const html = items.length
            ? items.map((cls) => `
                <div class="my-class-card" id="card-${escapeHtml(cls.id)}">
                    <div class="class-thumb ${!cls.image_url ? 'placeholder-orange' : ''}">
                        ${cls.image_url ? `<img src="${escapeHtml(cls.image_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" alt="">` : ''}
                    </div>
                    <div class="class-info">
                        <h4>${escapeHtml(cls.title || '제목 없음')}</h4>
                        <p>${escapeHtml(cls.category || '미분류')} | ${escapeHtml(cls.class_type || 'VOD')}</p>
                        <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
                            <button class="btn-chat-link" onclick="openEditTab('${escapeHtml(cls.id)}')">정보 관리</button>
                            <button class="btn-chat-link" style="background:rgba(255,255,255,0.05);" onclick="location.href='../class_view/class_view.html?id=${escapeHtml(cls.id)}'">미리보기</button>
                            <button class="btn-chat-link subtle-danger" onclick="deleteMyClass('${escapeHtml(cls.id)}', '${escapeHtml(String(cls.title || '').replace(/'/g, "\\'"))}')">삭제</button>
                        </div>
                    </div>
                </div>
            `).join('')
            : emptyState('아직 등록한 클래스가 없습니다.');

        createdTargets.forEach((target) => {
            target.innerHTML = html;
        });
    }

    function renderEnrolledClasses(enrollments, passes) {
        let totalPasses = 0;
        const html = enrollments.length
            ? enrollments.map((enroll) => {
                const myPasses = passes.filter((item) => item.class_id === enroll.class_id);
                const passBadges = myPasses.map((item) => {
                    if (Number(item.remaining_count || 0) > 0) {
                        totalPasses += Number(item.remaining_count || 0);
                        return `<span class="commerce-badge accent">수강권 ${escapeHtml(String(item.remaining_count))}개 보유</span>`;
                    }
                    if (String(item.pass_type || '').toLowerCase() === 'monthly' && item.status === 'active') {
                        return '<span class="commerce-badge warm">정기 구독 중</span>';
                    }
                    return '';
                }).join('');

                return `
                    <div class="my-class-card">
                        <div class="class-thumb ${!enroll.image_url ? 'placeholder-orange' : ''}">
                            ${enroll.image_url ? `<img src="${escapeHtml(enroll.image_url)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" alt="">` : ''}
                        </div>
                        <div class="class-info">
                            <h4 style="margin-bottom:4px;">${escapeHtml(enroll.title || '제목 없음')}</h4>
                            <p style="font-size:0.9rem; color:#888; margin-bottom:8px;">${escapeHtml(enroll.category || '기타')} | 수강일 ${escapeHtml(formatDate(enroll.enrolled_at || enroll.created_at))}</p>
                            <div style="margin-bottom:12px; display:flex; gap:8px; flex-wrap:wrap;">${passBadges}</div>
                            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                                <button class="btn-chat-link" onclick="location.href='../class_view/class_view.html?id=${escapeHtml(enroll.class_id)}'">학습 페이지</button>
                                <button class="btn-chat-link" style="background:rgba(255,255,255,0.05);" onclick="location.href='../class_view/class_view.html?id=${escapeHtml(enroll.class_id)}#tabChat'">채널</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')
            : emptyState('수강 중인 클래스가 없습니다.');

        const passCountEl = document.getElementById('dashPassCount');
        const classCountEl = document.getElementById('dashClassCount');
        if (passCountEl) passCountEl.textContent = `${totalPasses.toLocaleString('ko-KR')}개`;
        if (classCountEl) classCountEl.textContent = `${enrollments.length.toLocaleString('ko-KR')}개`;

        enrolledTargets.forEach((target) => {
            target.innerHTML = html;
        });
    }

    window.loadMyClasses = async function loadMyClasses(forceRefresh = false) {
        createdTargets.forEach((target) => {
            target.innerHTML = emptyState('클래스를 불러오는 중입니다.');
        });

        try {
            if (!forceRefresh) {
                const bootCache = getMypageBootCache();
                if (bootCache.userId === userId && Array.isArray(bootCache.myClasses)) {
                    renderCreatedClasses(bootCache.myClasses);
                    return;
                }

                if (window.__BSQ_MYPAGE_BOOT_PROMISE__) {
                    await window.__BSQ_MYPAGE_BOOT_PROMISE__;
                    const readyCache = getMypageBootCache();
                    if (readyCache.userId === userId && Array.isArray(readyCache.myClasses)) {
                        renderCreatedClasses(readyCache.myClasses);
                        return;
                    }
                }
            }

            const res = await window.BSQ.api(`/api/classes?instructor_id=${encodeURIComponent(userId)}`);
            const data = res?.success ? (res.data || []) : [];
            window.__BSQ_MYPAGE_CACHE__ = {
                ...(window.__BSQ_MYPAGE_CACHE__ || {}),
                userId,
                myClasses: data,
                updatedAt: Date.now(),
            };
            renderCreatedClasses(data);
        } catch (error) {
            console.error('[mypage] loadMyClasses failed:', error);
            createdTargets.forEach((target) => {
                target.innerHTML = emptyState(`로드 실패: ${error.message}`);
            });
        }
    };

    window.deleteMyClass = async function deleteMyClass(classId, title) {
        if (!confirm(`'${title}' 클래스를 삭제할까요?
이 작업은 되돌릴 수 없습니다.`)) return;
        try {
            const res = await window.BSQ.api(`/api/classes?id=${encodeURIComponent(classId)}`, { method: 'DELETE' });
            if (!res?.success) throw new Error(res?.error || '삭제에 실패했습니다.');
            showMypageNotice('success', '클래스 삭제 완료', '클래스를 삭제했습니다.');
            await window.loadMyClasses(true);
        } catch (error) {
            showMypageNotice('error', '클래스 삭제 실패', error.message || '클래스 삭제 중 오류가 발생했습니다.');
        }
    };

    window.loadEnrolledClasses = async function loadEnrolledClasses(forceRefresh = false) {
        enrolledTargets.forEach((target) => {
            target.innerHTML = emptyState('수강 정보를 불러오는 중입니다.');
        });

        try {
            if (!forceRefresh) {
                const bootCache = getMypageBootCache();
                if (bootCache.userId === userId && Array.isArray(bootCache.enrollments) && Array.isArray(bootCache.passes)) {
                    renderEnrolledClasses(bootCache.enrollments, bootCache.passes);
                    return;
                }

                if (window.__BSQ_MYPAGE_BOOT_PROMISE__) {
                    await window.__BSQ_MYPAGE_BOOT_PROMISE__;
                    const readyCache = getMypageBootCache();
                    if (readyCache.userId === userId && Array.isArray(readyCache.enrollments) && Array.isArray(readyCache.passes)) {
                        renderEnrolledClasses(readyCache.enrollments, readyCache.passes);
                        return;
                    }
                }
            }

            const [enrollRes, passRes] = await Promise.all([
                window.BSQ.api(`/api/enrollments?user_id=${encodeURIComponent(userId)}`),
                window.BSQ.api(`/api/user-passes?user_id=${encodeURIComponent(userId)}`),
            ]);

            const enrollments = enrollRes?.success ? (enrollRes.data?.enrollments || enrollRes.data || []) : [];
            const passes = passRes?.success ? (passRes.data || []) : [];
            window.__BSQ_MYPAGE_CACHE__ = {
                ...(window.__BSQ_MYPAGE_CACHE__ || {}),
                userId,
                enrollments,
                passes,
                updatedAt: Date.now(),
            };
            renderEnrolledClasses(enrollments, passes);
        } catch (error) {
            console.error('[mypage] loadEnrolledClasses failed:', error);
            enrolledTargets.forEach((target) => {
                target.innerHTML = emptyState(`로드 실패: ${error.message}`);
            });
        }
    };

    window.openEditTab = async function openEditTab(classId) {
        try {
            const res = await window.BSQ.api(`/api/classes/${encodeURIComponent(classId)}`);
            const cls = res?.data || null;
            if (!cls) throw new Error('클래스를 찾을 수 없습니다.');

            await renderEditCategoryOptions(cls.category || '', true);
            document.getElementById('editClassId').value = classId;
            document.getElementById('editClassTitle').value = cls.title || '';
            document.getElementById('editClassCategory').value = cls.category || '';
            document.getElementById('editClassSummary').value = cls.summary || '';
            document.getElementById('editClassDescription').value = cls.description || cls.description_text || '';
            document.getElementById('editClassPrice').value = cls.price || 0;
            document.getElementById('editClassDiscount').value = cls.discount_rate || 0;
            document.getElementById('editClassCoupon').checked = Boolean(cls.coupon_pack);

            document.getElementsByName('editClassType').forEach((radio) => {
                radio.checked = radio.value === (cls.class_type || 'VOD');
            });

            document.querySelectorAll('.nav-btn').forEach((button) => button.classList.remove('active'));
            document.querySelectorAll('.mypage-tab').forEach((tab) => tab.classList.remove('active'));
            document.querySelector('[data-target="tabDashboard"]')?.classList.add('active');
            document.getElementById('tabEditClass')?.classList.add('active');
        } catch (error) {
            showMypageNotice('error', '?? ?? ??', error.message || '?? ? ?? ??? ???.');
        }
    };

    const editForm = document.getElementById('editClassForm');
    if (editForm) {
        editForm.onsubmit = async (event) => {
            event.preventDefault();
            const classId = document.getElementById('editClassId').value;
            const updates = {
                title: document.getElementById('editClassTitle').value,
                category: document.getElementById('editClassCategory').value,
                summary: document.getElementById('editClassSummary').value,
                description: document.getElementById('editClassDescription').value,
                description_text: document.getElementById('editClassDescription').value,
                price: parseInt(document.getElementById('editClassPrice').value, 10) || 0,
                discount_rate: parseInt(document.getElementById('editClassDiscount').value, 10) || 0,
                coupon_pack: document.getElementById('editClassCoupon').checked ? 1 : 0,
                class_type: document.querySelector('input[name="editClassType"]:checked')?.value || 'VOD',
            };

            try {
                const res = await window.BSQ.api('/api/classes/update', {
                    method: 'PUT',
                    body: JSON.stringify({
                        class_id: classId,
                        updates,
                    }),
                });
                if (!res?.success) throw new Error(res?.error || '수정에 실패했습니다.');

                showMypageNotice('success', '?? ??', '??? ??? ??????.');
                await window.loadMyClasses(true);
                document.querySelector('[data-target="tabClasses"]')?.click();
            } catch (error) {
                showMypageNotice('error', '?? ??', error.message || '?? ? ?? ??? ???.');
            }
        };
    }

    document.querySelectorAll('.mypage-tab-shortcut').forEach((button) => {
        button.addEventListener('click', () => {
            const target = button.dataset.openTab;
            if (!target) return;
            document.querySelector(`.nav-btn[data-target="${target}"]`)?.click();
        });
    });

    document.getElementById('btnClaimCoupon')?.addEventListener('click', claimCoupon);
    document.getElementById('btnRefreshCouponWallet')?.addEventListener('click', loadCouponWallet);
    document.getElementById('btnRefreshCart')?.addEventListener('click', loadCartItems);
    couponCodeInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            claimCoupon();
        }
    });

    const requestedTab = localStorage.getItem('bsq-mypage-target-tab');
    if (requestedTab) {
        localStorage.removeItem('bsq-mypage-target-tab');
        setTimeout(() => {
            document.querySelector(`.nav-btn[data-target="${requestedTab}"]`)?.click();
        }, 0);
    }

    if (!window.__BSQ_MYPAGE_SYNC_BOUND__) {
        window.__BSQ_MYPAGE_SYNC_BOUND__ = true;
        window.addEventListener('bsq_sync', (event) => {
            const type = event.detail?.type;
            if (type === 'class-categories') {
                renderEditCategoryOptions(document.getElementById('editClassCategory')?.value || '', true)
                    .catch((error) => console.warn('[mypage] category refresh failed:', error));
            }
            if (type === 'cart' || type === 'coupon_wallet' || type === 'coupon') {
                refreshCommercePanels().catch((error) => console.warn('[mypage] commerce sync failed:', error));
            }
            if (type === 'enroll') {
                window.loadEnrolledClasses?.(true);
            }
        });
        window.addEventListener('storage', (event) => {
            if (event.key === LOCAL_CART_KEY) {
                loadCartItems().catch((error) => console.warn('[mypage] local cart sync failed:', error));
            }
        });
    }

    loadCategories().catch(() => {});
    window.loadMyClasses();
    window.loadEnrolledClasses();
    refreshCommercePanels();
};
