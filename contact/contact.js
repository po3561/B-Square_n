// contact.js - B-Square 문의 페이지 (D1 API 기반)
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📞 Contact Page Initializing (D1 API)...');

    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    // ---- 카카오 채널 연결 ----
    const btnKakao = document.getElementById('btnKakaoChannel');
    btnKakao?.addEventListener('click', () => {
        if (window.Kakao && Kakao.isInitialized() && Kakao.Channel) {
            try {
                Kakao.Channel.chat({ channelPublicId: '_ScJxon' });
                return;
            } catch (e) { console.warn('Kakao SDK 오류:', e); }
        }
        window.open('http://pf.kakao.com/_ScJxon/chat', '_blank');
    });

    // ---- 문의 제출 (D1 API) ----
    const form = document.getElementById('inquiryForm');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('inqName').value.trim();
        const email = document.getElementById('inqEmail').value.trim();
        const category = document.getElementById('inqCategory').value;
        const title = document.getElementById('inqTitle').value.trim();
        const content = document.getElementById('inqContent').value.trim();

        if (!name || !email || !title || !content) return alert('필수 항목을 모두 입력해주세요.');

        const btn = document.getElementById('btnSubmitInquiry');
        btn.textContent = '접수 중...';
        btn.disabled = true;

        try {
            const payload = { name, email, category, title, content };
            if (window.__BSQ_DEV_MODE__) payload.submitted_by = 'OPERATOR_GHOST';

            const result = await window.BSQ.api('/api/inquiries', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            if (!result.success) throw new Error(result.error || '서버 오류');

            alert('✅ 문의가 성공적으로 접수되었습니다!\n빠른 시일 내 답변드리겠습니다.');
            form.reset();
        } catch (err) {
            console.error('문의 접수 실패:', err);
            alert('문의 접수에 실패했습니다: ' + err.message);
        } finally {
            btn.textContent = '문의 접수하기';
            btn.disabled = false;
        }
    });

    // ---- 운영자(개발자 모드): 문의 관리 UI ----
    function initAdminMode() {
        if (!window.__BSQ_DEV_MODE__) return;

        const adminSection = document.getElementById('adminInquiries');
        if (adminSection) adminSection.style.display = 'block';

        loadInquiries();
    }

    async function loadInquiries() {
        const list = document.getElementById('inquiryList');
        if (!list) return;

        const result = await window.BSQ.api('/api/inquiries');
        if (!result.success) return;

        const inquiries = result.data || [];
        if (inquiries.length === 0) {
            list.innerHTML = '<div class="empty-state">접수된 문의가 없습니다.</div>';
            return;
        }

        list.innerHTML = inquiries.map(inq => {
            const date = inq.created_at ? new Date(inq.created_at).toLocaleString('ko-KR') : '-';
            const badgeClass = inq.status === 'replied' ? 'replied' : 'pending';
            const badgeText = inq.status === 'replied' ? '답변완료' : '대기중';

            return `
                <div class="inquiry-item" data-id="${inq.id}">
                    <div class="inq-header">
                        <span class="inq-title"><span class="inq-badge ${badgeClass}">${badgeText}</span>${inq.title}</span>
                        <span class="inq-date">${date}</span>
                    </div>
                    <div class="inq-meta">${inq.name} · ${inq.email} · ${inq.category || '일반 문의'}</div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.inquiry-item').forEach(item => {
            item.addEventListener('click', () => {
                const inq = inquiries.find(i => i.id === item.dataset.id);
                if (inq) alert(`[${inq.category}] ${inq.title}\n\n보낸 사람: ${inq.name} (${inq.email})\n\n${inq.content}`);
            });
        });
    }

    if (window.__BSQ_DEV_MODE__) initAdminMode();
    window.addEventListener('bsq_dev_mode_activated', initAdminMode);
});
