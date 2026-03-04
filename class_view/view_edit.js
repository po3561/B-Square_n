// view_edit.js - 강사 전용 클래스 관리 모듈
// Firebase RTDB + Supabase 통합 연동
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initEdit = async function (db, classId, classData, supabase, userId) {
    console.log("✏️ Edit Module Initializing... | ClassId:", classId);

    const container = document.getElementById('editTabContainer');
    if (!container) return;

    // ========================
    // 1. Supabase 강사 프로필 로드
    // ========================
    let instructorName = '강사';
    let instructorEmail = '';
    let instructorAvatar = '';

    try {
        const { data: profile } = await supabase.from('users').select('name, email, profile_image_url').eq('id', userId).maybeSingle();
        if (profile) {
            instructorName = profile.name || '강사';
            instructorEmail = profile.email || '';
            instructorAvatar = profile.profile_image_url || '';
        }
    } catch (e) { console.warn("Instructor profile load failed:", e); }

    // Firebase 통계 로드
    let enrollCount = 0, reviewCount = 0, chatCount = 0, avgRating = 0;
    try {
        const reviewSnap = await db.ref(`reviews/${classId}`).once('value');
        const reviewData = reviewSnap.val() || {};
        const reviews = Object.values(reviewData);
        reviewCount = reviews.length;
        if (reviewCount > 0) avgRating = (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviewCount).toFixed(1);

        const chatSnap = await db.ref(`chats/${classId}`).once('value');
        chatCount = chatSnap.numChildren();
    } catch (e) { console.warn("Stats load failed:", e); }

    // ========================
    // 2. 데이터 준비
    // ========================
    const categories = ['디자인', '생산성', '스포츠', '디지털 드로잉', '성공 마인드', '음악', '베이킹', '사진', '영상', '공예'];
    const catOptions = categories.map(c => `<option value="${c}" ${classData.category === c ? 'selected' : ''}>${c}</option>`).join('');

    const curriculum = classData.curriculum || [];
    const curriculumHTML = curriculum.map((ch, i) => `
        <div class="edit-chapter-item" data-index="${i}">
            <div class="edit-chapter-row">
                <span class="edit-chapter-num">챕터 ${i + 1}</span>
                <input type="text" class="edit-chapter-title" value="${ch.title || ''}" placeholder="챕터 제목">
                <button type="button" class="btn-remove-chapter">✕</button>
            </div>
        </div>
    `).join('');

    const keywords = Array.isArray(classData.keywords) ? classData.keywords.join(', ') : (classData.keywords || '');
    const createdDate = classData.created_at ? new Date(classData.created_at).toLocaleDateString('ko-KR') : '-';

    // 기존 이미지 배열 (base64 또는 URL)
    let editImages = classData.image_urls ? [...classData.image_urls] : (classData.image_url ? [classData.image_url] : []);

    // 서브 강사 초기 데이터
    const subInstructorHTML = (classData.sub_instructors || []).length === 0
        ? '<p style="color:var(--text-secondary,#888); font-size:0.85rem;">등록된 서브 강사가 없습니다</p>'
        : '';

    // ========================
    // 3. UI 렌더링
    // ========================
    container.innerHTML = `
        <div class="edit-panel">
            <!-- 강사 프로필 + 통계 -->
            <div class="edit-instructor-header">
                <div class="edit-instructor-profile">
                    <div class="edit-avatar" style="${instructorAvatar ? `background-image:url(${instructorAvatar})` : ''}">
                        ${!instructorAvatar ? '👨‍🏫' : ''}
                    </div>
                    <div class="edit-instructor-info">
                        <span class="edit-instructor-name">${instructorName}</span>
                        <span class="edit-instructor-email">${instructorEmail}</span>
                    </div>
                </div>
                <div class="edit-stats-row">
                    <div class="edit-stat-card"><span class="stat-num">${enrollCount}</span><span class="stat-label">수강생</span></div>
                    <div class="edit-stat-card"><span class="stat-num">${avgRating}</span><span class="stat-label">평점</span></div>
                    <div class="edit-stat-card"><span class="stat-num">${reviewCount}</span><span class="stat-label">후기</span></div>
                    <div class="edit-stat-card"><span class="stat-num">${chatCount}</span><span class="stat-label">채팅</span></div>
                </div>
            </div>

            <div class="edit-panel-header">
                <span class="edit-badge">✏️ 클래스 수정</span>
                <p class="edit-panel-desc">클래스 ID: <code>${classId}</code> · 등록일: ${createdDate}</p>
            </div>

            <form id="editForm" class="edit-form">
                <!-- 기본 정보 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">📋 기본 정보</h4>
                    <div class="edit-field">
                        <label>클래스명</label>
                        <input type="text" id="editTitle" value="${classData.title || ''}" placeholder="클래스 제목">
                    </div>
                    <div class="edit-field-row">
                        <div class="edit-field">
                            <label>카테고리</label>
                            <select id="editCategory">${catOptions}</select>
                        </div>
                        <div class="edit-field">
                            <label>클래스 유형</label>
                            <select id="editClassType">
                                <option value="VOD" ${classData.class_type === 'VOD' ? 'selected' : ''}>VOD (녹화 강의)</option>
                                <option value="LIVE" ${classData.class_type === 'LIVE' ? 'selected' : ''}>LIVE (실시간)</option>
                                <option value="KIT" ${classData.class_type === 'KIT' ? 'selected' : ''}>KIT (키트 포함)</option>
                            </select>
                        </div>
                    </div>
                    <div class="edit-field">
                        <label>키워드 (쉼표로 구분)</label>
                        <input type="text" id="editKeywords" value="${keywords}" placeholder="디자인, 포토샵, 기초">
                    </div>
                </div>

                <!-- 이미지 (드래그앤드롭) -->
                <div class="edit-section">
                    <h4 class="edit-section-title">🖼️ 클래스 이미지</h4>
                    <div class="edit-image-grid" id="editImageGrid"></div>
                    <div class="edit-dropzone" id="editDropzone">
                        <input type="file" id="editImageFile" accept="image/*" multiple hidden>
                        <div class="dropzone-inner">
                            <span class="dropzone-icon">📂</span>
                            <p>이미지를 드래그하거나 클릭하여 업로드</p>
                            <span class="dropzone-hint">최대 6장 · JPG, PNG, WEBP</span>
                        </div>
                    </div>
                </div>

                <!-- 대상 수강생 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">🎯 대상 수강생</h4>
                    <div class="edit-field">
                        <label>이런 분들을 위한 클래스입니다 (줄바꿈으로 구분)</label>
                        <textarea id="editTargetAudience" rows="4" placeholder="관련 분야 기초를 다지고 싶은 분&#10;실무 기술을 배우고 싶은 분">${(classData.target_audience || []).join('\n')}</textarea>
                    </div>
                </div>

                <!-- 학습 목표 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">🎓 학습 목표</h4>
                    <p class="edit-section-hint">각 목표를 아이콘|제목|설명 형식으로 입력 (줄바꿈으로 구분)</p>
                    <div class="edit-field">
                        <textarea id="editObjectives" rows="4" placeholder="💡|기초 개념 이해|복잡한 개념도 쉽게 설명합니다&#10;🛠️|실전 프로젝트|직접 결과물을 만들어봅니다">${(classData.objectives || []).map(o => `${o.icon}|${o.title}|${o.desc}`).join('\n')}</textarea>
                    </div>
                </div>

                <!-- 소개 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">📝 클래스 소개</h4>
                    <div class="edit-field">
                        <label>요약 (한 줄 설명)</label>
                        <textarea id="editSummary" rows="2" placeholder="클래스를 한 줄로 설명하세요">${classData.summary || ''}</textarea>
                    </div>
                    <div class="edit-field">
                        <label>상세 설명</label>
                        <textarea id="editDescription" rows="8" placeholder="클래스에 대해 자세히 설명하세요">${classData.description || ''}</textarea>
                    </div>
                </div>

                <!-- 가격 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">💰 가격 설정</h4>
                    <div class="edit-field-row">
                        <div class="edit-field">
                            <label>가격 (원)</label>
                            <input type="number" id="editPrice" value="${classData.price || 0}" min="0">
                        </div>
                        <div class="edit-field">
                            <label>할인율 (%)</label>
                            <input type="number" id="editDiscount" value="${classData.discount_rate || 0}" min="0" max="100">
                        </div>
                    </div>
                    <div class="edit-price-preview" id="editPricePreview"></div>
                </div>

                <!-- 커리큘럼 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">📚 커리큘럼</h4>
                    <div id="editCurriculumList" class="edit-curriculum-list">
                        ${curriculumHTML || '<p class="edit-empty-msg">등록된 챕터가 없습니다</p>'}
                    </div>
                    <button type="button" id="btnAddEditChapter" class="btn-add-chapter">+ 챕터 추가</button>
                </div>

                <!-- 서브 강사 관리 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">👥 서브 강사 관리</h4>
                    <p class="edit-section-hint">이 클래스를 함께 운영할 서브 강사를 검색하여 추가할 수 있습니다.</p>
                    <div class="edit-field" style="position: relative;">
                        <label>강사 검색</label>
                        <input type="text" id="subInstructorSearch" placeholder="이름으로 검색..." autocomplete="off">
                        <div id="subInstructorResults" style="position:absolute; top:100%; left:0; right:0; background:var(--bg-card,#1a1a2e); border:1px solid var(--border-color,#333); border-radius:8px; max-height:200px; overflow-y:auto; z-index:50; display:none;"></div>
                    </div>
                    <div id="subInstructorList" class="edit-sub-instructor-list" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:1rem;">
                        ${subInstructorHTML}
                    </div>
                </div>

                <!-- 저장 -->
                <div class="edit-actions">
                    <button type="submit" class="btn-edit-save" id="btnEditSave">
                        <span>💾 변경 사항 저장</span>
                    </button>
                    <p class="edit-save-hint">저장 시 Firebase에 실시간 반영되어 모든 사용자에게 즉시 적용됩니다.</p>
                </div>
            </form>
        </div>
    `;

    // ========================
    // 4. 이미지 드래그앤드롭 시스템
    // ========================
    const dropzone = document.getElementById('editDropzone');
    const fileInput = document.getElementById('editImageFile');
    const imageGrid = document.getElementById('editImageGrid');

    function renderImageGrid() {
        imageGrid.innerHTML = editImages.map((src, i) => `
            <div class="edit-img-card">
                <img src="${src}" alt="이미지 ${i + 1}">
                <span class="img-badge">${i === 0 ? '대표' : i + 1}</span>
                <button type="button" class="btn-remove-img" data-index="${i}">✕</button>
            </div>
        `).join('');

        if (editImages.length === 0) {
            imageGrid.innerHTML = '<p class="edit-empty-msg">등록된 이미지가 없습니다</p>';
        }

        // 삭제 버튼 이벤트
        imageGrid.querySelectorAll('.btn-remove-img').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                editImages.splice(idx, 1);
                renderImageGrid();
            });
        });

        // 드롭존 표시/숨김
        dropzone.style.display = editImages.length >= 6 ? 'none' : 'block';
    }

    // 이미지 압축 유틸리티
    function compressEditImage(file, maxWidth = 800, quality = 0.6) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width, h = img.height;
                    if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    async function processFiles(files) {
        for (const file of Array.from(files)) {
            if (editImages.length >= 6) break;
            if (!file.type.startsWith('image/')) continue;
            const compressed = await compressEditImage(file, 800, 0.6);
            editImages.push(compressed);
        }
        renderImageGrid();
    }

    // 클릭으로 파일 선택
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => processFiles(e.target.files));

    // 드래그앤드롭
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        processFiles(e.dataTransfer.files);
    });

    renderImageGrid();

    // ========================
    // 5. 가격 미리보기
    // ========================
    function updatePricePreview() {
        const price = parseInt(document.getElementById('editPrice').value) || 0;
        const discount = parseInt(document.getElementById('editDiscount').value) || 0;
        const finalPrice = discount > 0 ? Math.round(price * (1 - discount / 100)) : price;
        const preview = document.getElementById('editPricePreview');
        if (preview) {
            if (price === 0) {
                preview.innerHTML = '<span class="preview-free">✅ 무료 클래스</span>';
            } else if (discount > 0) {
                preview.innerHTML = `<span class="preview-original">${price.toLocaleString()}원</span> → <span class="preview-final">${finalPrice.toLocaleString()}원</span> <span class="preview-discount">(${discount}% 할인)</span>`;
            } else {
                preview.innerHTML = `<span class="preview-final">${price.toLocaleString()}원</span>`;
            }
        }
    }
    document.getElementById('editPrice')?.addEventListener('input', updatePricePreview);
    document.getElementById('editDiscount')?.addEventListener('input', updatePricePreview);
    updatePricePreview();

    // ========================
    // 6. 커리큘럼 관리
    // ========================
    document.getElementById('btnAddEditChapter')?.addEventListener('click', () => {
        const list = document.getElementById('editCurriculumList');
        const emptyMsg = list.querySelector('.edit-empty-msg');
        if (emptyMsg) emptyMsg.remove();

        const count = list.querySelectorAll('.edit-chapter-item').length;
        const div = document.createElement('div');
        div.className = 'edit-chapter-item';
        div.innerHTML = `
            <div class="edit-chapter-row">
                <span class="edit-chapter-num">챕터 ${count + 1}</span>
                <input type="text" class="edit-chapter-title" value="" placeholder="새 챕터 제목">
                <button type="button" class="btn-remove-chapter">✕</button>
            </div>
        `;
        list.appendChild(div);
        attachRemoveEvent(div.querySelector('.btn-remove-chapter'));
        div.querySelector('.edit-chapter-title').focus();
    });

    function attachRemoveEvent(btn) {
        btn.addEventListener('click', () => {
            btn.closest('.edit-chapter-item').remove();
            document.querySelectorAll('#editCurriculumList .edit-chapter-item').forEach((item, i) => {
                item.querySelector('.edit-chapter-num').textContent = `챕터 ${i + 1}`;
            });
        });
    }
    document.querySelectorAll('.btn-remove-chapter').forEach(attachRemoveEvent);

    // ========================
    // 7. 폼 제출 → Firebase 실시간 업데이트
    // ========================
    document.getElementById('editForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = document.getElementById('btnEditSave');
        const originalHTML = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span>⏳ 저장 중...</span>';
        saveBtn.disabled = true;

        try {
            const chapters = Array.from(document.querySelectorAll('#editCurriculumList .edit-chapter-title'))
                .map(input => ({ title: input.value.trim() }))
                .filter(ch => ch.title);

            const keywordsArr = document.getElementById('editKeywords').value.split(',').map(k => k.trim()).filter(k => k);

            // 대상 수강생 파싱
            const targetAudience = document.getElementById('editTargetAudience').value
                .split('\n').map(l => l.trim()).filter(l => l);

            // 학습 목표 파싱 (아이콘|제목|설명 형식)
            const objectives = document.getElementById('editObjectives').value
                .split('\n').map(l => l.trim()).filter(l => l)
                .map(line => {
                    const parts = line.split('|');
                    return {
                        icon: parts[0] || '💡',
                        title: parts[1] || '',
                        desc: parts[2] || ''
                    };
                }).filter(o => o.title);

            const updates = {
                title: document.getElementById('editTitle').value.trim(),
                category: document.getElementById('editCategory').value,
                class_type: document.getElementById('editClassType').value,
                keywords: keywordsArr,
                target_audience: targetAudience,
                objectives: objectives,
                summary: document.getElementById('editSummary').value.trim(),
                description: document.getElementById('editDescription').value.trim(),
                price: parseInt(document.getElementById('editPrice').value) || 0,
                discount_rate: parseInt(document.getElementById('editDiscount').value) || 0,
                curriculum: chapters,
                image_url: editImages[0] || '',
                image_urls: editImages
            };

            console.log("📤 Saving to Firebase:", `classes/${classId}`, Object.keys(updates));
            await db.ref(`classes/${classId}`).update(updates);
            console.log("✅ Firebase update successful");

            // 서브 강사 정보도 저장
            await db.ref(`classes/${classId}/sub_instructors`).set(subInstructors);

            // 현재 페이지 UI 실시간 반영
            Object.assign(classData, updates);
            if (typeof renderCorePageInfo === 'function') renderCorePageInfo(classData);
            if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
            if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);

            if (typeof showToast === 'function') showToast('success', '수정 완료 ✅', '클래스 정보가 Firebase에 실시간 반영되었습니다.');
        } catch (err) {
            console.error("▶ Edit Save Error:", err);
            if (typeof showToast === 'function') showToast('error', '저장 실패 ❌', err.message || '클래스 정보 저장에 실패했습니다.');
        } finally {
            saveBtn.innerHTML = originalHTML;
            saveBtn.disabled = false;
        }
    });

    // ========================
    // 8. 서브 강사 관리
    // ========================
    let subInstructors = classData.sub_instructors || [];
    const subSearchInput = document.getElementById('subInstructorSearch');
    const subResults = document.getElementById('subInstructorResults');
    const subList = document.getElementById('subInstructorList');

    function renderSubInstructors() {
        if (!subList) return;
        if (subInstructors.length === 0) {
            subList.innerHTML = '<p style="color:var(--text-secondary,#888); font-size:0.85rem;">등록된 서브 강사가 없습니다</p>';
            return;
        }
        subList.innerHTML = subInstructors.map((si, i) => `
            <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); padding:8px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.1);">
                <div style="width:32px; height:32px; border-radius:50%; background:var(--comm-accent,#6c5ce7); display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;">
                    ${si.avatar ? `<img src="${si.avatar}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                </div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.9rem;">${si.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-secondary,#888);">${si.email || ''}</div>
                </div>
                <button type="button" data-idx="${i}" class="btn-remove-sub" style="background:rgba(255,0,0,0.1); color:#ff4757; border:none; border-radius:6px; padding:4px 8px; cursor:pointer; font-size:0.8rem;">제거</button>
            </div>
        `).join('');

        subList.querySelectorAll('.btn-remove-sub').forEach(btn => {
            btn.addEventListener('click', () => {
                subInstructors.splice(parseInt(btn.dataset.idx), 1);
                renderSubInstructors();
            });
        });
    }
    renderSubInstructors();

    let searchTimeout = null;
    subSearchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = subSearchInput.value.trim();
        if (query.length < 1) { subResults.style.display = 'none'; return; }

        searchTimeout = setTimeout(async () => {
            try {
                const { data, error } = await supabase.from('users')
                    .select('id, name, email, profile_image_url')
                    .ilike('name', `%${query}%`)
                    .limit(10);

                if (error) {
                    console.error("Sub-instructor search error:", error);
                }

                if (!data || data.length === 0) {
                    subResults.innerHTML = '<div style="padding:12px; color:var(--text-secondary,#888); text-align:center;">검색 결과가 없습니다</div>';
                } else {
                    subResults.innerHTML = data
                        .filter(u => u.id !== userId && !subInstructors.find(s => s.id === u.id))
                        .map(u => `
                            <div class="sub-search-item" data-id="${u.id}" data-name="${u.name}" data-email="${u.email || ''}" data-avatar="${u.profile_image_url || ''}"
                                style="padding:10px 14px; cursor:pointer; display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                                <div style="width:28px; height:28px; border-radius:50%; background:#333; overflow:hidden; flex-shrink:0;">
                                    ${u.profile_image_url ? `<img src="${u.profile_image_url}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                                </div>
                                <div><div style="font-weight:600; font-size:0.85rem;">${u.name}</div><div style="font-size:0.75rem; color:#888;">${u.email || ''}</div></div>
                            </div>
                        `).join('');
                }
                subResults.style.display = 'block';

                subResults.querySelectorAll('.sub-search-item').forEach(item => {
                    item.addEventListener('click', () => {
                        subInstructors.push({
                            id: item.dataset.id,
                            name: item.dataset.name,
                            email: item.dataset.email,
                            avatar: item.dataset.avatar
                        });
                        renderSubInstructors();
                        subSearchInput.value = '';
                        subResults.style.display = 'none';
                    });
                });
            } catch (err) {
                console.warn('Sub instructor search error:', err);
            }
        }, 300);
    });

    // 검색 결과 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (subResults && !subResults.contains(e.target) && e.target !== subSearchInput) {
            subResults.style.display = 'none';
        }
    });
};
