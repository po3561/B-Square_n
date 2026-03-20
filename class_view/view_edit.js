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
    // ========================
    // 1. D1 강사 프로필 및 통계 로드 (classData 기반)
    // ========================
    const instructorName = classData.creator_name || '강사';
    const instructorEmail = classData.creator_email || '';
    const instructorAvatar = classData.creator_profile_image || '';

    // D1 API 조회에서 넘겨받은 통계
    const enrollCount = classData.enrollment_count || 0;
    const reviewCount = classData.review_count || 0;
    const avgRating = classData.avg_rating || '0.0';
    const dailyChatAvg = classData.daily_chat_avg || 0; // 채팅 하루 평균 (API 응답 확장 시 연동)

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
                    <div class="edit-stat-card"><span class="stat-num">${dailyChatAvg}</span><span class="stat-label">일평균 채팅</span></div>
                </div>
            </div>

            <div class="edit-panel-header">
                <span class="edit-badge">⚙️ 강사 대시보드</span>
                <p class="edit-panel-desc">클래스 ID: <code>${classId}</code> · 등록일: ${createdDate}</p>
            </div>

            <!-- 탭 내비게이션 -->
            <div class="db-tabs" style="display:flex; gap:10px; border-bottom:1px solid rgba(255,255,255,0.1); margin-bottom:1.5rem;">
                <button type="button" class="db-tab-btn active" data-target="dbTabInfo" style="background:none; border:none; color:#fff; padding:10px 15px; cursor:pointer; font-weight:700; border-bottom:2px solid var(--comm-accent);">📝 정보 수정</button>
                <button type="button" class="db-tab-btn" data-target="dbTabInstructors" style="background:none; border:none; color:#888; padding:10px 15px; cursor:pointer; font-weight:600;">👥 서브 강사</button>
                <button type="button" class="db-tab-btn" data-target="dbTabStudents" style="background:none; border:none; color:#888; padding:10px 15px; cursor:pointer; font-weight:600;">🎓 수강생 및 결제</button>
                <button type="button" class="db-tab-btn" data-target="dbTabCoupons" style="background:none; border:none; color:#888; padding:10px 15px; cursor:pointer; font-weight:600;">🎟️ 쿠폰 관리</button>
                <button type="button" class="db-tab-btn" data-target="dbTabDelete" style="background:none; border:none; color:#ff4d4d; padding:10px 15px; cursor:pointer; font-weight:600;">🗑️ 클래스 삭제</button>
            </div>

            <!-- TAB 1: 정보 수정 -->
            <div id="dbTabInfo" class="db-tab-content" style="display:block;">
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
                                    <option value="ONLINE" ${classData.class_type === 'ONLINE' ? 'selected' : ''}>온라인 (Online)</option>
                                    <option value="OFFLINE" ${classData.class_type === 'OFFLINE' ? 'selected' : ''}>오프라인 (Offline)</option>
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
                            <label>상세 설명 (Rich Text 지원)</label>
                            <div id="editDescriptionContainer" style="height: 300px; background: rgba(0,0,0,0.2); border-radius: 8px; color: #fff;"></div>
                            <textarea id="editDescription" style="display:none;"></textarea>
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

                    <!-- 저장 -->
                    <div class="edit-actions">
                        <button type="submit" class="btn-edit-save" id="btnEditSave" style="border-radius: 20px; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(109, 143, 255, 0.3); background: #6D8FFF; border: none; padding: 12px 24px; color: white; font-weight: 500;">
                            <span>💾 변경 사항 저장</span>
                        </button>
                        <p class="edit-save-hint" style="font-size: 0.85rem; color: rgba(255, 255, 255, 0.5); margin-top: 10px;">저장 시 D1 데이터베이스에 실시간 반영되어 즉시 노출됩니다.</p>
                    </div>
                </form>
            </div>

            <!-- TAB 2: 서브 강사 -->
            <div id="dbTabInstructors" class="db-tab-content" style="display:none;">
                <div class="edit-section">
                    <h4 class="edit-section-title">👥 서브 강사 관리</h4>
                    <p class="edit-section-hint">이 클래스를 함께 운영할 서브 강사를 검색하여 추가할 수 있습니다. 추가된 강사는 클래스 수정, 채팅 모더레이팅 권한을 동일하게 가집니다.</p>
                    <div class="edit-field" style="position: relative;">
                        <input type="text" id="subInstructorSearch" placeholder="이름으로 검색..." autocomplete="off">
                        <div id="subInstructorResults" style="position:absolute; top:100%; left:0; right:0; background:var(--bg-card,#1a1a2e); border:1px solid var(--border-color,#333); border-radius:8px; max-height:200px; overflow-y:auto; z-index:50; display:none;"></div>
                    </div>
                    <div id="subInstructorList" class="edit-sub-instructor-list" style="display:flex; flex-wrap:wrap; gap:10px; margin-top:1rem;">
                        ${subInstructorHTML}
                    </div>
                </div>
            </div>

            <!-- TAB 3: 수강생 및 결제 -->
            <div id="dbTabStudents" class="db-tab-content" style="display:none;">
                <div class="edit-section">
                    <h4 class="edit-section-title">🎓 전체 수강 통계</h4>
                    <div id="studentStatsArea" style="margin-bottom:20px; color:#aaa;">불러오는 중...</div>
                    <h4 class="edit-section-title">💸 수강생 리스트 및 패스 관리</h4>
                    <div class="edit-field" style="margin-bottom:15px; display:flex; gap:10px;">
                        <input type="text" id="studentSearchInput" placeholder="이름/이메일로 빠른 검색" style="flex:1;">
                    </div>
                    <div id="studentListArea" style="max-height:400px; overflow-y:auto; border:1px solid rgba(255,255,255,0.05); padding:10px; border-radius:8px;">
                        불러오는 중...
                    </div>
                </div>
            </div>

            <!-- TAB 4: 쿠폰 관리 -->
            <div id="dbTabCoupons" class="db-tab-content" style="display:none;">
                <div class="edit-section" style="background:rgba(255,255,255,0.02); padding:1rem; border-radius:10px; margin-bottom:1.5rem;">
                    <h4 class="edit-section-title">🎟️ 새 쿠폰 발급하기</h4>
                    <div class="edit-field-row">
                        <div class="edit-field">
                            <label>쿠폰 코드 (영문/숫자)</label>
                            <input type="text" id="newCouponCode" placeholder="예: SUMMER2026">
                        </div>
                        <div class="edit-field">
                            <label>할인 금액(원) / 비율(%)</label>
                            <input type="number" id="newCouponValue" placeholder="할인 액수 또는 비율">
                        </div>
                        <div class="edit-field">
                            <label>할인 타입</label>
                            <select id="newCouponType">
                                <option value="amount">원 할인</option>
                                <option value="percent">% 할인</option>
                            </select>
                        </div>
                    </div>
                    <div class="edit-field-row" style="margin-top:10px;">
                        <div class="edit-field">
                            <label>총 발행 수량 (0은 무제한)</label>
                            <input type="number" id="newCouponLimit" value="0" min="0">
                        </div>
                    </div>
                    <button class="btn-submit" id="btnCreateCoupon" style="margin-top:10px;">쿠폰 생성</button>
                </div>
                
                <div class="edit-section">
                    <h4 class="edit-section-title">📚 발행된 쿠폰 내역</h4>
                    <div id="couponListArea">
                        불러오는 중...
                    </div>
                </div>
            </div>

            <!-- TAB 5: 클래스 삭제 -->
            <div id="dbTabDelete" class="db-tab-content" style="display:none;">
                <div class="edit-section" style="background:rgba(255,77,77,0.05); border:1px solid rgba(255,77,77,0.2); padding:2rem; border-radius:15px; text-align:center;">
                    <h4 style="color:#ff4d4d; font-size:1.4rem; margin-bottom:1rem;">⚠️ 클래스 삭제 주의사항</h4>
                    <p style="color:#ccc; margin-bottom:1.5rem; line-height:1.6;">
                        클래스를 삭제하면 모든 수강생 정보, 후기, 채팅 메시지, 쿠폰 등<br>
                        <strong>관련된 모든 데이터가 영구적으로 삭제되며 복구할 수 없습니다.</strong><br>
                        정말 삭제하시겠습니까?
                    </p>
                    <div style="display:flex; flex-direction:column; align-items:center; gap:15px;">
                        <input type="text" id="deleteConfirmInput" placeholder="삭제를 원하시면 클래스 제목을 정확히 입력하세요" 
                            style="width:100%; max-width:400px; padding:12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:rgba(0,0,0,0.3); color:#fff; text-align:center;">
                        <button class="btn-submit" id="btnDeleteClassFinal" 
                            style="background:#ff4d4d; border:none; padding:12px 40px; border-radius:30px; color:#fff; font-weight:800; cursor:pointer; box-shadow: 0 4px 15px rgba(255,77,77,0.3);">
                            🗑️ 클래스 영구 삭제
                        </button>
                    </div>
                </div>
            </div>

        </div>
    `;

    // ========================
    // 3-1. Quill 리치 텍스트 에디터 연동
    // ========================
    let quillObj;
    setTimeout(() => {
        const container = document.getElementById('editDescriptionContainer');
        if (container && window.Quill) {
            quillObj = new Quill('#editDescriptionContainer', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image', 'video'],
                        ['clean']
                    ]
                }
            });
            quillObj.root.innerHTML = classData.description || '';
            
            // 변경 내용을 textarea에 동기화
            quillObj.on('text-change', () => {
                document.getElementById('editDescription').value = quillObj.root.innerHTML;
            });
            document.getElementById('editDescription').value = quillObj.root.innerHTML;
        }
    }, 100);

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

            console.log("📤 Saving to D1 Database (API):", updates);
            // D1 업데이트 API 통신
            const response = await window.BSQ.api('/api/classes/update', {
                method: 'PUT',
                body: JSON.stringify({
                    class_id: classId,
                    updates: updates
                })
            });

            if (!response.success) {
                throw new Error(response.error || '업데이트 실패');
            }
            console.log("✅ D1 update successful");

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
                // 즉시 DB 반영 (D1 API)
                window.BSQ.api('/api/classes/update', {
                    method: 'PUT',
                    body: JSON.stringify({ class_id: classId, updates: { sub_instructors: subInstructors } })
                }).then(res => {
                    if (res.success && typeof showToast === 'function') showToast('info', '서브 강사 제거', '목록에서 제거되었습니다.');
                }).catch(err => console.error(err));
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
                        .map(u => `
                            <div class="sub-search-item" 
                                style="padding:10px 14px; display:flex; align-items:center; gap:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                                <div style="width:28px; height:28px; border-radius:50%; background:#333; overflow:hidden; flex-shrink:0;">
                                    ${u.profile_image_url ? `<img src="${u.profile_image_url}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                                </div>
                                <div style="flex:1;">
                                    <div style="font-weight:600; font-size:0.85rem;">${u.name}</div>
                                    <div style="font-size:0.75rem; color:#888;">${u.email || ''}</div>
                                </div>
                                <button type="button" class="btn-add-sub-trigger" 
                                    data-id="${u.id}" data-name="${u.name}" data-email="${u.email || ''}" data-avatar="${u.profile_image_url || ''}"
                                    style="background:var(--comm-accent,#6c5ce7); color:#fff; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:0.8rem; font-weight:700;">등록</button>
                            </div>
                        `).join('');
                }
                subResults.style.display = 'block';

                // 등록 버튼 이벤트
                subResults.querySelectorAll('.btn-add-sub-trigger').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const newSub = {
                            id: btn.dataset.id,
                            name: btn.dataset.name,
                            email: btn.dataset.email,
                            avatar: btn.dataset.avatar
                        };

                        subInstructors.push(newSub);
                        renderSubInstructors();

                        // 즉시 DB 반영 (D1 API)
                        const res = await window.BSQ.api('/api/classes/update', {
                            method: 'PUT',
                            body: JSON.stringify({ class_id: classId, updates: { sub_instructors: subInstructors } })
                        });

                        if (!res.success) {
                            alert('서브 강사 등록에 실패했습니다: ' + res.error);
                            // 롤백
                            subInstructors.pop();
                            renderSubInstructors();
                            return;
                        }

                        subSearchInput.value = '';
                        subResults.style.display = 'none';

                        if (typeof showToast === 'function') showToast('success', '등록 완료 ✅', `${newSub.name} 님이 서브 강사로 등록되었습니다.`);
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

    // ========================
    // 9. 탭 전환 로직
    // ========================
    const dbTabBtns = document.querySelectorAll('.db-tab-btn');
    const dbTabContents = document.querySelectorAll('.db-tab-content');

    dbTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;

            dbTabBtns.forEach(b => {
                b.classList.remove('active');
                b.style.color = '#888';
                b.style.borderBottom = 'none';
            });
            btn.classList.add('active');
            btn.style.color = '#fff';
            btn.style.borderBottom = '2px solid var(--comm-accent)';

            dbTabContents.forEach(c => c.style.display = 'none');
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.style.display = 'block';

            if (target === 'dbTabStudents') loadStudents(classId, db, supabase);
            if (target === 'dbTabCoupons') loadCoupons(classId, db);
        });
    });

    // ========================
    // 10. 수강생 및 결제 통계 로드
    // ========================
    async function loadStudents(classId, db, supabase) {
        const statsArea = document.getElementById('studentStatsArea');
        const listArea = document.getElementById('studentListArea');
        if(!statsArea || !listArea) return;

        statsArea.innerHTML = '<div class="edit-loading">데이터를 불러오는 중...</div>';
        listArea.innerHTML = '<div class="edit-loading">수강생 목록 로드 중...</div>';

        try {
            // D1 API: 해당 클래스의 수강생 목록 조회
            const res = await window.BSQ.api(`/api/enrollments?class_id=${classId}`);
            if (res.success && res.data) {
                const students = res.data.enrollments || [];
                statsArea.innerHTML = `
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px;">
                        <div class="edit-stat-card"><span class="stat-num">${students.length}</span><span class="stat-label">총 수강생</span></div>
                        <div class="edit-stat-card"><span class="stat-num">${students.filter(s => s.payment_method === 'card').length}</span><span class="stat-label">유료 결제</span></div>
                        <div class="edit-stat-card"><span class="stat-num">${students.filter(s => s.payment_method === 'free').length}</span><span class="stat-label">무료 신청</span></div>
                    </div>
                `;

                if (students.length === 0) {
                    listArea.innerHTML = '<p class="edit-empty-msg">아직 수강생이 없습니다.</p>';
                } else {
                    listArea.innerHTML = students.map(s => `
                        <div class="student-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid rgba(255,255,255,0.05);">
                            <div>
                                <div style="font-weight:600;">${s.user_name || '익명'}</div>
                                <div style="font-size:0.8rem; color:#888;">${s.user_email || ''}</div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:0.8rem; color:var(--comm-accent);">${s.payment_method === 'card' ? '유료 수강' : '무료 수강'}</div>
                                <div style="font-size:0.7rem; color:#666;">${new Date(s.created_at).toLocaleDateString()}</div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        } catch (err) {
            statsArea.innerHTML = '<p style="color:red;">데이터 로드 실패</p>';
        }
    }

    // ========================
    // 11. 쿠폰 관리 로드
    // ========================
    async function loadCoupons(classId, db) {
        const couponListArea = document.getElementById('couponListArea');
        if(!couponListArea) return;

        couponListArea.innerHTML = '<div class="edit-loading">쿠폰 목록 로드 중...</div>';

        try {
            const res = await window.BSQ.api(`/api/coupons?class_id=${classId}`);
            if (res.success && res.data) {
                const coupons = Array.isArray(res.data) ? res.data : [res.data];
                if (coupons.length === 0 || !coupons[0].code) {
                    couponListArea.innerHTML = '<p class="edit-empty-msg">발행된 쿠폰이 없습니다.</p>';
                } else {
                    couponListArea.innerHTML = coupons.map(c => `
                        <div class="coupon-item" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:12px; border-radius:10px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.05);">
                            <div>
                                <div style="font-weight:800; color:var(--comm-accent); letter-spacing:1px;">${c.coupon_code}</div>
                                <div style="font-size:0.8rem; color:#aaa;">${c.type === 'percent' ? c.value + '%' : c.value.toLocaleString() + '원'} 할인</div>
                            </div>
                            <div style="text-align:right;">
                                <div style="font-size:0.75rem;">사용: ${c.used_count || 0} / ${c.limit_count === 0 ? '무제한' : c.limit_count}</div>
                                <button class="btn-delete-coupon" data-code="${c.coupon_code}" style="background:none; border:none; color:#ff4d4d; cursor:pointer; font-size:0.8rem; margin-top:4px;">삭제</button>
                            </div>
                        </div>
                    `).join('');

                    // 쿠폰 삭제 이벤트
                    couponListArea.querySelectorAll('.btn-delete-coupon').forEach(btn => {
                        btn.onclick = async () => {
                            if (!confirm('쿠폰을 삭제하시겠습니까?')) return;
                            const res = await window.BSQ.api(`/api/coupons?class_id=${classId}&code=${btn.dataset.code}`, { method: 'DELETE' });
                            if (res.success) {
                                showToast('info', '쿠폰 삭제', '쿠폰이 성공적으로 삭제되었습니다.');
                                loadCoupons(classId, db);
                            }
                        };
                    });
                }
            }
        } catch (err) {
            couponListArea.innerHTML = '<p style="color:red;">쿠폰 로드 실패</p>';
        }
    }

    const btnCreateCoupon = document.getElementById('btnCreateCoupon');
    if(btnCreateCoupon) {
        btnCreateCoupon.onclick = async (e) => {
            e.preventDefault();
            const code = document.getElementById('newCouponCode').value.trim();
            const value = parseInt(document.getElementById('newCouponValue').value);
            const type = document.getElementById('newCouponType').value;
            const limit = parseInt(document.getElementById('newCouponLimit').value) || 0;

            if (!code || isNaN(value)) {
                alert('쿠폰 코드와 할인 금액/비율을 입력해주세요.');
                return;
            }

            btnCreateCoupon.disabled = true;
            btnCreateCoupon.textContent = '생성 중...';

            try {
                const res = await window.BSQ.api('/api/coupons', {
                    method: 'POST',
                    body: JSON.stringify({
                        class_id: classId,
                        code: code,
                        type: type,
                        value: value,
                        max_limit: limit
                    })
                });

                if (res.success) {
                    showToast('success', '쿠폰 발급 완료 🎟️', `[${code}] 쿠폰이 생성되었습니다.`);
                    document.getElementById('newCouponCode').value = '';
                    document.getElementById('newCouponValue').value = '';
                    loadCoupons(classId, db);
                } else {
                    alert('쿠폰 생성 실패: ' + res.error);
                }
            } catch (err) {
                alert('통신 오류 발생');
            } finally {
                btnCreateCoupon.disabled = false;
                btnCreateCoupon.textContent = '쿠폰 생성';
            }
        };
    }

    // ========================
    // 12. 클래스 삭제 로직
    // ========================
    const btnDeleteFinal = document.getElementById('btnDeleteClassFinal');
    if (btnDeleteFinal) {
        btnDeleteFinal.onclick = async () => {
            const confirmInput = document.getElementById('deleteConfirmInput');
            const userInput = confirmInput.value.trim();
            const classTitle = classData.title.trim();

            if (userInput !== classTitle) {
                alert('클래스 제목이 일치하지 않습니다. 삭제를 원하시면 정확히 입력해 주세요.');
                return;
            }

            if (!confirm(`'${classTitle}' 클래스를 정말로 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
                return;
            }

            btnDeleteFinal.disabled = true;
            btnDeleteFinal.textContent = '🗑️ 삭제 중...';

            try {
                const res = await window.BSQ.api(`/api/classes?id=${classId}`, {
                    method: 'DELETE'
                });

                if (res.success) {
                    alert('클래스가 성공적으로 삭제되었습니다.');
                    location.href = '/'; // 메인 페이지로 이동
                } else {
                    alert('삭제 실패: ' + (res.error || '알 수 없는 오류'));
                    btnDeleteFinal.disabled = false;
                    btnDeleteFinal.textContent = '🗑️ 클래스 영구 삭제';
                }
            } catch (err) {
                alert('통신 오류가 발생했습니다.');
                btnDeleteFinal.disabled = false;
                btnDeleteFinal.textContent = '🗑️ 클래스 영구 삭제';
            }
        };
    }
};
