// kakao_quick.js - 카카오 채널 플로팅 퀵 메뉴 (전 페이지 공통)
(function () {
    'use strict';

    const KAKAO_CHANNEL_ID = '_ScJxon';
    const KAKAO_CHAT_URL = 'http://pf.kakao.com/_ScJxon/chat';

    // 카카오 SDK 초기화 (JS 앱 키가 있으면 여기에 설정)
    function initKakaoSDK() {
        // 카카오 JS 앱 키가 없으면 URL 직접 이동 방식 사용
    }

    // ---- 플로팅 버튼 + 툴팁 생성 ----
    function createFloatingButton() {
        if (document.getElementById('kakaoQuickBtn')) return;

        const style = document.createElement('style');
        style.textContent = `
            /* 카카오 플로팅 버튼 */
            #kakaoQuickBtn {
                position: fixed;
                bottom: 80px;
                right: 20px;
                z-index: 99990;
                width: 58px;
                height: 58px;
                border-radius: 50%;
                background: #FEE500;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.25);
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                font-size: 0;
                overflow: hidden;
            }
            #kakaoQuickBtn:hover {
                transform: scale(1.12);
                box-shadow: 0 8px 28px rgba(254, 229, 0, 0.5);
            }
            #kakaoQuickBtn:active {
                transform: scale(0.95);
            }
            #kakaoQuickBtn svg {
                width: 30px;
                height: 30px;
            }

            /* 툴팁 — 버튼 바로 위에 */
            #kakaoQuickTooltip {
                position: fixed;
                bottom: 144px;
                right: 12px;
                z-index: 99991;
                background: rgba(30, 30, 40, 0.92);
                backdrop-filter: blur(8px);
                color: #FEE500;
                padding: 10px 18px;
                border-radius: 12px;
                font-size: 0.82rem;
                font-weight: 700;
                white-space: nowrap;
                pointer-events: none;
                font-family: 'Pretendard', 'Inter', sans-serif;
                box-shadow: 0 4px 16px rgba(0,0,0,0.3);
                /* 초기: 숨김 + 아래쪽에서 올라오는 효과 */
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            #kakaoQuickTooltip::after {
                content: '';
                position: absolute;
                bottom: -6px;
                right: 24px;
                width: 12px;
                height: 12px;
                background: rgba(30, 30, 40, 0.92);
                transform: rotate(45deg);
                border-radius: 2px;
            }
            #kakaoQuickBtn:hover ~ #kakaoQuickTooltip,
            #kakaoQuickTooltip.show {
                opacity: 1;
                transform: translateY(0);
            }

            /* 모바일 */
            @media (max-width: 768px) {
                #kakaoQuickBtn {
                    bottom: 100px;
                    right: 16px;
                    width: 52px;
                    height: 52px;
                }
                #kakaoQuickTooltip {
                    bottom: 158px;
                    right: 8px;
                    font-size: 0.78rem;
                    padding: 8px 14px;
                }
            }
        `;
        document.head.appendChild(style);

        // 카카오톡 아이콘 SVG
        const btn = document.createElement('button');
        btn.id = 'kakaoQuickBtn';
        btn.title = '카카오톡 상담';
        btn.innerHTML = `<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
            <rect width="256" height="256" rx="128" fill="#FEE500"/>
            <path d="M128 60C88.24 60 56 85.13 56 116.14c0 19.42 12.7 36.6 32.06 46.52l-6.3 22.76c-.88 3.19 2.82 5.75 5.57 3.86l27.17-18.72c4.36.62 8.84.94 13.5.94 39.76 0 72-25.13 72-56.14S167.76 60 128 60z" fill="#3C1E1E"/>
        </svg>`;
        btn.addEventListener('click', openKakaoChat);
        document.body.appendChild(btn);

        // 툴팁
        const tooltip = document.createElement('div');
        tooltip.id = 'kakaoQuickTooltip';
        tooltip.textContent = '💬 카카오톡 상담';
        document.body.appendChild(tooltip);

        // 3초 후 툴팁 자동 표시 → 2초 뒤 사라짐 (첫 방문 안내)
        setTimeout(() => {
            tooltip.classList.add('show');
            setTimeout(() => tooltip.classList.remove('show'), 2500);
        }, 2000);
    }

    // ---- 카카오 채팅 바로 열기 ----
    function openKakaoChat() {
        // SDK 초기화되어 있으면 SDK로, 아니면 URL 직접 이동
        if (window.Kakao && Kakao.isInitialized() && Kakao.Channel) {
            try {
                Kakao.Channel.chat({ channelPublicId: KAKAO_CHANNEL_ID });
                return;
            } catch (e) {
                console.warn('[Kakao] SDK 채팅 실패, URL 이동:', e);
            }
        }
        // 바로 채팅 URL로 이동
        window.open(KAKAO_CHAT_URL, '_blank');
    }

    // ---- 초기화 ----
    function init() {
        initKakaoSDK();
        createFloatingButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
