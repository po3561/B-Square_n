// tab_classes.js - 내 클래스 관리 및 수강 신청 관리 로직
window.initClassesTab = function (db, userId) {
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

    // 2. 내가 수강 신청한 클래스 로드 & 수강권 로드 (신규 통합)
    window.loadEnrolledClasses = async function () {
        if (!enrolledList) return;
        enrolledList.innerHTML = '<div class="empty-state">수강 정보를 불러오는 중...</div>';

        try {
            const enrollSnap = await db.ref(`enrollments/${userId}`).once('value');
            const passSnap = await db.ref(`user_passes/${userId}`).once('value');
            
            const enrollData = enrollSnap.val() || {};
            const passData = passSnap.val() || {};
            
            const classIds = Array.from(new Set([...Object.keys(enrollData), ...Object.keys(passData)]));

            if (classIds.length === 0) {
                enrolledList.innerHTML = '<div class="empty-state">아직 참가중인 클래스나 보유한 수강권이 없습니다.</div>';
                return;
            }

            let totalPasses = 0;
            let totalEnrolled = classIds.length;
            let dashHtml = ''; 
            let html = ''; // Fixed: Initialized html variable

            for (let i = 0; i < classIds.length; i++) {
                const classId = classIds[i];
                let title = enrollData[classId]?.title || '알 수 없는 클래스';
                let category = enrollData[classId]?.category || '기타';
                let imageUrl = enrollData[classId]?.image_url || '';
                
                if (!enrollData[classId]) {
                    const clsSnap = await db.ref(`classes/${classId}`).once('value');
                    const cls = clsSnap.val();
                    if (cls) {
                        title = cls.title || title;
                        category = cls.category || category;
                        imageUrl = cls.image_url || imageUrl;
                    }
                }

                const myPass = passData[classId] || {};
                let passUi = '';
                if (myPass.count > 0) {
                    passUi = `<div style="display:inline-block; margin-top:6px; padding:4px 8px; background:rgba(76, 201, 240, 0.15); color:#4cc9f0; border-radius:6px; font-size:0.85rem; font-weight:600;">🎫 수강권 ${myPass.count}개 보유</div>`;
                    totalPasses += myPass.count;
                }
                if (myPass.monthly) {
                    passUi += `<div style="display:inline-block; margin-top:6px; padding:4px 8px; background:rgba(255, 152, 0, 0.15); color:#FF9800; border-radius:6px; font-size:0.85rem; font-weight:600;">🌟 월정액 구독 중</div>`;
                    totalPasses += 1;
                }

                const cardHtml = `
                    <div class="my-class-card">
                        <div class="class-thumb ${!imageUrl ? 'placeholder-orange' : ''}">
                            ${imageUrl ? `<img src="${imageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">` : ''}
                        </div>
                        <div class="class-info">
                            <h4 style="margin-bottom:4px;">${title}</h4>
                            <p style="font-size:0.9rem; color:#888; margin-bottom:8px;">${category} | 진도율: ${enrollData[classId]?.progress || 0}%</p>
                            <div style="margin-bottom:12px;">${passUi}</div>
                            <div style="display:flex; gap:10px;">
                                <button class="btn-chat-link" onclick="location.href='../class_view/class_view.html?id=${classId}'">▶️ 학습 페이지</button>
                                <button class="btn-chat-link" style="background:rgba(255,255,255,0.05);" onclick="location.href='../class_view/class_view.html?id=${classId}#tabChat'">💬 채널</button>
                            </div>
                        </div>
                    </div>
                `;

                html += cardHtml;

                if (i === 0) {
                    dashHtml = cardHtml;
                }
            }
            enrolledList.innerHTML = html;

            // Update Dashboard UI
            const dashPassCount = document.getElementById('dashPassCount');
            const dashClassCount = document.getElementById('dashClassCount');
            const dashRecentClass = document.getElementById('dashRecentClass');
            
            if (dashPassCount) dashPassCount.textContent = `${totalPasses}개`;
            if (dashClassCount) dashClassCount.textContent = `${totalEnrolled}개`;
            if (dashRecentClass) dashRecentClass.innerHTML = dashHtml || '<div class="empty-state">최근 수강 내역이 없습니다.</div>';

            // Also load chat count for dashboard
            try {
                const chatSnap = await db.ref(`user_chats/${userId}`).once('value');
                const chatCount = chatSnap.exists() ? Object.keys(chatSnap.val()).length : 0;
                const dashChatCount = document.getElementById('dashChatCount');
                if (dashChatCount) dashChatCount.textContent = `${chatCount}개`;
            } catch(e) { console.warn("Chat count error", e); }

        } catch (error) {
            console.error("Enrollment load error:", error);
            enrolledList.innerHTML = '<div class="empty-state text-error">수강 정보를 가져오는 중 오류가 발생했습니다.</div>';
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
