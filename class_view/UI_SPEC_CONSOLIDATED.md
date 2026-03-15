# B-Square Class View UI/UX 최종 통합 기획서 (Consolidated)

이 문서는 `class_view` 채팅 UI 고도화 작업의 모든 요구사항과 설계를 하나로 통합한 최종 명세서입니다.

---

## 1. 디자인 시스템 (Design System)

| 항목 | 다크 모드 (기본) | 화이트 모드 |
| :--- | :--- | :--- |
| **배경색 (BG)** | `#0a0a0c` (Sleek Black) | `#ffffff` (Pure White) |
| **카드 배경** | `#1c1c22` | `#f8f9fa` |
| **기본 텍스트** | `#ffffff` (White) | `#111111` (Deep Grey) |
| **보조 텍스트** | `rgba(255,255,255,0.6)` | `#666666` |
| **포인트 컬러** | `#6e8efb` (Cool Blue) | `#3182f6` (Soft Blue) |

- **폰트**: `Outfit` (헤드라인, Heavy), `Inter` (본문, Medium/SemiBold)
- **곡률 (Radius)**: 
  - 헤더/입력창 버튼: `12px` (라운드 스퀘어 스타일)
  - 카드 및 패널: `20px`
- **효과**: 
  - **Glassmorphism**: 헤더 및 정보 패널에 `blur(20px)` 적용
  - **Shadow**: 다크 모드에서는 Border Glow, 화이트 모드에서는 Soft Shadow 사용

---

## 2. 레이아웃 및 컴포넌트 상세

### [헤더 및 고정 바]

- **헤더 버튼**: 검색, 테마, 정보 아이콘 등을 투명도가 있는 라운드 스퀘어 박스로 구현.
- **고정 메시지 (Pinned Bar)**: 
  - 배경: 반투명 다크 그레이 (`rgba(0,0,0,0.8)`)
  - 아이콘: 좌측에 📌 아이콘 배치 후 세로 구분선(Vertical Separator) 추가.

### [정보 패널 (Information Panel)]
패널은 사용자 역할(`isInstructor`)에 따라 동적으로 구성됩니다.

#### A. 강사 뷰 (Instructor)

- **참여자 목록**: 아바타, 닉네임(Bold), 실명/연락처(Light Grey), 수강권 잔여 횟수 태그 노출.
- **수강권 통계**: 발행된 수강권 총량과 현재까지 사용된 수강권 수량을 요약 박스로 표시.
- **액션**: '모집 마감' 기능을 가진 전용 XL 버튼 배치.

#### B. 수강생 뷰 (Student)

- **참여자 목록**: 프라이버시를 위해 닉네임과 아바타만 노출.
- **모임 정보**: 날짜, 장소, 정원 대비 참여 인원 프로그레스 바 표시.
- **액션 (이원화 버튼)**:
  - **참여**: `클래스 참여 (수강권 1회 사용)` - 포인트 컬러 적용
  - **거절**: `다음에 참여` - 경고 컬러(Red) 적용

---

## 3. 인터랙션 및 애니메이션 (Motion)

- **Layout Push**: 정보 패널이 열릴 때 채팅창의 너비가 유동적으로 줄어들며 공간을 확보 (`400ms`, `cubic-bezier(0.25, 1, 0.5, 1)` 이징).
- **Staggered Entry**: 패널 내의 각 섹션(헤더, 목록, 통계, 버튼)이 아래에서 위로 `15px` 올라오며 순차적으로 등장 (`40ms` 간격).
- **Interactive States**: 모든 클릭 가능한 요소에 대해 Hover 시 1.05배 확대, Press 시 0.95배 축소되는 마이크로 피드백 적용.

---

## 4. 기술 명세 (Technical Specs)

- **CSS**: CSS Variables를 사용한 테마 관리 (`[data-theme="light"]`)
- **JS**: `window.CommunityModules.ChatUI` 모듈을 통한 역할별 템플릿 렌더링
- **Data**: Firebase/Supabase 실시간 DB 연동을 통한 참여자 상태 및 수강권 실시간 업데이트
