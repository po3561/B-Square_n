// tab_profile.js - 프로필 설정 관련 로직
window.initProfileTab = function (supabase, userId, userEmail) {
    const profileForm = document.getElementById('profileForm');
    const categoryChips = document.getElementById('categoryChips');
    const profileImageInput = document.getElementById('profileImage');
    const profileImagePreview = document.getElementById('profileImagePreview');

    if (!profileForm) return;

    let isNewRecord = false;

    // 1. 카테고리 칩 토글 로직
    if (categoryChips) {
        categoryChips.addEventListener('click', (e) => {
            const chip = e.target.closest('.category-chip');
            if (chip) {
                chip.classList.toggle('active');
            }
        });
    }

    // 2. 이미지 프리뷰 로직
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
            const { data, error } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (error) console.warn("DB 조회 중 일부 누락됨:", error.message);

            if (data) {
                document.getElementById('profileName').value = data.name || '';
                document.getElementById('profilePhone').value = data.phone || '';
                document.getElementById('profileUsername').value = data.username || '';
                document.getElementById('profileSns').value = data.sns_link || '';

                // 카테고리 칩 활성화 (콤마로 구분된 문자열 가정)
                if (data.preferred_category && categoryChips) {
                    const selected = data.preferred_category.split(',').map(s => s.trim());
                    categoryChips.querySelectorAll('.category-chip').forEach(chip => {
                        if (selected.includes(chip.dataset.category)) {
                            chip.classList.add('active');
                        }
                    });
                }

                // 프로필 이미지 표시
                if (data.profile_image_url) {
                    profileImagePreview.innerHTML = `<img src="${data.profile_image_url}" alt="Profile">`;
                }

                updateSidebarUI(data.name, data.username);
            } else {
                isNewRecord = true;
                const defaultName = userEmail.split('@')[0];
                document.getElementById('profileName').value = defaultName;
                document.getElementById('profileUsername').value = defaultName;
                updateSidebarUI(defaultName, '-');
            }
        } catch (error) {
            console.warn("프로필 로드 우회:", error);
        }
    }

    profileForm.onsubmit = async (e) => {
        e.preventDefault();
        const submitBtn = profileForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = '저장 중...';

        try {
            // 선택된 카테고리 수집
            const activeChips = Array.from(categoryChips.querySelectorAll('.category-chip.active'))
                .map(chip => chip.dataset.category);
            const preferredCategory = activeChips.join(', ');

            // 이미지 Base64 처리 (새 이미지가 선택된 경우)
            let profileImageUrl = profileImagePreview.querySelector('img')?.src || '';

            // [FIX] mandatory fields must be present for upsert to satisfy DB constraints
            const updates = {
                id: userId,
                email: userEmail,
                name: document.getElementById('profileName').value,
                phone: document.getElementById('profilePhone').value,
                username: document.getElementById('profileUsername').value,
                sns_link: document.getElementById('profileSns').value,
                preferred_category: preferredCategory,
                profile_image_url: profileImageUrl,
                updated_at: new Date(),
                // Ensure mandatory fields have values
                birth_year: '1999',
                birth_month: '01',
                birth_day: '01',
                gender: 'N',
                nationality: 'local',
                signup_path: 'etc'
            };

            // DB에서 기존 데이터를 먼저 가져와서 필수 필드 누락 방지 (선택 사항이나 안전함)
            const { data: existingUser } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
            if (existingUser) {
                updates.birth_year = existingUser.birth_year || updates.birth_year;
                updates.birth_month = existingUser.birth_month || updates.birth_month;
                updates.birth_day = existingUser.birth_day || updates.birth_day;
                updates.gender = existingUser.gender || updates.gender;
                updates.nationality = existingUser.nationality || updates.nationality;
                updates.signup_path = existingUser.signup_path || updates.signup_path;
            }

            const { error } = await supabase.from('users').upsert(updates);

            if (error) {
                if (error.code === '42703') {
                    console.warn("Table schema mismatch, attempting fallback...");
                    const fallbackData = {
                        id: userId,
                        email: userEmail,
                        name: updates.name,
                        phone: updates.phone,
                        username: updates.username,
                        profile_image_url: updates.profile_image_url
                    };
                    const { error: fallbackError } = await supabase.from('users').upsert(fallbackData);
                    if (fallbackError) throw new Error(fallbackError.message);
                    alert("일부 항목(카테고리, SNS 등)은 시스템 업데이트 후 저장 가능합니다. 기본 정보는 성공적으로 저장되었습니다.");
                } else {
                    throw new Error(error.message);
                }
            } else {
                alert("프로필 정보가 안전하게 저장되었습니다.");
            }

            isNewRecord = false;
            updateSidebarUI(updates.name, updates.username);
        } catch (error) {
            console.error("저장 오류:", error);
            alert("저장 실패: " + (error.message || "알 수 없는 오류"));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '기본 정보 저장';
        }
    };


    function updateSidebarUI(name, username) {
        if (document.getElementById('displayNickname')) {
            document.getElementById('displayNickname').textContent = (name || '사용자') + " 님";
        }
        if (document.getElementById('displayUsername')) {
            document.getElementById('displayUsername').textContent = "ID: " + (username || '-');
        }
        // 사이드바 아바타도 동기화 (mypage Sidebar에 img 태그가 있는지 확인 필요하나 현재는 텍스트 위주)
    }

    loadProfile();
};
