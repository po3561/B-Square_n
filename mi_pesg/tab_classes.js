// tab_classes.js - 내 클래스 관리 및 수강 신청 관리 로직
window.initClassesTab = function (firebase, userId) {
    const db = firebase.database();
    const classList = document.getElementById('classList'); // 등록한 클래스
    const enrolledList = document.getElementById('enrolledClasses'); // 수강 중인 클래스

    // 1. 내가 등록한 클래스 로드 (기존)
    window.loadMyClasses = async function () {
        if (!classList) return;
        classList.innerHTML = '<div class="empty-state">클래스를 불러오는 중...</div>';

        try {
            const snapshot = await db.ref('classes')
                .orderByChild('creator_id')
                .equalTo(userId)
                .once('value');

            const data = snapshot.val();
            if (!data) {
                classList.innerHTML = '<div class="empty-state">아직 등록한 클래스가 없습니다.</div>';
                return;
            }

            let html = '';
            Object.keys(data).forEach(id => {
                const cls = data[id];
                html += `
                    <div class="my-class-card">
                        <div class="class-thumb ${!cls.image_url ? 'placeholder-orange' : ''}">
                            ${cls.image_url ? `<img src="${cls.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                        </div>
                        <div class="class-info">
                            <h4>${cls.title}</h4>
                            <p>${cls.category} | ${cls.class_type}</p>
                            <div style="display:flex; gap:10px;">
                                <button class="btn-chat-link" onclick="openEditTab('${id}')">⚙️ 클래스 관리하기</button>
                                <button class="btn-chat-link" style="background:rgba(255,255,255,0.05);" onclick="location.href='../class_view/class_view.html?id=${id}'">미리보기</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            classList.innerHTML = html;
        } catch (error) {
            console.error("클래스 로드 실패:", error);
            classList.innerHTML = '<div class="empty-state text-error">클래스 로드 중 오류가 발생했습니다.</div>';
        }
    };

    // 2. 내가 수강 신청한 클래스 로드 (신규)
    window.loadEnrolledClasses = async function () {
        if (!enrolledList) return;
        enrolledList.innerHTML = '<div class="empty-state">수강 정보를 불러오는 중...</div>';

        try {
            const snapshot = await db.ref(`enrollments/${userId}`).once('value');
            const data = snapshot.val();

            if (!data) {
                enrolledList.innerHTML = '<div class="empty-state">아직 수강 신청한 클래스가 없습니다.</div>';
                return;
            }

            let html = '';
            Object.keys(data).forEach(classId => {
                const enroll = data[classId];
                html += `
                    <div class="my-class-card">
                        <div class="class-thumb ${!enroll.image_url ? 'placeholder-orange' : ''}">
                            ${enroll.image_url ? `<img src="${enroll.image_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                        </div>
                        <div class="class-info">
                            <h4>${enroll.title}</h4>
                            <p>${enroll.category} | 진도율: ${enroll.progress || 0}%</p>
                            <div style="display:flex; gap:10px;">
                                <button class="btn-chat-link" onclick="location.href='../class_view/class_view.html?id=${classId}'">▶️ 학습 페이지로 이동</button>
                                <button class="btn-chat-link" style="background:rgba(255,255,255,0.05);" onclick="location.href='../community/community.html'">💬 채팅방 입장</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            enrolledList.innerHTML = html;
        } catch (error) {
            console.error("Enrollment load error:", error);
            enrolledList.innerHTML = '<div class="empty-state">수강 정보를 가져오는 중 오류가 발생했습니다.</div>';
        }
    };

    // 클래스 수정 팝업/탭 열기
    window.openEditTab = async function (classId) {
        try {
            const snapshot = await db.ref('classes/' + classId).once('value');
            const data = snapshot.val();
            if (!data) return;

            document.getElementById('editClassId').value = classId;
            document.getElementById('editClassTitle').value = data.title || '';
            document.getElementById('editClassCategory').value = data.category || '';
            document.getElementById('editClassSummary').value = data.summary || '';
            document.getElementById('editClassDescription').value = data.description || '';
            document.getElementById('editClassPrice').value = data.price || 0;
            document.getElementById('editClassDiscount').value = data.discount_rate || 0;
            document.getElementById('editClassCoupon').checked = !!data.coupon_pack;

            const typeRadios = document.getElementsByName('editClassType');
            typeRadios.forEach(radio => {
                if (radio.value === data.class_type) radio.checked = true;
            });

            // 탭 전환
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mypage-tab').forEach(t => t.classList.remove('active'));
            document.getElementById('tabEditClass').classList.add('active');
        } catch (error) {
            alert("클래스 정보를 가져오는데 실패했습니다.");
        }
    };

    // 수정 폼 제출
    const editForm = document.getElementById('editClassForm');
    if (editForm) {
        editForm.onsubmit = async (e) => {
            e.preventDefault();
            const classId = document.getElementById('editClassId').value;
            const updateData = {
                title: document.getElementById('editClassTitle').value,
                category: document.getElementById('editClassCategory').value,
                summary: document.getElementById('editClassSummary').value,
                description: document.getElementById('editClassDescription').value,
                price: parseInt(document.getElementById('editClassPrice').value) || 0,
                discount_rate: parseInt(document.getElementById('editClassDiscount').value) || 0,
                coupon_pack: document.getElementById('editClassCoupon').checked,
                class_type: document.querySelector('input[name="editClassType"]:checked').value,
                updated_at: Date.now()
            };

            try {
                await db.ref('classes/' + classId).update(updateData);
                alert("성공적으로 수정되었습니다.");
                loadMyClasses();
                document.querySelector('[data-target="tabClasses"]').click();
            } catch (error) {
                alert("수정 실패: " + error.message);
            }
        };
    }

    loadMyClasses();
    loadEnrolledClasses();
};
