// create_class.js — 클래스 개설 (D1 API 연동)

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 B-Square Create Class Page Initializing (v2 Logic)...");

    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
    
    // Lucide Icons 초기화
    if (typeof lucide !== 'undefined') {
        setTimeout(() => lucide.createIcons(), 100);
    }

    const session = window.BSQ?.session;
    const isOperator = window.__BSQ_DEV_MODE__ === true;

    if (!session && !isOperator) {
        alert("클래스 개설을 위해 로그인이 필요합니다.");
        window.location.href = '../login/login.html';
        return;
    }

    let userId = isOperator ? 'OPERATOR_GHOST' : session.user.id;
    let userEmail = isOperator ? 'operator@b-square.kr' : session.user.email;

    const DEFAULT_CATEGORY_SEEDS = [
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

    function escapeHtml(value = '') {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function populateCategoryDropdown() {
        const dropdown = document.getElementById('categoryDropdown');
        const list = dropdown?.querySelector('.dropdown-list');
        if (!list) return;

        let categories = DEFAULT_CATEGORY_SEEDS;
        try {
            const res = await window.BSQ.api('/api/class-categories', { cacheBust: false });
            if (res.success && Array.isArray(res.data) && res.data.length > 0) {
                categories = res.data.map((item) => ({
                    name: String(item.name || '').trim(),
                    emoji: String(item.emoji || '✨').trim() || '✨',
                })).filter((item) => item.name);
            }
        } catch (error) {
            console.warn('[create_class] category load failed, using fallback:', error);
        }

        list.innerHTML = categories.map((item) => `
            <div class="dropdown-item" data-value="${escapeHtml(item.name)}">${escapeHtml(item.emoji || '✨')} ${escapeHtml(item.name)}</div>
        `).join('');
    }

    // --- Quill.js 에디터 ---
    let quillEditor = null;
    const quillContainer = document.getElementById('quillEditor');
    if (quillContainer && typeof Quill !== 'undefined') {
        quillEditor = new Quill('#quillEditor', {
            theme: 'snow',
            placeholder: '클래스에 대해 자세히 설명해주세요.',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    [{ 'align': [] }],
                    ['link', 'image'],
                    ['blockquote', 'code-block'],
                    ['clean']
                ]
            }
        });
    }

    // --- UI 변수 및 스텝 네비게이션 ---
    let currentStep = 1;
    const totalSteps = 7;
    const form = document.getElementById('createClassForm');
    const sections = document.querySelectorAll('.form-section');
    const stepItems = document.querySelectorAll('.step-item');
    const btnPrev = document.getElementById('btnPrev');
    const btnNext = document.getElementById('btnNext');
    const btnSubmit = document.getElementById('btnSubmit');
    const mobileStepDots = document.querySelectorAll('.mobile-nav-dots .nav-dot');
    const mobileProgressFill = document.getElementById('mobileProgressFill');
    const mobileStepLabel = document.getElementById('mobileStepLabel');

    function updateSteps() {
        sections.forEach(s => s.classList.remove('active'));
        const currentSection = document.getElementById(`section${currentStep}`);
        if (currentSection) currentSection.classList.add('active');

        // 스텝 이동시 아이콘 다시 생성 (동적 요소 대응)
        if (typeof lucide !== 'undefined') {
            setTimeout(() => lucide.createIcons(), 50);
        }

        stepItems.forEach(item => {
            const stepNum = parseInt(item.getAttribute('data-step'));
            item.classList.remove('active', 'completed');
            if (stepNum === currentStep) item.classList.add('active');
            else if (stepNum < currentStep) item.classList.add('completed');
        });

                // 모바일 단계 업데이트 (연동성 강화)
        mobileStepDots.forEach(dot => {
            const stepNum = parseInt(dot.getAttribute('data-step'));
            if (stepNum === currentStep) {
                dot.classList.add('active');
                dot.classList.remove('completed');
            } else if (stepNum < currentStep) {
                dot.classList.remove('active');
                dot.classList.add('completed');
            } else {
                dot.classList.remove('active');
                dot.classList.remove('completed');
            }
        });

        if (mobileProgressFill) {
            // 현재 단계가 1이면 0%, 7이면 100%로 보이고 싶다면 ((currentStep-1)/(totalSteps-1))*100
            // 하지만 보통 현재 단계를 포함하는 진행바라면 (currentStep / totalSteps) * 100이 맞음
            const progress = (currentStep / totalSteps) * 100;
            mobileProgressFill.style.width = `${progress}%`;
        }

        if (mobileStepLabel) {
            // 사이드바의 step-item에서 텍스트를 가져옴
            const activeSidebarItem = Array.from(stepItems).find(item => parseInt(item.getAttribute('data-step')) === currentStep);
            if (activeSidebarItem) {
                const text = activeSidebarItem.querySelector('.step-text').textContent;
                mobileStepLabel.textContent = text;
            }
        }

        btnPrev.disabled = currentStep === 1;

        const isFree = form.querySelector('input[name="isFree"]:checked')?.value === 'true';
        
        if (currentStep === 6 && isFree) {
            btnNext.style.display = 'none';
            btnSubmit.style.display = 'flex';
        } else if (currentStep === totalSteps) {
            btnNext.style.display = 'none';
            btnSubmit.style.display = 'flex';
        } else {
            btnNext.style.display = 'flex';
            btnSubmit.style.display = 'none';
        }

        window.scrollTo({ top: 300, behavior: 'smooth' });
    }

    btnNext.addEventListener('click', () => {
        const isFree = form.querySelector('input[name="isFree"]:checked')?.value === 'true';
        if (currentStep === 6 && isFree) {
            // 무료면 다음 버튼 눌러도 제출 로직으로 유도 (UI상으로는 숨김 처리됨)
            return;
        }
        if (currentStep < totalSteps) { currentStep++; updateSteps(); }
    });

    btnPrev.addEventListener('click', () => { if (currentStep > 1) { currentStep--; updateSteps(); } });

    // --- 프리미엄 커스텀 드롭다운 로직 ---
    function setupPremiumDropdown(dropdownId, onSelect = null) {
        const dropdown = document.getElementById(dropdownId);
        if (!dropdown) return;
        if (dropdown.dataset.bound === '1') return;
        dropdown.dataset.bound = '1';

        const selected = dropdown.querySelector('.dropdown-selected');
        const list = dropdown.querySelector('.dropdown-list');
        const hiddenInput = dropdown.querySelector('input[type="hidden"]');

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // 다른 드롭다운 닫기
            document.querySelectorAll('.premium-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('active');
            });
            dropdown.classList.toggle('active');
        });

        list?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;
            const value = item.dataset.value;
            const html = item.innerHTML;

            selected.innerHTML = `${html} <i data-lucide="chevron-down"></i>`;
            hiddenInput.value = value;
            dropdown.classList.remove('active');

            if (typeof lucide !== 'undefined') lucide.createIcons();
            if (onSelect) onSelect(value);
        });
    }

    // 카테고리 드롭다운 설정
    await populateCategoryDropdown();
    setupPremiumDropdown('categoryDropdown');

    // --- 원데이 클래스 제약 ---
    // const operatingModeSelect = document.getElementById('classOperatingMode'); // Replaced by dropdown
    const useMonthlyPass = document.getElementById('useMonthlyPass');
    const usePackagePass = document.getElementById('usePackagePass');

    // 운영 방식 드롭다운 설정
    setupPremiumDropdown('operatingModeDropdown', (value) => {
        const isOneDay = value === 'ONEDAY';
        if (isOneDay) {
            useMonthlyPass.checked = false;
            usePackagePass.checked = false;
            useMonthlyPass.disabled = true;
            usePackagePass.disabled = true;
            document.getElementById('monthlyPassInput').style.display = 'none';
            document.getElementById('packagePassInput').style.display = 'none';
        } else {
            useMonthlyPass.disabled = false;
            usePackagePass.disabled = false;
        }
    });

    // 문서 클릭 시 드롭다운 닫기
    document.addEventListener('click', () => {
        document.querySelectorAll('.premium-dropdown').forEach(d => d.classList.remove('active'));
    });

    window.addEventListener('bsq_sync', (event) => {
        if (event.detail?.type === 'class-categories') {
            populateCategoryDropdown();
        }
    });

    // --- 제목 글자수 카운터 ---
    const classTitleInput = document.getElementById('classTitle');
    const charCounter = document.querySelector('.char-counter');
    classTitleInput?.addEventListener('input', () => {
        const len = classTitleInput.value.length;
        charCounter.textContent = `${len}/50`;
        if (len >= 50) charCounter.style.color = 'var(--accent-color)';
        else charCounter.style.color = 'var(--text-secondary)';
    });

    // 무료/유료 선택 변경 시 버튼 상태 즉시 반영
    form.querySelectorAll('input[name="isFree"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (currentStep === 6) updateSteps();
        });
    });

    // 수강권 옵션 상세 토글
    useMonthlyPass?.addEventListener('change', () => {
        document.getElementById('monthlyPassInput').style.display = useMonthlyPass.checked ? 'block' : 'none';
    });
    usePackagePass?.addEventListener('change', () => {
        document.getElementById('packagePassInput').style.display = usePackagePass.checked ? 'flex' : 'none';
    });

    // 쿠폰 상세 필드 토글
    const classCouponBtn = document.getElementById('classCoupon');
    const couponDetailGroup = document.getElementById('couponDetailGroup');
    classCouponBtn?.addEventListener('change', () => {
        if (couponDetailGroup) {
            couponDetailGroup.style.display = classCouponBtn.checked ? 'block' : 'none';
        }
    });

    // --- 커리큘럼 관리 ---
    const curriculumList = document.getElementById('curriculumList');
    const btnAddChapter = document.getElementById('btnAddChapter');

    function createChapterItem() {
        const index = curriculumList.children.length + 1;
        const div = document.createElement('div');
        div.className = 'chapter-item';
        div.innerHTML = `
            <div class="chapter-header">
                <div class="chapter-title-row">
                    <span class="chapter-num">${index}</span>
                    <input type="text" class="premium-input chapter-title" placeholder="챕터 제목을 입력하세요" required style="flex:1;">
                </div>
                <button type="button" class="btn-remove-chapter"><i data-lucide="trash-2"></i> 삭제</button>
            </div>
            <div class="chapter-body">
                <div class="field-group">
                    <label>상세 내용</label>
                    <textarea class="premium-textarea chapter-detail" rows="2" placeholder="이 챕터에서 무엇을 배우나요?"></textarea>
                </div>
                <div class="field-group">
                    <label>준비물 및 챙겨야 할 것</label>
                    <input type="text" class="premium-input chapter-materials" placeholder="예: 개인 노트북, 필기도구 등">
                </div>
            </div>
        `;
        div.querySelector('.btn-remove-chapter').addEventListener('click', () => {
            div.remove();
            Array.from(curriculumList.children).forEach((child, i) => {
                child.querySelector('.chapter-num').textContent = i + 1;
            });
        });
        return div;
    }

    if (btnAddChapter) {
        btnAddChapter.addEventListener('click', () => {
            curriculumList.appendChild(createChapterItem());
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
        if (curriculumList.children.length === 0) {
            curriculumList.appendChild(createChapterItem());
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }

    // --- 서브 강사 로직 (기존 유지) ---
    let subInstructors = [];
    const subSearchInput = document.getElementById('subInstructorSearch');
    const subResults = document.getElementById('subInstructorResults');
    const subList = document.getElementById('subInstructorList');

    function renderSubInstructors() {
        if (!subList) return;
        if (subInstructors.length === 0) {
            subList.innerHTML = '<p class="empty-msg">추가된 서브 강사가 없습니다.</p>';
            return;
        }
        subList.innerHTML = subInstructors.map((si, i) => `
            <div class="sub-instructor-item">
                <div class="sub-instructor-info">
                    <div style="width:32px; height:32px; border-radius:50%; background:var(--accent-color); display:flex; align-items:center; justify-content:center; overflow:hidden;">
                        ${si.avatar ? `<img src="${si.avatar}" style="width:100%;height:100%;object-fit:cover;">` : '👤'}
                    </div>
                    <div>
                        <div style="font-weight:600; font-size:0.9rem;">${si.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-secondary);">${si.email || ''}</div>
                    </div>
                </div>
                <button type="button" class="btn-remove-sub" data-idx="${i}">✕</button>
            </div>
        `).join('');
        subList.querySelectorAll('.btn-remove-sub').forEach(btn => {
            btn.addEventListener('click', () => {
                subInstructors.splice(parseInt(btn.dataset.idx), 1);
                renderSubInstructors();
            });
        });
    }

    let searchTimeout = null;
    subSearchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = subSearchInput.value.trim();
        if (query.length < 1) { subResults.style.display = 'none'; return; }
        searchTimeout = setTimeout(async () => {
            try {
                const response = await window.BSQ.api(`/api/users/search?q=${encodeURIComponent(query)}`);
                if (!response.success) throw new Error(response.error);
                const data = response.data || [];
                subResults.innerHTML = data.map(u => `
                    <div class="search-result-item" data-id="${u.id}" data-name="${u.name}" data-email="${u.email}" data-avatar="${u.profile_image_url || ''}">
                        <div class="result-avatar">
                            ${u.profile_image_url ? `<img src="${u.profile_image_url}">` : '<i data-lucide="user"></i>'}
                        </div>
                        <div class="result-info">
                            <div class="result-name">${u.name}</div>
                            <div class="result-email">${u.email}</div>
                        </div>
                    </div>
                `).join('');
                if (typeof lucide !== 'undefined') lucide.createIcons();
                subResults.style.display = 'block';
                subResults.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const si = { id: item.dataset.id, name: item.dataset.name, email: item.dataset.email, avatar: item.dataset.avatar };
                        if (!subInstructors.some(existing => existing.id === si.id)) { subInstructors.push(si); renderSubInstructors(); }
                        subSearchInput.value = ''; subResults.style.display = 'none';
                    });
                });
            } catch (err) { console.error(err); }
        }, 300);
    });

    // --- 이미지 압축 및 업로드 ---
    const uploadedImages = [];
    const imageUploadGrid = document.getElementById('imageUploadGrid');
    const classImageInput = document.getElementById('classImage');
    const btnUploadImage = document.getElementById('btnUploadImage');

    function compressImage(file, maxWidth = 800, quality = 0.6) {
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

    btnUploadImage?.addEventListener('click', () => classImageInput.click());
    classImageInput?.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            if (uploadedImages.length >= 6) break;
            const compressed = await compressImage(file, 800, 0.6);
            uploadedImages.push(compressed);
        }
        renderImageGrid();
        classImageInput.value = '';
    });

    function renderImageGrid() {
        imageUploadGrid.querySelectorAll('.image-item').forEach(item => item.remove());
        uploadedImages.forEach((src, index) => {
            const div = document.createElement('div');
            div.className = `image-item ${index === 0 ? 'representative' : ''}`;
            div.innerHTML = `<img src="${src}"><button type="button" class="btn-remove-img" data-index="${index}">✕</button>`;
            div.querySelector('.btn-remove-img').addEventListener('click', (e) => {
                e.stopPropagation(); uploadedImages.splice(index, 1); renderImageGrid();
            });
            imageUploadGrid.insertBefore(div, btnUploadImage);
        });
        if (btnUploadImage) btnUploadImage.style.display = uploadedImages.length >= 6 ? 'none' : 'flex';
    }

    // --- 폼 제출 방지 (엔터 키 오작동 방지) ---
    form.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            return false;
        }
    });

    // --- 최종 제출 ---
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // [안전 장치] 마지막 단계가 아니면 제출 중단
        const isFree = form.querySelector('input[name="isFree"]:checked')?.value === 'true';
        const finalStep = isFree ? 6 : totalSteps;
        if (currentStep < finalStep) {
            console.warn("⚠️ Early submission blocked. Current step:", currentStep);
            return;
        }

        if (uploadedImages.length < 3) {
            alert("최소 3장의 커버 이미지를 등록해 주세요.");
            currentStep = 2; updateSteps(); return;
        }

        const btnText = btnSubmit.textContent;
        btnSubmit.textContent = "클래스 등록 중...";
        btnSubmit.disabled = true;

        try {
            const chapters = Array.from(curriculumList.children).map(child => ({
                title: child.querySelector('.chapter-title').value,
                detail: child.querySelector('.chapter-detail').value,
                materials: child.querySelector('.chapter-materials').value
            }));

            const classData = {
                instructor_id: userId,
                instructor_email: userEmail,
                sub_instructors: subInstructors,
                title: document.getElementById('classTitle').value,
                category: document.getElementById('classCategory').value,
                keywords: document.getElementById('classKeywords').value.split(',').map(k => k.trim()).filter(Boolean),
                target_audience: document.getElementById('classTargetAudience')?.value.split('\n').map(t => t.trim()).filter(Boolean) || [],
                summary: document.getElementById('classSummary').value,
                description: quillEditor ? quillEditor.root.innerHTML : '',
                description_text: quillEditor ? quillEditor.getText() : '',

                is_free: isFree,
                // 유료일 때만 데이터 캡처 (무료면 null/기본값)
                price_one_time: isFree ? 0 : (parseInt(document.getElementById('priceOneTime').value) || 0),
                discount_rate: isFree ? 0 : (parseInt(document.getElementById('classDiscount').value) || 0),
                price_monthly: (!isFree && useMonthlyPass.checked) ? (parseInt(document.getElementById('priceMonthly').value) || null) : null,
                price_multi: (!isFree && usePackagePass.checked) ? (parseInt(document.getElementById('priceMulti').value) || null) : null,
                pass_count: (!isFree && usePackagePass.checked) ? (parseInt(document.getElementById('passCount').value) || null) : null,
                
                coupon_pack: document.getElementById('classCoupon')?.checked || false,
                coupon_detail: document.getElementById('couponDetail')?.value || null,
                class_type: form.querySelector('input[name="classType"]:checked')?.value || 'ONLINE',
                operating_mode: document.getElementById('classOperatingMode').value,
                capacity_min: parseInt(document.getElementById('minCapacity').value) || 0,
                capacity_max: parseInt(document.getElementById('maxCapacity').value) || 0,

                payment_methods: {
                    card: document.getElementById('payCard')?.checked || false,
                    bank: document.getElementById('payBank')?.checked || false
                },
                bank_info: {
                    name: document.getElementById('bankName').value,
                    account: document.getElementById('bankAccount').value,
                    holder: document.getElementById('bankHolder').value
                },
                instructor_info: {
                    name: document.getElementById('instructorName').value,
                    phone: document.getElementById('instructorPhone').value,
                    email: document.getElementById('instructorEmail').value
                },

                image_url: uploadedImages[0],
                image_urls: uploadedImages,
                curriculum: chapters
            };

            const result = await window.BSQ.api('/api/classes/create', {
                method: 'POST',
                body: JSON.stringify(classData)
            });

            if (!result.success) throw new Error(result.error || '실패');

            alert("클래스가 성공적으로 개설되었습니다!");
            if (window.BSQ?.triggerSync) window.BSQ.triggerSync('create');
            window.location.href = '../mi_pesg/mypage.html';

        } catch (error) {
            alert("개설 실패: " + error.message);
        } finally {
            btnSubmit.textContent = btnText;
            btnSubmit.disabled = false;
        }
    });

    updateSteps();
});
