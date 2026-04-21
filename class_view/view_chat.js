// view_chat.js - Class Channel with Lock/Unlock + D1 API 기반 정보 패널
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initChat = function (db, classId, userId, supabase, hasAccess, isInstructor) {
    devLog('log', '[class_view] chat module init:', { hasAccess, isInstructor });

    if (window.__BSQ_DEV_MODE__) hasAccess = true;
    // Treat instructors/admins as access-holders even if the caller only checked enrollment.
    hasAccess = !!hasAccess || !!isInstructor;

    const lockedOverlay = document.getElementById('chatLockedOverlay');
    const unlockedArea = document.getElementById('chatUnlocked');

    if (hasAccess && (userId || window.__BSQ_DEV_MODE__)) {
        if (lockedOverlay) lockedOverlay.style.display = 'none';
        if (unlockedArea) unlockedArea.style.display = 'flex';

        const SyncBridge = window.CommunityModules.SyncBridge;
        const ChatUI = window.CommunityModules.ChatUI;
        const currentUserId = window.__BSQ_DEV_MODE__ ? 'OPERATOR_GHOST' : userId;

        SyncBridge.init(null, null, currentUserId);
        ChatUI.init();

        const classTitle = document.getElementById('sidebarTitle')?.textContent || '클래스';
        ChatUI.openRoom(classId, 'class', {
            class_name: classTitle,
            is_instructor: isInstructor,
            class_id: classId
        });

        // 전송 이벤트 바인딩
        const btnSend = document.getElementById('btnSend');
        const msgInput = document.getElementById('msgInput');
        if (btnSend) btnSend.onclick = () => ChatUI.sendCurrentMessage();
        if (msgInput) {
            msgInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ChatUI.sendCurrentMessage(); }
            });
        }

        // 검색 바
        const btnSearch = document.getElementById('btnChatSearch');
        const searchBar = document.getElementById('chatSearchBar');
        if (btnSearch && searchBar) {
            btnSearch.onclick = () => {
                const vis = searchBar.style.display === 'flex';
                searchBar.style.display = vis ? 'none' : 'flex';
                if (!vis) document.getElementById('msgSearchInput')?.focus();
            };
            document.getElementById('msgSearchClose').onclick = () => { searchBar.style.display = 'none'; };
        }

        // 참여자 수 뱃지 (D1 API)
        updateParticipantBadgeD1(classId);

        // 정보 패널 렌더링 설정
        setupInfoPanel(classId, isInstructor);

    } else {
        if (lockedOverlay) lockedOverlay.style.display = 'flex';
        if (unlockedArea) unlockedArea.style.display = 'none';
    }
};

let infoPanelLoadToken = 0;

function devLog(level, ...args) {
    if (typeof window.__BSQ_DEV_LOG__ === 'function') {
        window.__BSQ_DEV_LOG__(level, ...args);
        return;
    }

    const fn = typeof console?.[level] === 'function' ? console[level].bind(console) : console.log.bind(console);
    fn(...args);
}

// =======================================
// 정보 패널 렌더링 (D1 API + 강사/수강생 뷰)
// =======================================
function setupInfoPanel(classId, isInstructor) {
    const btnInfo = document.getElementById('btnChatInfo');
    const panel = document.getElementById('commInfoPanel');
    const btnClose = document.getElementById('btnClosePanel');

    if (btnInfo) {
        btnInfo.onclick = (e) => {
            e.stopPropagation();
            if (panel) {
                const isVisible = panel.classList.toggle('visible');
                if (isVisible) renderClassInfoPanel(classId, isInstructor);
            }
        };
    }
    if (btnClose) {
        btnClose.onclick = () => panel?.classList.remove('visible');
    }

    panel?.querySelector('#infoPanelBody')?.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action="retry-info-panel-load"]');
        if (!button) return;
        void renderClassInfoPanel(classId, isInstructor);
    });
}

async function renderClassInfoPanel(classId, isInstructor) {
    const panelBody = document.getElementById('infoPanelBody');
    if (!panelBody) return;

    const requestToken = ++infoPanelLoadToken;
    panelBody.innerHTML = `
        <div class="section-skeleton-list" aria-hidden="true">
            <div class="section-skeleton-item" style="min-height: 118px;">
                <div class="section-skeleton-row">
                    <span class="section-skeleton-chip" style="width:92px;"></span>
                    <span class="section-skeleton-line" style="width:58%; height:18px;"></span>
                    <span class="section-skeleton-line" style="width:82%;"></span>
                </div>
            </div>
            <div class="section-skeleton-item" style="min-height: 86px;">
                <div class="section-skeleton-row">
                    <span class="section-skeleton-line" style="width:46%; height:16px;"></span>
                    <span class="section-skeleton-line" style="width:74%;"></span>
                </div>
            </div>
        </div>
    `;

    const view = (isInstructor || window.__BSQ_DEV_MODE__) ? 'instructor' : 'student';

    try {
        // 1. 멤버 목록 + 통계
        const memberRes = await window.BSQ.api(`/api/classes/members?class_id=${classId}&view=${view}`);
        if (requestToken !== infoPanelLoadToken) return;
        
        // 2. 모임 정보
        let gatheringsHtml = '';
        try {
            const gatherRes = await window.BSQ.api(`/api/gatherings?class_id=${classId}`);
            if (gatherRes?.success && gatherRes.data?.length > 0) {
                gatheringsHtml = renderGatheringsSection(gatherRes.data);
            }
        } catch (e) { /* 모임 API 없으면 스킵 */ }

        if (!memberRes?.success) {
            const memberMessage = String(memberRes?.error || '네트워크 상태를 확인한 뒤 다시 시도해 주세요.').trim();
            const memberDetail = String(memberRes?.detail || '').trim();
            panelBody.innerHTML = `
                <div class="section-state-card" data-tone="soft">
                    <div class="section-state-copy">
                        <p class="section-state-eyebrow">채팅 정보</p>
                        <strong class="section-state-title">멤버 정보를 불러올 수 없습니다.</strong>
                        <p class="section-state-text">${memberMessage}</p>
                        ${memberDetail ? `<p class="class-view-status-detail" style="margin-top:0.15rem;">${memberDetail}</p>` : ''}
                    </div>
                    <div class="section-state-actions">
                        <button type="button" class="section-state-btn primary" data-action="retry-info-panel-load">다시 불러오기</button>
                    </div>
                </div>
            `;
            return;
        }

        const { class_info, members, total_members, pass_stats } = memberRes.data;

        // 헤더 섹션
        const headerHtml = `
            <div class="info-panel-class-header" style="padding:16px 0; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:16px;">
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <div style="width:12px; height:12px; border-radius:50%; background:#4ade80; flex-shrink:0;"></div>
                    <div>
                        <strong style="font-size:1.05rem; color:#fff;">클래스 참여자 / 총 ${total_members}명 수강</strong>
                        <div style="font-size:0.8rem; color:#888; margin-top:2px;">${class_info.category || ''}</div>
                    </div>
                </div>
                <div style="text-align:right; font-size:0.85rem; color:#aaa;">현재 ${total_members}명 채팅중</div>
            </div>
        `;

        // 멤버 목록 섹션
        const membersHtml = members.map(m => {
            const isInstr = m.role === 'instructor';
            const onlineIndicator = `<div style="width:10px;height:10px;border-radius:50%;background:${isInstr ? '#4ade80' : '#60a5fa'};flex-shrink:0;"></div>`;
            
            let detailsHtml = '';
            if (view === 'instructor') {
                detailsHtml = `
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        ${m.name ? `<span style="font-size:0.8rem; color:#ccc; background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px;">사용자 이름<br>${m.name}</span>` : ''}
                        ${m.phone ? `<span style="font-size:0.8rem; color:#ccc; background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px;">전화번호<br>${m.phone}</span>` : ''}
                        <span style="font-size:0.8rem; color:#ccc; background:rgba(255,255,255,0.06); padding:2px 8px; border-radius:4px;">잔여<br>수강권 ${m.remaining_passes || 0}</span>
                    </div>
                `;
            }

            return `
                <div class="member-row" style="display:flex; align-items:center; gap:12px; padding:12px; background:rgba(255,255,255,0.03); border-radius:12px; margin-bottom:8px; border:1px solid rgba(255,255,255,0.05);">
                    ${onlineIndicator}
                    <div style="width:40px;height:40px;border-radius:50%;background:#333;flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                        ${m.profile_image_url ? `<img src="${m.profile_image_url}" style="width:100%;height:100%;object-fit:cover;">` : '<span style="font-size:1.2rem;">👤</span>'}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; color:#fff; font-size:0.95rem; margin-bottom:4px;">
                            ${m.nickname || '닉네임'} ${isInstr ? '<span style="background:linear-gradient(135deg,#ffd700,#ff8c00);color:#000;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:800;margin-left:4px;">강사</span>' : ''}
                        </div>
                        ${detailsHtml}
                    </div>
                    <button onclick="addFriend('${m.user_id}')" style="padding:6px 14px; border-radius:8px; background:linear-gradient(135deg,#6e8efb,#a777e3); color:white; border:none; font-size:0.8rem; font-weight:700; cursor:pointer; white-space:nowrap;">친구 추가</button>
                </div>
            `;
        }).join('');

        // 수강권 통계 (강사 뷰만)
        let passStatsHtml = '';
        if (view === 'instructor') {
            passStatsHtml = `
                <div style="padding:16px; background:rgba(255,255,255,0.03); border-radius:12px; margin-top:16px; border:1px solid rgba(255,255,255,0.05);">
                    <div style="font-weight:700; color:#fff; margin-bottom:12px;">📊 수강권 현황</div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <span style="color:#aaa;">발행된 수강권 수량</span>
                        <strong style="color:#4ade80;">${pass_stats.total_issued}개</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#aaa;">사용된 수강권 수량</span>
                        <strong style="color:#f97316;">${pass_stats.total_used}개</strong>
                    </div>
                </div>
            `;
        }

        panelBody.innerHTML = `
            ${headerHtml}
            <div style="display:flex; flex-direction:column;">${membersHtml}</div>
            ${gatheringsHtml}
            ${passStatsHtml}
        `;

        panelBody.querySelectorAll('[data-gathering-preview="1"]').forEach((item) => {
            const openGathering = () => {
                const shared = window.BSQCommunityShared || {};
                shared.openGatheringPreview?.({
                    title: item.dataset.title || '모집 카드',
                    gathering_at: item.dataset.time || '',
                    location: item.dataset.place || '',
                    current_count: Number(item.dataset.count || 0),
                    min_capacity: Number(item.dataset.min || 0),
                    max_capacity: Number(item.dataset.max || 0),
                    status: item.dataset.status || 'open',
                    description: item.dataset.desc || '',
                    created_by: classId ? '클래스 정보' : '',
                }, {
                    onMap: async (data) => {
                        const place = String(data?.location || '').trim();
                        if (!place) return;
                        window.open(`https://map.naver.com/v5/search/${encodeURIComponent(place)}`, '_blank', 'noopener');
                    },
                });
            };

            item.addEventListener('click', (event) => {
                if (event.target.closest('button, a')) return;
                openGathering();
            });
            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openGathering();
                }
            });
        });

    } catch (err) {
        if (requestToken !== infoPanelLoadToken) return;
        devLog('warn', '[class_view] chat info panel load error:', err);
        const errorMessage = String(err?.message || '잠시 후 다시 시도해 주세요.').trim();
        panelBody.innerHTML = `
            <div class="section-state-card" data-tone="soft">
                <div class="section-state-copy">
                    <p class="section-state-eyebrow">채팅 정보</p>
                    <strong class="section-state-title">정보 패널을 불러오지 못했습니다.</strong>
                    <p class="section-state-text">${errorMessage}</p>
                </div>
                <div class="section-state-actions">
                    <button type="button" class="section-state-btn primary" data-action="retry-info-panel-load">다시 불러오기</button>
                </div>
            </div>
        `;
    }
}

function renderGatheringsSection(gatherings) {
    return `
        <div style="margin-top:20px; padding:16px; background:rgba(255,255,255,0.03); border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
            ${gatherings.map(g => {
                const dateStr = g.gathering_at ? new Date(g.gathering_at).toLocaleString('ko-KR') : '미정';
                return `
                    <div class="class-gathering-preview-item"
                        data-gathering-preview="1"
                        data-title="${escapeAttr(g.title || g.gather_title || '모집 카드')}"
                        data-time="${escapeAttr(g.gathering_at || g.gather_time || '')}"
                        data-place="${escapeAttr(g.location || g.gather_place || '')}"
                        data-count="${escapeAttr(String(g.current_count || 0))}"
                        data-min="${escapeAttr(String(g.min_capacity || g.capacity_min || 0))}"
                        data-max="${escapeAttr(String(g.max_capacity || g.capacity_max || 0))}"
                        data-status="${escapeAttr(String(g.status || 'open'))}"
                        data-desc="${escapeAttr(g.description || '')}"
                        style="margin-bottom:12px; cursor:pointer;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                            <div style="width:8px;height:8px;border-radius:50%;background:#aaa;"></div>
                            <span style="color:#fff; font-size:0.9rem;">모임일시 : ${dateStr}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                            <div style="width:8px;height:8px;border-radius:50%;background:#aaa;"></div>
                            <span style="color:#fff; font-size:0.9rem;">모임장소 : ${g.location || '미정'}</span>
                        </div>
                        <button onclick="window.open('https://map.naver.com/v5/search/${encodeURIComponent(g.location || '')}')" 
                            style="width:100%; padding:12px; border-radius:10px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; font-weight:700; cursor:pointer; font-size:0.95rem;">
                            지도 바로가기
                        </button>
                        ${g.current_count !== undefined ? `
                            <div style="margin-top:10px; font-size:0.85rem; color:#aaa;">
                                참여 : ${g.current_count || 0} / ${g.max_capacity || '∞'}명
                                ${g.min_capacity ? `<span style="float:right;">최소 ${g.min_capacity}명 필요</span>` : ''}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('<div style="border-top:1px solid rgba(255,255,255,0.06);margin:12px 0;"></div>')}
        </div>
    `;
}

// 친구 추가 글로벌 함수
window.addFriend = async function(targetUserId) {
    const userId = window.CommunityModules?.SyncBridge?.getUserId();
    if (!userId || userId === targetUserId) return;

    try {
        const res = await window.BSQ.api('/api/contacts', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId, target_user_id: targetUserId })
        });
        alert(res?.success ? '친구가 추가되었습니다!' : '추가 실패: ' + (res?.error || ''));
    } catch (e) {
        alert('친구 추가 중 오류 발생');
    }
};

// 참여자 수 뱃지 (D1 API)
async function updateParticipantBadgeD1(classId) {
    try {
        const res = await window.BSQ.api(`/api/classes/members?class_id=${classId}&view=student`);
        if (res?.success) {
            const count = res.data.total_members || 0;
            const countEl = document.getElementById('chatMemberCount');
            if (countEl) countEl.textContent = `${count}명 참여 중`;

            const chatTabBtn = document.querySelector('[data-target="tabChat"]');
            if (chatTabBtn && count > 0) {
                let badge = chatTabBtn.querySelector('.tab-participant-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'tab-participant-badge';
                    chatTabBtn.appendChild(badge);
                }
                badge.textContent = count;
            }
        }
    } catch (e) { devLog('warn', '[class_view] badge update error:', e); }
}

// 핀 메시지 (D1에서는 비활성)
function setupPinnedMessagesChatUI(db, classId, isInstructor) {
    const pinnedBar = document.getElementById('pinnedMsgBar');
    if (pinnedBar) pinnedBar.style.display = 'none';
}
