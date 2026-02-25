// create_class.js

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 B-Square Create Class Page Initializing...");

    // 1. 수파베이스 초기화 (오직 로그인 인증용으로만 사용)
    const supabaseUrl = 'https://tqyckxgtavviatkfsymb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

    // 2. 파이어베이스 초기화 (실제 데이터 저장소)
    const firebaseConfig = {
        apiKey: "AIzaSyDStdCCFWhlgcgDPXeKgSAwfTtbP9mjNyc",
        authDomain: "b-square-39b11.firebaseapp.com",
        databaseURL: "https://b-square-39b11-default-rtdb.firebaseio.com",
        projectId: "b-square-39b11",
        storageBucket: "b-square-39b11.firebasestorage.app",
        messagingSenderId: "1012056920961",
        appId: "1:1012056920961:web:8342bfdf123b78f6a38e80",
        measurementId: "G-TLQFK7FDY9"
    };

    let isFirebaseReady = false;
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            isFirebaseReady = true;
        }
    } catch (err) {
        console.error("❌ Firebase Initialization Error:", err);
    }

    // 3. 로그인 세션 확인
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("클래스 개설을 위해 로그인이 필요합니다.");
            window.location.href = '../login/login.html';
            return;
        }

        const userId = session.user.id;
        renderUserMenu(supabase, session);

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

        // --- 다중 이미지 업로드 로직 ---
        const uploadedImages = []; // Base64 이미지 배열
        const imageUploadGrid = document.getElementById('imageUploadGrid');
        const classImageInput = document.getElementById('classImage');
        const btnUploadImage = document.getElementById('btnUploadImage');

        btnUploadImage?.addEventListener('click', () => classImageInput.click());

        classImageInput?.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);

            files.forEach(file => {
                if (uploadedImages.length >= 6) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    uploadedImages.push(event.target.result);
                    renderImageGrid();
                };
                reader.readAsDataURL(file);
            });
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
                    title: document.getElementById('classTitle').value,
                    category: document.getElementById('classCategory').value,
                    keywords: document.getElementById('classKeywords').value.split(',').map(k => k.trim()),
                    summary: document.getElementById('classSummary').value,
                    description: document.getElementById('classDescription').value,
                    price: parseInt(document.getElementById('classPrice').value) || 0,
                    class_type: form.querySelector('input[name="classType"]:checked')?.value || 'VOD',
                    image_url: uploadedImages[0], // 대표 이미지 (기존 호환성)
                    image_urls: uploadedImages, // 전체 이미지 슬라이더용
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

    // 상단 헤더 프로필 렌더링
    async function renderUserMenu(supabase, session) {
        const userMenu = document.getElementById('userMenu');
        if (!userMenu) return;
        const userId = session.user.id;

        let profileImgUrl = '';
        let userName = '사용자';
        try {
            const { data } = await supabase.from('users').select('name, profile_image_url').eq('id', userId).maybeSingle();
            if (data) {
                profileImgUrl = data.profile_image_url || '';
                userName = data.name || '사용자';
            }
        } catch (e) {
            console.warn("프로필 로드 무시");
        }

        userMenu.innerHTML = `
            <a href="../mi_pesg/mypage.html" class="user-profile-btn">
                <div class="user-avatar" style="${profileImgUrl ? `background-image: url(${profileImgUrl})` : ''}">${!profileImgUrl ? '👤' : ''}</div>
                <span class="user-name">${userName} 님</span>
            </a>
            <button type="button" id="btnLogout" style="color:var(--text-secondary); font-size: 0.8rem; margin-left: 5px;">로그아웃</button>
        `;
        document.getElementById('btnLogout')?.addEventListener('click', async () => {
            await supabase.auth.signOut();
            window.location.reload();
        });
    }
});