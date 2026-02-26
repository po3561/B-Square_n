// view_edit.js - Instructor Class Editor Module
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initEdit = function (db, classId, classData, supabase, userId) {
    console.log("✏️ Edit Module Initializing...");

    const container = document.getElementById('editTabContainer');
    if (!container) return;

    const categories = ['디자인', '생산성', '스포츠', '디지털 드로잉', '성공 마인드', '음악', '베이킹', '사진', '영상', '공예'];
    const catOptions = categories.map(c => `<option value="${c}" ${classData.category === c ? 'selected' : ''}>${c}</option>`).join('');

    // 커리큘럼 데이터 준비
    const curriculum = classData.curriculum || [];
    const curriculumHTML = curriculum.map((ch, i) => `
        <div class="edit-chapter-item" data-index="${i}">
            <div class="edit-chapter-row">
                <span class="edit-chapter-num">챕터 ${i + 1}</span>
                <input type="text" class="edit-chapter-title" value="${ch.title || ''}" placeholder="챕터 제목">
                <button type="button" class="btn-remove-chapter" data-index="${i}">✕</button>
            </div>
        </div>
    `).join('');

    // 키워드 준비
    const keywords = Array.isArray(classData.keywords) ? classData.keywords.join(', ') : (classData.keywords || '');

    container.innerHTML = `
        <div class="edit-panel">
            <div class="edit-panel-header">
                <span class="edit-badge">👨‍🏫 강사 관리 패널</span>
                <p class="edit-panel-desc">클래스의 모든 내용을 수정할 수 있습니다. 변경 사항은 Firebase에 실시간 반영됩니다.</p>
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
                                <option value="VOD" ${classData.class_type === 'VOD' ? 'selected' : ''}>VOD</option>
                                <option value="LIVE" ${classData.class_type === 'LIVE' ? 'selected' : ''}>LIVE</option>
                                <option value="KIT" ${classData.class_type === 'KIT' ? 'selected' : ''}>KIT</option>
                            </select>
                        </div>
                    </div>
                    <div class="edit-field">
                        <label>키워드 (쉼표로 구분)</label>
                        <input type="text" id="editKeywords" value="${keywords}" placeholder="예: 디자인, 포토샵, 기초">
                    </div>
                </div>

                <!-- 소개 -->
                <div class="edit-section">
                    <h4 class="edit-section-title">📝 클래스 소개</h4>
                    <div class="edit-field">
                        <label>요약</label>
                        <textarea id="editSummary" rows="2" placeholder="클래스 요약 설명">${classData.summary || ''}</textarea>
                    </div>
                    <div class="edit-field">
                        <label>상세 설명</label>
                        <textarea id="editDescription" rows="6" placeholder="클래스 상세 설명">${classData.description || ''}</textarea>
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
                        ${curriculumHTML}
                    </div>
                    <button type="button" id="btnAddEditChapter" class="btn-add-chapter">+ 챕터 추가</button>
                </div>

                <!-- 저장 -->
                <div class="edit-actions">
                    <button type="submit" class="btn-edit-save" id="btnEditSave">
                        <span>💾 변경 사항 저장</span>
                    </button>
                </div>
            </form>
        </div>
    `;

    // 가격 미리보기 업데이트
    function updatePricePreview() {
        const price = parseInt(document.getElementById('editPrice').value) || 0;
        const discount = parseInt(document.getElementById('editDiscount').value) || 0;
        const finalPrice = discount > 0 ? Math.round(price * (1 - discount / 100)) : price;
        const preview = document.getElementById('editPricePreview');
        if (preview) {
            if (price === 0) {
                preview.innerHTML = '<span class="preview-free">무료 클래스</span>';
            } else if (discount > 0) {
                preview.innerHTML = `<span class="preview-original">${price.toLocaleString()}원</span> → <span class="preview-final">${finalPrice.toLocaleString()}원</span>`;
            } else {
                preview.innerHTML = `<span class="preview-final">${price.toLocaleString()}원</span>`;
            }
        }
    }

    document.getElementById('editPrice')?.addEventListener('input', updatePricePreview);
    document.getElementById('editDiscount')?.addEventListener('input', updatePricePreview);
    updatePricePreview();

    // 챕터 추가
    document.getElementById('btnAddEditChapter')?.addEventListener('click', () => {
        const list = document.getElementById('editCurriculumList');
        const count = list.children.length;
        const div = document.createElement('div');
        div.className = 'edit-chapter-item';
        div.dataset.index = count;
        div.innerHTML = `
            <div class="edit-chapter-row">
                <span class="edit-chapter-num">챕터 ${count + 1}</span>
                <input type="text" class="edit-chapter-title" value="" placeholder="챕터 제목">
                <button type="button" class="btn-remove-chapter" data-index="${count}">✕</button>
            </div>
        `;
        list.appendChild(div);
        attachRemoveChapterEvent(div.querySelector('.btn-remove-chapter'));
    });

    // 챕터 삭제 이벤트
    function attachRemoveChapterEvent(btn) {
        btn.addEventListener('click', () => {
            btn.closest('.edit-chapter-item').remove();
            // 번호 재정렬
            document.querySelectorAll('.edit-chapter-item').forEach((item, i) => {
                item.querySelector('.edit-chapter-num').textContent = `챕터 ${i + 1}`;
            });
        });
    }

    document.querySelectorAll('.btn-remove-chapter').forEach(attachRemoveChapterEvent);

    // 폼 제출 → Firebase 업데이트
    document.getElementById('editForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const saveBtn = document.getElementById('btnEditSave');
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<span>저장 중...</span>';
        saveBtn.disabled = true;

        try {
            const chapters = Array.from(document.querySelectorAll('.edit-chapter-title')).map(input => ({
                title: input.value.trim()
            })).filter(ch => ch.title);

            const keywordsStr = document.getElementById('editKeywords').value;
            const keywordsArr = keywordsStr.split(',').map(k => k.trim()).filter(k => k);

            const updates = {
                title: document.getElementById('editTitle').value.trim(),
                category: document.getElementById('editCategory').value,
                class_type: document.getElementById('editClassType').value,
                keywords: keywordsArr,
                summary: document.getElementById('editSummary').value.trim(),
                description: document.getElementById('editDescription').value.trim(),
                price: parseInt(document.getElementById('editPrice').value) || 0,
                discount_rate: parseInt(document.getElementById('editDiscount').value) || 0,
                curriculum: chapters
            };

            await db.ref(`classes/${classId}`).update(updates);

            // 페이지 정보 실시간 반영
            if (typeof renderCorePageInfo === 'function') {
                renderCorePageInfo({ ...classData, ...updates });
            }
            // classData 갱신
            Object.assign(classData, updates);

            // 소개/커리큘럼 모듈 재렌더링
            if (window.BSquareModules.initIntro) window.BSquareModules.initIntro(classData);
            if (window.BSquareModules.initCurriculum) window.BSquareModules.initCurriculum(classData);

            if (typeof showToast === 'function') {
                showToast('success', '수정 완료 ✅', '클래스 정보가 실시간으로 업데이트되었습니다.');
            }
        } catch (err) {
            console.error("Edit Save Error:", err);
            if (typeof showToast === 'function') {
                showToast('error', '저장 실패', '클래스 정보 저장에 실패했습니다.');
            }
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    });
};
