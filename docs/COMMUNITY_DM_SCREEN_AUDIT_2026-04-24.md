# Community DM 화면 운영 분석

작성일: 2026-04-24  
대상 URL: `https://b-square-web.pages.dev/community/community?room=dm_user_387d5f2af130_user_b7a935e26112&type=dm`

## 분석 범위

이번 점검은 아래 3가지를 함께 기준으로 봤다.

1. 라이브 페이지 실제 렌더 확인
2. 로그인 상태 데스크톱/모바일 캡처 확인
3. 관련 프런트엔드/스타일/API 코드 확인

참고 캡처 파일:

- `qa-shots/community-dm.png`: 비로그인 상태 데스크톱
- `qa-shots/community-dm-mobile.png`: 비로그인 상태 모바일
- `qa-shots/community-dm-auth-debug.png`: 로그인 상태 데스크톱
- `qa-shots/mobile-auth.png`: 로그인 상태 모바일

핵심 확인 파일:

- `community/community.html`
- `community/community_v2.js`
- `community/chat_ui.js`
- `community/chat_list_v2.js`
- `community/community_refined.css`
- `community/community_mobile_app.css`
- `community/sync_bridge.js`
- `functions/api/dm/[[path]].js`
- `functions/api/chat.js`
- `functions/api/user-chats.js`
- `login/auth_1.js`
- `header.js`
- `kakao_quick.js`

## 1. 문제가 있는 기능

### 1. DM 첫 진입 시 최신 메시지가 아니라 오래된 메시지부터 보일 가능성

`functions/api/dm/[[path]].js:300-328`은 `since`가 없을 때 최신 묶음을 따로 뽑지 않고 기본 정렬로 `LIMIT`만 건다. 반면 클래스 채팅은 `functions/api/chat.js:399-414`에서 최신 묶음을 따로 가져온다.  
`community/chat_ui.js:1046-1048`은 이 응답을 초기 스냅샷으로 사용한다.

영향:

- 메시지가 많은 DM 방에서 입장 직후 최신 대화가 아니라 과거 메시지부터 보일 수 있다.
- 이후 SSE/폴링으로 뒤늦게 따라붙는 구조라 체감 품질이 나쁘다.

수정 방향:

- DM도 클래스 채팅과 같은 방식으로 “최신 N개” 기준 초기 조회로 통일하는 것이 안전하다.

### 2. 읽음 처리 타이밍이 부정확해서 실제로 보고 있는 방에도 unread가 다시 쌓일 수 있음

`community/chat_list_v2.js:607-616`은 방을 클릭하는 순간 바로 unread를 0으로 만들고 `markAsRead`를 호출한다.  
하지만 실제 수신 처리인 `community/chat_ui.js:1064-1080`과 하단 복귀 UX인 `community/chat_ui.js:906-934`에는 읽음 동기화가 없다.  
서버는 새 메시지 전송 때 상대 unread를 증가시키는 구조다.

영향:

- 사용자가 이미 열어둔 방을 보고 있는데도 unread 배지가 다시 생길 수 있다.
- “읽음” 신뢰도가 낮아진다.

수정 방향:

- 현재 방이 활성 상태이고 사용자가 하단 근처에 있으면 수신 직후 `markAsRead`를 재호출해야 한다.
- 스크롤 하단 복귀 시점에도 읽음 동기화를 넣는 편이 좋다.

### 3. 모바일에서 방을 열면 정보 패널이 자동으로 열려 채팅 본문을 덮음

`community/chat_ui.js:1051`은 방을 열 때마다 `renderInfoPanel(..., { open: true })`를 호출한다.  
`community/chat_ui.js:2310-2312`는 `options.open`이 true면 패널을 강제로 연다.  
모바일 CSS는 `community/community_mobile_app.css:1380-1390`에서 정보 패널을 사실상 전체 화면 패널로 만들고 있다.

실측 결과:

- 모바일 인증 렌더에서 `.community-shell`은 `mobile-chat-open info-panel-open`
- `#commInfoPanel`은 `visible`
- 패널 폭이 `390px`로 본문 전체를 덮고 있었다

영향:

- 모바일 딥링크 진입 시 사용자가 채팅 타임라인보다 “상대 프로필/고정 메시지/푸터”를 먼저 보게 된다.
- 채팅 화면 진입 감각이 깨진다.

수정 방향:

- 기본값은 “본문 열림, 정보 패널 닫힘”으로 바꿔야 한다.
- 정보 패널은 사용자가 `i` 버튼을 눌렀을 때만 열리도록 분리하는 것이 맞다.

### 4. 비로그인 상태 DM 딥링크가 로그인 후 원래 방으로 복귀되지 않음

`community/community_v2.js:308-327`의 로그인 프롬프트 버튼은 단순히 `../login/login.html`로 이동한다.  
`login/auth_1.js:101-111`은 로그인 성공 후 항상 `../index.html`로 이동한다.

영향:

- `room`과 `type`이 붙은 DM 딥링크가 로그인 과정에서 사라진다.
- 운영 환경에서 링크 공유, 알림 클릭, 문의 응답 흐름이 자주 끊긴다.

수정 방향:

- `return_to`에 현재 URL 전체를 담아 로그인으로 넘기고, 로그인 성공 후 해당 URL로 복귀시키는 흐름이 필요하다.

### 5. 기존 DM 방의 상대 식별 정보가 충분히 복원되지 않음

`functions/api/user-chats.js:47-80`의 목록 응답에는 `target_id`, `target_email` 같은 DM 상대 식별 필드가 없다.  
하지만 `community/chat_list_v2.js:204-210`은 이를 기대하고 있고, `community/chat_ui.js:2118-2198`의 프로필 패널/친구추가/차단 버튼도 `targetId`에 의존한다.

영향:

- 기존 DM에서 프로필 패널의 관계 상태가 부정확할 수 있다.
- 친구 추가/차단 버튼이 조용히 동작하지 않을 수 있다.

수정 방향:

- `/api/user-chats` 응답에 DM 상대 식별 메타데이터를 포함시키는 것이 우선이다.

### 6. 메시지 로딩 실패가 “빈 채팅창”처럼 보임

`community/chat_ui.js:1002-1003`은 방을 열자마자 메시지 컨테이너를 비운다.  
그 뒤 `community/chat_ui.js:1150-1154`의 실패 처리는 콘솔 경고만 남긴다.

영향:

- 일시적 API 오류가 “대화가 없음”처럼 보인다.
- 운영 중 장애 인지가 늦어진다.

수정 방향:

- 메시지 영역에 `로드 실패`, `다시 시도`, `권한 없음` 상태를 별도 표시해야 한다.

### 7. 채팅방 목록 조회 실패 시 방이 전부 사라진 것처럼 보임

`community/chat_list_v2.js:294-297`은 목록 조회 실패 시 `roomsCache`를 비우고 빈 상태를 렌더링한다.

영향:

- 순간적인 네트워크 흔들림만으로 “대화방이 전부 삭제된 것처럼” 보일 수 있다.

수정 방향:

- 마지막 성공 스냅샷을 유지하고, 상단에 `목록을 불러오지 못했습니다` 배너를 띄우는 방식이 더 안전하다.

### 8. 메시지의 `✓` 표시가 실제 메시지 단위 읽음 상태와 연결되어 있지 않음

`community/chat_ui.js:1259-1263`은 내가 보낸 메시지에 체크 표시를 렌더링하지만, 메시지별 read receipt를 저장하거나 조회하는 구조는 확인되지 않았다.

영향:

- 사용자는 이를 실제 읽음 표시로 오해할 수 있다.

수정 방향:

- 실제 기능이 아니라면 아이콘 제거가 낫고, 기능으로 유지할 거면 서버 스키마와 이벤트를 붙여야 한다.

### 9. 데스크톱 진입 시 전역 도우미 모달이 채팅 화면 위를 가림

`header.js:1678-1688`은 데스크톱에서 `kakao_quick.js`를 자동 로드한다.  
`kakao_quick.js:869-879`는 페이지 진입 1.2초 뒤 환영 모달을 띄운다.

영향:

- 사용자가 DM 화면에 들어오자마자 입력/스크롤보다 모달과 보조 기능에 먼저 막힌다.
- 채팅처럼 즉시 상호작용이 중요한 화면에서는 마찰이 크다.

수정 방향:

- 커뮤니티/DM 화면에서는 helper modal 자동 오픈을 막거나, 최소한 첫 진입 시 비활성화하는 것이 좋다.

## 2. 레이아웃 및 CSS 관련 문제

### 1. 채팅 화면이 전용 워크스페이스가 아니라 전체 페이지 스크롤 안에 남아 있음

`header.js:1242`가 전역 footer를 항상 붙인다.  
`community/community_refined.css:65-68`은 `body`를 세로 스크롤 가능하게 두고, 셸만 `community/community_refined.css:3865-3867`에서 뷰포트 높이처럼 다룬다.

실측 결과:

- 데스크톱 body 높이 `1877px`, viewport 높이 `1100px`
- 모바일 body 높이 `1638px`, viewport 높이 `844px`
- 실제 캡처에서도 채팅 아래에 고객센터/footer가 이어진다

영향:

- “메신저 워크스페이스”가 아니라 일반 랜딩 페이지 위에 채팅 박스를 얹은 느낌이 난다.
- 하단 입력창이 있어도 채팅이 한 화면에 고정되지 않는다.

### 2. 모바일 CSS가 같은 요소를 상반되게 여러 번 덮어씀

`community/community_mobile_app.css:21-35`는 `.community-shell`을 `height:auto`, `overflow:visible`로 잡는다.  
하지만 같은 파일 `community/community_mobile_app.css:920-932`는 다시 `height:calc(100dvh - 4px)`, `overflow:hidden`으로 덮어쓴다.  
`comm-info-panel`도 `community/community_mobile_app.css:81-94`와 `community/community_mobile_app.css:1380-1390`이 서로 다른 모델을 갖고 있다.  
여기에 `community/community_refined.css:145`, `3134`, `3865` 부근의 높이 규칙이 다시 겹친다.

영향:

- 작은 수정도 다른 브레이크포인트에서 회귀를 만들 가능성이 높다.
- 현재 모바일 깨짐은 단일 버그보다 “중복 규칙 충돌”에 가깝다.

### 3. 769~1024px 구간에서 반응형 기준이 갈라짐

`community/chat_ui.js:769-787`과 `community/community_refined.css:1886`은 `<=1024px`를 모바일처럼 취급한다.  
하지만 모바일 전용 UI 주입은 `community/community_v2.js:1084-1155`에서 `<=768px`일 때만 일어난다.

영향:

- 태블릿 폭에서 사이드바는 접히는데, 모바일용 보조 UI는 없는 반쯤 깨진 상태가 나올 수 있다.

### 4. 입력창, 답장 프리뷰, 최신 메시지 버튼이 겹칠 위험이 큼

입력창 자동 높이 증가는 `community/chat_ui.js:1904-1909`에 있다.  
답장 프리뷰는 `community/community_refined.css:1073`과 `community/community_mobile_app.css:1370-1373`에 별도 블록으로 붙는다.  
최신 메시지 버튼은 `community/community_refined.css:1018-1024`와 `community/community_mobile_app.css:1375-1378`처럼 고정 bottom 값만 쓴다.

영향:

- 입력창이 커지거나 답장 상태가 켜지면 마지막 메시지와 하단 액션이 서로 밀릴 수 있다.

### 5. 긴 방 이름/DM 이름/헤더 이름에 대한 잘림 처리가 부족함

`community/chat_list_v2.js:421-429`는 제목 옆에 배지, 핀, 음소거, 폴더 태그를 계속 붙인다.  
`community/community_refined.css:402-429` 구간에는 `.room-name` 전용 ellipsis 규칙이 충분하지 않다.  
상단 헤더 이름도 `community/community_refined.css:562` 부근에서 잘림 대비가 약하다.

영향:

- 긴 실명 DM, 긴 클래스명, 폴더 태그가 겹치면 시간/액션 버튼이 눌릴 수 있다.

### 6. 라이트 테마의 작은 보조 텍스트 대비가 아슬아슬함

`community/community_refined.css:33`의 `--comm-text-2`는 60% alpha 기반이다.  
보조 정보와 칩류는 `0.7rem` 안팎까지 작아진다.

영향:

- 운영 기준 접근성 측면에서 오래 쓰는 화면으로는 피로도가 있다.
- 모바일에서 특히 가독성이 떨어진다.

### 7. 전역 helper/modal과 커뮤니티 레이아웃이 충돌함

데스크톱에서는 helper modal이 채팅 위에 바로 뜨고, footer도 계속 살아 있다.  
즉, 이 화면은 “전용 채팅 레이아웃”보다 “전역 사이트 요소가 계속 개입하는 상세 페이지”에 가깝다.

영향:

- 집중형 채팅 UX가 깨지고, 운영/문의 응답용 화면으로 쓰기 불편하다.

## 3. 추가하면 좋을 기능

### 1. 딥링크 복귀형 로그인

지금 가장 먼저 넣을 가치가 있다.  
알림, 문의 링크, 상대 프로필 링크에서 들어와도 로그인 후 같은 DM/패널 상태로 복귀해야 한다.

### 2. 진짜 읽음 처리와 상태 표시

현재는 unread와 `✓`가 분리돼 있다.  
방 단위 read sync, 메시지 단위 read receipt, 현재 접속/마지막 활동 시각 중 최소 하나는 필요하다.

### 3. 네트워크 상태 배너와 재시도 UX

채팅 목록 실패, 메시지 실패, SSE 폴백 상태를 사용자가 볼 수 있어야 한다.  
`연결 불안정`, `재시도`, `마지막 동기화 시각` 정도만 있어도 운영성이 크게 올라간다.

### 4. 첨부 업로드 진행률 및 실패 복구

현재 첨부는 프런트에서 base64로 읽어 올리는 구조(`community/chat_ui.js:1857-1895`)라 대용량/불안정 네트워크에서 UX가 약하다.  
진행률, 재전송, 이미지 압축 또는 직접 업로드 방식이 필요하다.

### 5. 서버 동기화된 핀/뮤트/폴더 설정

현재 핀/뮤트/폴더는 `community/chat_list_v2.js:22-35` 기준 localStorage에만 저장된다.

운영 관점에서 기대되는 기능:

- 기기 바뀌어도 유지
- 브라우저 캐시 초기화 후에도 유지
- 운영자가 여러 기기로 DM을 볼 때 일관성 유지

### 6. 삭제 대신 아카이브/숨기기 + 실행 취소

현재 컨텍스트 메뉴에는 `대화 삭제`가 바로 있다.  
실운영 메시지 화면에서는 “보관”, “목록에서 숨기기”, “최근 5초 실행 취소”가 더 안전하다.

## 4. 추천 수정 우선순위

### 1순위

- DM 초기 로딩을 최신 메시지 기준으로 변경
- 모바일에서 정보 패널 자동 오픈 제거
- 채팅 화면과 footer/page scroll 분리
- 로그인 후 원래 DM 딥링크 복귀 처리

### 2순위

- unread/read sync 재설계
- DM 상대 식별 메타데이터 보강
- 메시지/목록 실패 상태 UI 추가
- helper modal이 커뮤니티 화면을 가리지 않도록 예외 처리

### 3순위

- 모바일 CSS/브레이크포인트 정리
- 긴 제목 truncation 정비
- 라이트 테마 대비 보강
- 핀/뮤트/폴더 서버 동기화

## 5. 한 줄 결론

현재 DM 화면은 “기능이 조금 부족한 수준”이 아니라, 운영용 메신저로 보기에는 `초기 진입 흐름`, `읽음 신뢰도`, `모바일 레이아웃`, `전역 사이트 요소 간섭` 네 축에서 먼저 정리해야 할 부분이 분명하다.  
특히 `모바일 자동 정보패널`, `DM 초기 로딩 방향`, `딥링크 로그인 복귀`, `footer/page-scroll 분리`는 다음 세션에서 바로 고쳐도 되는 우선순위다.
