// tab_classes.js - 내 클래스 관리 및 수강 신청 관리 로직 (D1 API 버전)
window.initClassesTab = function (db, userId) {
    const FALLBACK_CLASS_CATEGORIES = [
        { name: '소모임/동아리', emoji: '👥' },
        { name: '맛있는 클래스', emoji: '🍽️' },
        { name: '운동 클래스', emoji: '🏋️' },
        { name: '디자인', emoji: '🎨' },
        { name: '생산성', emoji: '⚡' },
        { name: '스포츠', emoji: '🏅' },
        { name: '디지털 드로잉', emoji: '✏️' },
        { name: '성공 마인드', emoji: '🧠' },
        { name: '음악', emoji: '🎵' },
        { name: '요리', emoji: '🍳' },
        { name: '베이킹', emoji: '🧁' },
        { name: '사진', emoji: '📷' },
        { name: '영상', emoji: '🎬' },
        { name: '공예', emoji: '🧵' },
        { name: '여행', emoji: '🧭' },
    ];

    let categoryCache = FALLBACK_CLASS_CATEGORIES.map((item) => ({ ...item }));
    let categoryCacheLoaded = false;

    const classList = document.getElementById('classList'); // 등록한 클래스
    const enrolledList = document.getElementById('enrolledClasses'); // 수강 중인 클래스

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

    async function loadCategories(force = false) {
        if (!force && categoryCacheLoaded) return categoryCache;
        try {
            const res = await window.BSQ.api(`/api/class-categories?t=${Date.now()}`);
            if (res && res.success && Array.isArray(res.data) && res.data.length > 0) {
                categoryCache = normalizeCategories(res.data);
                categoryCacheLoaded = true;
                return categoryCache;
            }
        } catch (error) {
            console.warn('[tab_classes] category load failed, using fallback:', error);
        }

        categoryCache = FALLBACK_CLASS_CATEGORIES.map((item) => ({ ...item }));
        categoryCacheLoaded = true;
        return categoryCache;
    }

    function buildCategoryOptions(selected = '') {
        const selectedValue = String(selected || '').trim();
        const merged = [...categoryCache];
        const known = new Set(merged.map((item) => item.name));
        if (selectedValue && !known.has(selectedValue)) {
            merged.push({ name: selectedValue, emoji: '✨' });
        }

        return merged.map((item) => `<option value="${escapeHtml(item.name)}" ${selectedValue === item.name ? 'selected' : ''}>${escapeHtml(item.emoji)} ${escapeHtml(item.name)}</option>`).join('');
    }

    async function renderEditCategoryOptions(selected = '', forceRefresh = false) {
        const select = document.getElementById('editClassCategory');
        if (!select) return;
        await loadCategories(forceRefresh);
        const selectedValue = String(selected || select.value || '').trim();
        select.innerHTML = buildCategoryOptions(selectedValue);
        if (selectedValue) {
            select.value = selectedValue;
        }
    }

    // 1. 내가 등록한 클래스 로드 (D1 API)
    window.loadMyClasses = async function () {
        if (!classList) return;
        classList.innerHTML = '<div class="empty-state">클래스를 불러오는 중...</div>';

        try {
            const res = await window.BSQ.api(`/api/classes?instructor_id=${userId}`);
            if (!res || !res.success) throw new Error(res?.error || "Load failed");

            const data = res.data || [];
            if (data.length === 0) {
                classList.innerHTML = '<div class="empty-state">아직 등록한 클래스가 없습니다.</div>';
                return;
            }

            let html = '';
            data.forEach(cls => {
                html += `
                    <div class="my-class-card" id="card-${cls.id}">
                        <div class="class-thumb ${!cls.image_url ? 'placeholder-orange' : ''}">
                            ${cls.image_url ? `<img src="${cls.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                        </div>
                        <div class="class-info">
                            <h4>${cls.title}</h4>
                            <p>${cls.category || '미분류'} | ${cls.class_type || 'VOD'}</p>
                            <div style="display:flex; gap:10px; margin-top:10px;">
                                <button class="btn-chat-link" onclick="openEditTab('${cls.id}')">⚙️ 관리</button>
                                <button class="btn-chat-link" style="background:rgba(255,255,255,0.05);" onclick="location.href='../class_view/class_view.html?id=${cls.id}'">미리보기</button>
                                <button class="btn-chat-link" style="background:rgba(255,50,50,0.1); color:#ff5252;" onclick="deleteMyClass('${cls.id}', '${cls.title.replace(/'/g, "\\'")}')">🗑️ 삭제</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            classList.innerHTML = html;
        } catch (error) {
            console.error("클래스 로드 실패:", error);
            classList.innerHTML = `<div class="empty-state text-error">로드 실패: ${error.message}</div>`;
        }
    };

    // 2. 클래스 삭제 (휴지통 이동)
    window.deleteMyClass = async function(classId, title) {
        if (!confirm(`'${title}' 클래스를 정말 삭제하시겠습니까?`)) return;
        try {
            const res = await window.BSQ.api(`/api/classes?id=${classId}`, { method: 'DELETE' });
            if (res && res.success) {
                alert("삭제되었습니다. (휴지통으로 이동됨)");
                loadMyClasses();
            } else {
                throw new Error(res.error || "삭제 실패");
            }
        } catch (e) {
            alert("오류: " + e.message);
        }
    };

    // 3. 내가 수강 신청한 클래스 로드 (D1 API)
    window.loadEnrolledClasses = async function () {
        if (!enrolledList) return;
        enrolledList.innerHTML = '<div class="empty-state">수강 정보를 불러오는 중...</div>';

        try {
            const enrollRes = await window.BSQ.api(`/api/enrollments?user_id=${userId}`);
            const passRes = await window.BSQ.api(`/api/user-passes?user_id=${userId}`);
            
            const enrollData = (enrollRes && enrollRes.success) ? (enrollRes.data?.enrollments || enrollRes.data || []) : [];
            const passData = (passRes && passRes.success) ? (passRes.data || []) : [];

            if (enrollData.length === 0 && passData.length === 0) {
                enrolledList.innerHTML = '<div class="empty-state">아직 참가중인 클래스나 보유한 수강권이 없습니다.</div>';
                return;
            }

            let totalPasses = 0;
            let html = '';

            enrollData.forEach(enroll => {
                const classId = enroll.class_id;
                const myPasses = passData.filter(p => p.class_id === classId);
                
                let passUi = '';
                myPasses.forEach(p => {
                    if (p.remaining_count > 0) {
                        passUi += `<div style="display:inline-block; margin-top:6px; padding:4px 8px; background:rgba(76, 201, 240, 0.15); color:#4cc9f0; border-radius:6px; font-size:0.85rem; font-weight:600;">🎫 수강권 ${p.remaining_count}개 보유</div> `;
                        totalPasses += p.remaining_count;
                    }
                    if (p.pass_type === 'MONTHLY' && p.status === 'active') {
                        passUi += `<div style="display:inline-block; margin-top:6px; padding:4px 8px; background:rgba(255, 152, 0, 0.15); color:#FF9800; border-radius:6px; font-size:0.85rem; font-weight:600;">🌟 월정액 구독 중</div> `;
                    }
                });

                html += `
                    <div class="my-class-card">
                        <div class="class-thumb ${!enroll.image_url ? 'placeholder-orange' : ''}">
                            ${enroll.image_url ? `<img src="${enroll.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                        </div>
                        <div class="class-info">
                            <h4 style="margin-bottom:4px;">${enroll.title || '제목 없음'}</h4>
                            <p style="font-size:0.9rem; color:#888; margin-bottom:8px;">${enroll.category || '기타'} | 수강일: ${new Date(enroll.enrolled_at || enroll.created_at || Date.now()).toLocaleDateString()}</p>
                            <div style="margin-bottom:12px;">${passUi}</div>
                            <div style="display:flex; gap:10px;">
                                <button class="btn-chat-link" onclick="location.href='../class_view/class_view.html?id=${classId}'">▶️ 학습 페이지</button>
                                <button class="btn-chat-link" style="background:rgba(255,255,255,0.05);" onclick="location.href='../class_view/class_view.html?id=${classId}#tabChat'">💬 채널</button>
                            </div>
                        </div>
                    </div>
                `;
            });

            enrolledList.innerHTML = html || '<div class="empty-state">수강 중인 클래스가 없습니다.</div>';

            // 대시보드 요약 업데이트
            const dashPassCount = document.getElementById('dashPassCount');
            const dashClassCount = document.getElementById('dashClassCount');
            const dashRecentClass = document.getElementById('dashRecentClass');
            
            if (dashPassCount) dashPassCount.textContent = `${totalPasses}개`;
            if (dashClassCount) dashClassCount.textContent = `${enrollData.length}개`;
            if (dashRecentClass && html) {
                dashRecentClass.innerHTML = html.split('</div>\n                \n')[0] + '</div>'; 
            }

        } catch (error) {
            console.error("Enrollment load error:", error);
            enrolledList.innerHTML = `<div class="empty-state text-error">로드 실패: ${error.message}</div>`;
        }
    };

    // 4. 클래스 수정 (D1 API)
    window.openEditTab = async function (classId) {
        try {
            // D1 API에서 단일 클래스 조회 (q=id 필터 활용 또는 전체 목록에서 찾기)
            const res = await window.BSQ.api(`/api/classes?q=${classId}`);
            const cls = res.data?.find(c => c.id === classId);
            if (!cls) throw new Error("클래스를 찾을 수 없습니다.");

            await renderEditCategoryOptions(cls.category || '', true);
            document.getElementById('editClassId').value = classId;
            document.getElementById('editClassTitle').value = cls.title || '';
            document.getElementById('editClassCategory').value = cls.category || '';
            document.getElementById('editClassSummary').value = cls.summary || '';
            document.getElementById('editClassDescription').value = cls.description || '';
            document.getElementById('editClassPrice').value = cls.price || 0;
            document.getElementById('editClassDiscount').value = cls.discount_rate || 0;
            document.getElementById('editClassCoupon').checked = !!cls.coupon_pack;

            const typeRadios = document.getElementsByName('editClassType');
            typeRadios.forEach(radio => {
                if (radio.value === cls.class_type) radio.checked = true;
            });

            // 탭 전환
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mypage-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('tabEditClass').classList.add('active');
        } catch (error) {
            alert("정보 로드 실패: " + error.message);
        }
    };

    const editForm = document.getElementById('editClassForm');
    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const classId = document.getElementById('editClassId').value;
            const updateData = {
                id: classId,
                title: document.getElementById('editClassTitle').value,
                category: document.getElementById('editClassCategory').value,
                summary: document.getElementById('editClassSummary').value,
                description: document.getElementById('editClassDescription').value,
                price: parseInt(document.getElementById('editClassPrice').value) || 0,
                discount_rate: parseInt(document.getElementById('editClassDiscount').value) || 0,
                coupon_pack: document.getElementById('editClassCoupon').checked ? 1 : 0,
                class_type: document.querySelector('input[name="editClassType"]:checked').value
            };

            try {
                const res = await window.BSQ.api('/api/classes', {
                    method: 'PATCH',
                    body: JSON.stringify(updateData)
                });
                if (!res.success) throw new Error(res.error || "수정 실패");

                alert("성공적으로 수정되었습니다.");
                loadMyClasses();
                document.querySelector('[data-target="tabClasses"]').click();
            } catch (error) {
                alert("수정 실패: " + error.message);
            }
        };
    }

    if (!window.__BSQ_MYPAGE_CLASS_SYNC_BOUND) {
        window.__BSQ_MYPAGE_CLASS_SYNC_BOUND = true;
        window.addEventListener('bsq_sync', (event) => {
            if (event.detail?.type === 'class-categories') {
                renderEditCategoryOptions(document.getElementById('editClassCategory')?.value || '', true).catch((error) => {
                    console.warn('[tab_classes] category refresh failed:', error);
                });
            }
        });
    }

    // 초기 로드
    loadMyClasses();
    loadEnrolledClasses();
};
