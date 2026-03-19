# B-Square 프로젝트 심층 분석 보고서

본 문서는 B-Square 프로젝트의 최신 아키텍처, 기술 스택 및 구현된 핵심 기능에 대한 상세 분석 결과를 포함합니다.

## 1. 프로젝트 개요

B-Square는 온라인 클래스 및 커뮤니티 플랫폼으로, 실시간 상호작용과 프리미엄 디자인을 지향합니다. 초기 Firebase/Supabase 구조에서 **Cloudflare Workers 및 D1(SQLite)**을 기반으로 한 고성능 서버리스 아키텍처로 진화하였습니다.

## 2. 최신 기술 스택 (Modern Tech Stack)

- **Frontend**: Vanilla JavaScript (ES6+), CSS3 (Custom Design System), HTML5
- **Backend (API/Serverless)**: Cloudflare Workers (Functions)
- **Database (Relational)**: Cloudflare D1 (SQLite) - 채팅, 모임, 수강신청 등 핵심 데이터 저장
- **Real-time**: Custom Poll/Fetch 메커니즘을 통한 실시간 채팅 및 상태 동기화
- **Auth**: API 전용 세션 및 쿠키 기반 인증 (bsq_server.js 연동)

## 3. 핵심 모듈 분석

### 🛡️ 모듈형 클래스 뷰 (`class_view/`)

클래스의 상세 정보, 커리큘럼, 리뷰 및 프리미엄 채널을 관리하는 핵심 사용자 인터페이스입니다.

- **SimpleClassChat**: 파이어베이스 의존성을 제거하고 D1 API와 직접 통신하는 경량화된 채팅 엔진입니다.
- **Tab Isolation**: 탭 전환 시 레이아웃 침범을 막기 위한 철저한 시각적 격리 로직이 적용되어 있습니다. (소개/공지/채널 탭별 최적화)

### 💬 프리미엄 채팅 및 모임 시스템

- **Gathering System**: 강사가 생성하는 '모집 카드' 시스템입니다. 실시간 타이머, 정원 관리, 자가 치유형 DB 스키마(Missing Columns 자동 추가) 기능을 포함합니다.
- **UI/UX**: Apple/Telegram 하이브리드 디자인을 채택하여 Glassmorphism 효과, 부드러운 애니메이션, 직관적인 정보 패널을 제공합니다.

### ⚙️ 서버리스 API (`functions/api/`)

- **JSON REST API**: 모든 클라이언트 요청은 `/api/` 경로를 통해 서버리스 함수로 처리됩니다.
- **데이터 무결성**: D1 트랜잭션과 `ensureTables` 로직을 통해 런타임 중에도 데이터베이스 안정성을 보장합니다.

## 4. 데이터베이스 스키마 (D1 SQLite)

- `class_gatherings`: 모임 제목, 장소(location), 일시, 정원 및 상태 정보
- `gathering_participants`: 모임 참여자 명단 및 참여 시점
- `chats`: 클래스별 채팅 메시지 기록 (메타데이터 지원)
- `enrollments`: 사용자와 클래스 간의 수강 신청 및 권한 관계

## 5. 최근 기술적 성과 (Phase 2+)

1. **D1 완전 전환**: 핵심 비즈니스 로직을 SQLite 기반 D1으로 이전하여 일관된 쿼리 성능 확보
2. **자가 치유 스키마**: 새로운 기능(장소 필드 등) 추가 시 DB 마이그레이션 없이 코드가 자동으로 컬럼을 확장
3. **디자인 완성도**: 다크 모드 가독성 최적화 및 프리미엄 아이콘 시스템 전면 교체
4. **접근 제어**: 강사와 학생 간의 차별화된 UI 권한 관리 및 채팅 잠금/해제 프로세스 정립

## 6. 향후 확장 가능성

- **확장성**: Workers의 엣지 컴퓨팅 성능을 활용한 글로벌 서비스 대응 용이
- **유지보수**: Vanilla JS 기반의 낮은 의존성으로 인해 프레임워크 버전 업데이트 리스크 없음

---

*마지막 수정일: 2026-03-19*
