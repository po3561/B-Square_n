// create_class.js

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 B-Square Create Class Page Initializing...");

    // header.js가 Supabase/Firebase 초기화 및 유저 메뉴를 처리함
    // 여기서는 초기화 완료를 대기
    const waitForInit = () => new Promise((resolve) => {
        const check = () => {
            if (window.supabaseClient && (typeof firebase !== 'undefined' && firebase.apps.length > 0)) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
        setTimeout(resolve, 3000); // 3초 타임아웃
    });
    await waitForInit();

    const supabase = window.supabaseClient;
    const isFirebaseReady = typeof firebase !== 'undefined' && firebase.apps.length > 0;

    // 3. 로그인 세션 확인 (운영자 모드 우회 지원)
    try {
        let session = null;
        let userId = null;
        const isOperator = window.__BSQ_DEV_MODE__ === true;

        // Supabase 세션 확인 (에러 시 무시)
        try {
            if (supabase && supabase.auth) {
                const { data } = await supabase.auth.getSession();
                session = data?.session || null;
            }
        } catch (e) {
            console.warn('Session check error:', e);
        }

        if (!session && !isOperator) {
            alert("클래스 개설을 위해 로그인이 필요합니다.");
            window.location.href = '../login/login.html';
            return;
        }

        // ★ 운영자 모드: 가상 계정으로 클래스 등록
        if (isOperator) {
            userId = 'OPERATOR_GHOST';
            if (!session) {
                session = { user: { id: 'OPERATOR_GHOST', email: 'operator@b-square.kr' } };
            }
            console.log('🛡️ 운영자 모드: 클래스 등록 가능');
        } else {
            userId = session.user.id;
        }

        // Quill.js 리치 텍스트 에디터 초기화
        let quillEditor = null;
        const quillContainer = document.getElementById('quillEditor');
        if (quillContainer && typeof Quill !== 'undefined') {
            quillEditor = new Quill('#quillEditor', {
                theme: 'snow',
                placeholder: '클래스에 대해 자세히 설명해주세요. 서식, 이미지, 링크 등을 자유롭게 사용할 수 있습니다.',
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

        // 계좌이체 토글 로직
        const payBankCheckbox = document.getElementById('payBank');
        const bankTransferInfo = document.getElementById('bankTransferInfo');
        if (payBankCheckbox && bankTransferInfo) {
            payBankCheckbox.addEventListener('change', () => {
                bankTransferInfo.style.display = payBankCheckbox.checked ? 'block' : 'none';
            });
        }

        // UI 변수 세팅
        let currentStep = 1;
        const totalSteps = 5;
        const form = document.getElementById('createClassForm');
        const sections = document.querySelectorAll('.form-section');
        const stepItems = document.querySelectorAll('.step-item');
        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');
        const btnSubmit = document.getElementById('btnSubmit');

        // 단계 이동 함수
        function updateSteps() {
            sections.forEach(s => s.classList.remove('active'));
            const currentSection = document.getElementById(`section${currentStep}`);
            if (currentSection) currentSection.classList.add('active');

            stepItems.forEach(item => {
                const stepNum = parseInt(item.getAttribute('data-step'));
                item.classList.remove('active', 'completed');
                if (stepNum === currentStep) item.classList.add('active');
                else if (stepNum < currentStep) item.classList.add('completed');
            });

            btnPrev.disabled = currentStep === 1;
            if (currentStep === totalSteps) {
                btnNext.style.display = 'none';
                btnSubmit.hidden = false;
                btnSubmit.style.display = 'block';
            } else {
                btnNext.style.display = 'block';
                btnSubmit.hidden = true;
                btnSubmit.style.display = 'none';
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        btnNext.addEventListener('click', () => { if (currentStep < totalSteps) { currentStep++; updateSteps(); } });
        btnPrev.addEventListener('click', () => { if (currentStep > 1) { currentStep--; updateSteps(); } });

        // 커리큘럼 추가
        const curriculumList = document.getElementById('curriculumList');
        const btnAddChapter = document.getElementById('btnAddChapter');

        function createChapterItem() {
            const index = curriculumList.children.length + 1;
            const div = document.createElement('div');
            div.className = 'input-group chapter-item';
            div.style.cssText = 'background: rgba(255,255,255,0.02); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--glass-border); margin-bottom: 1rem;';
            div.innerHTML = `
                <label>챕터 ${index}</label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" class="chapter-title" placeholder="챕터 제목을 입력하세요" required>
                    <button type="button" class="btn-remove" style="background: rgba(255,0,0,0.1); color: #ff4757; padding: 0.5rem 1rem; border-radius: 8px; border: none; cursor: pointer;">삭제</button>
                </div>
            `;
            div.querySelector('.btn-remove').addEventListener('click', () => {
                div.remove();
                Array.from(curriculumList.children).forEach((child, i) => {
                    child.querySelector('label').textContent = `챕터 ${i + 1}`;
                });
            });
            return div;
        }

        if (btnAddChapter) {
            btnAddChapter.addEventListener('click', () => curriculumList.appendChild(createChapterItem()));
            if (curriculumList.children.length === 0) curriculumList.appendChild(createChapterItem());
        }

        // --- 이미지 압축 유틸리티 (Firebase 10MB 제한 방지) ---
        function compressImage(file, maxWidth = 800, quality = 0.6) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let w = img.width;
                        let h = img.height;
                        if (w > maxWidth) {
                            h = Math.round(h * maxWidth / w);
                            w = maxWidth;
                        }
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        // --- 다중 이미지 업로드 로직 ---
        const uploadedImages = []; // 압축된 Base64 이미지 배열
        const imageUploadGrid = document.getElementById('imageUploadGrid');
        const classImageInput = document.getElementById('classImage');
        const btnUploadImage = document.getElementById('btnUploadImage');

        btnUploadImage?.addEventListener('click', () => classImageInput.click());

        classImageInput?.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);

            for (const file of files) {
                if (uploadedImages.length >= 6) break;
                const compressed = await compressImage(file, 800, 0.6);
                uploadedImages.push(compressed);
            }
            renderImageGrid();
            // 입력값 초기화 (같은 파일 다시 올릴 수 있게)
            classImageInput.value = '';
        });

        function renderImageGrid() {
            // 버튼 제외한 기존 이미지 아이템들 삭제
            const items = imageUploadGrid.querySelectorAll('.image-item');
            items.forEach(item => item.remove());

            uploadedImages.forEach((src, index) => {
                const div = document.createElement('div');
                div.className = `image-item ${index === 0 ? 'representative' : ''}`;
                div.innerHTML = `
                    <img src="${src}" alt="Preview ${index + 1}">
                    <button type="button" class="btn-remove-img" data-index="${index}">✕</button>
                `;

                div.querySelector('.btn-remove-img').addEventListener('click', (e) => {
                    e.stopPropagation();
                    uploadedImages.splice(index, 1);
                    renderImageGrid();
                });

                imageUploadGrid.insertBefore(div, btnUploadImage);
            });

            // 6개 꽉 차면 업로드 버튼 숨김
            if (btnUploadImage) {
                btnUploadImage.style.display = uploadedImages.length >= 6 ? 'none' : 'flex';
            }
        }

        // 최종 제출
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 이미지 개수 검증 (3~6장)
            if (uploadedImages.length < 3) {
                alert("최소 3장의 커버 이미지를 등록해 주세요.");
                // 이미지 섹션(2단계)으로 이동시켜주는 배려
                currentStep = 2;
                updateSteps();
                return;
            }

            const originalBtnText = btnSubmit.textContent;
            btnSubmit.textContent = "클래스 등록 중...";
            btnSubmit.disabled = true;

            try {
                const chapters = Array.from(document.querySelectorAll('.chapter-title')).map(input => ({
                    title: input.value
                }));

                if (chapters.length === 0) throw new Error("최소 하나 이상의 챕터를 추가해 주세요.");

                const classData = {
                    creator_id: userId,
                    creator_email: session.user.email || '',
                    title: document.getElementById('classTitle').value,
                    category: document.getElementById('classCategory').value,
                    keywords: document.getElementById('classKeywords').value.split(',').map(k => k.trim()),
                    summary: document.getElementById('classSummary').value,
                    description: (() => {
                        let html = quillEditor ? quillEditor.root.innerHTML : (document.getElementById('classDescription')?.value || '');
                        // Quill 에디터에 삽입된 Base64 이미지 태그 제거 (Firebase 용량 초과 방지)
                        html = html.replace(/<img[^>]+src="data:image\/[^"]+"[^>]*>/gi, '');
                        return html;
                    })(),
                    description_text: quillEditor ? quillEditor.getText() : '',
                    price: parseInt(document.getElementById('classPrice').value) || 0,
                    discount_rate: parseInt(document.getElementById('classDiscount')?.value) || 0,
                    coupon_pack: document.getElementById('classCoupon')?.checked || false,
                    class_type: form.querySelector('input[name="classType"]:checked')?.value || 'VOD',
                    payment_methods: {
                        card: document.getElementById('payCard')?.checked || false,
                        bank_transfer: document.getElementById('payBank')?.checked || false,
                        bank_name: document.getElementById('bankName')?.value || '',
                        bank_account: document.getElementById('bankAccount')?.value || '',
                        bank_holder: document.getElementById('bankHolder')?.value || ''
                    },
                    image_url: uploadedImages[0],
                    image_urls: uploadedImages,
                    curriculum: chapters,
                    created_at: Date.now()
                };

                if (isFirebaseReady) {
                    const newClassRef = firebase.database().ref('classes').push();
                    await newClassRef.set(classData);
                } else {
                    throw new Error("파이어베이스 서버와 연결되지 않았습니다.");
                }

                alert("축하합니다! 클래스가 성공적으로 개설되었습니다.");
                window.location.href = '../mi_pesg/mypage.html';

            } catch (error) {
                alert("개설 실패: " + error.message);
            } finally {
                btnSubmit.textContent = originalBtnText;
                btnSubmit.disabled = false;
            }
        });

    } catch (sessionErr) {
        console.error("Session check error:", sessionErr);
    }

    // renderUserMenu는 header.js에서 처리 — 중복 제거됨
});