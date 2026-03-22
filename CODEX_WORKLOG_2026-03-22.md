# Codex Worklog - 2026-03-22

## 목적

Cloudflare Pages + D1 기반 B-Square 프로젝트에서 반복적으로 발생하던 `D1_ERROR: no such column ...` 계열 오류와 커뮤니티/채팅 관련 연쇄 오류를 추적하고, 운영 DB 스키마와 프런트/API 호출 불일치를 함께 보정했다.

## 이번 작업에서 확인된 핵심 원인

### 1. D1 스키마 드리프트

운영 코드가 기대하는 컬럼과 실제 D1 테이블 컬럼이 달라서 다음과 같은 오류가 발생했다.

- `recommendations.description`
- `recommendations.type`
- `recommendations.category`
- `dm_messages.room_type`

즉, 코드 기준 스키마는 최신인데 운영 D1은 구버전 테이블 구조를 그대로 갖고 있는 상태였다.

### 2. 프런트/API 계약 불일치

스키마 문제 외에도 실제 화면 오류를 만드는 구조적 문제가 있었다.

- `bsq_server.js`가 비로컬 환경에서 API를 무조건 `https://b-square-web.pages.dev`로 호출함
- 커뮤니티 클래스 채팅 등록이 `/api/user-chats`를 DM 생성 방식으로 잘못 사용함
- `community/chat_ui.js`의 gatherings 호출 형식이 `functions/api/gatherings.js`와 맞지 않음
- 일부 페이지 경로 오타 존재

이 상태에서는 DB가 멀쩡해도 `Failed to fetch`, 세션 누락, SSE 실패, 채팅 진입 실패가 날 수 있었다.

## 수정한 주요 파일

### 공통 API/스키마 보정

- [functions/api/_lib/schema.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/_lib/schema.js)
  - 요청 시 자동으로 빠진 컬럼을 추가하는 self-healing 로직 추가
  - 현재 보정 대상:
    - `recommendations`
    - `dm_messages`
    - `user_chats`
    - `contacts`
    - `group_chats`
    - `chat_messages`
    - `class_gatherings`

### API 엔드포인트 수정

- [functions/api/recommendations.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/recommendations.js)
- [functions/api/admin/recommendations.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/admin/recommendations.js)
- [functions/api/dm.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/dm.js)
- [functions/api/dm/[[path]].js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/dm/[[path]].js)
- [functions/api/user-chats.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/user-chats.js)
- [functions/api/contacts.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/contacts.js)
- [functions/api/group-chats.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/group-chats.js)
- [functions/api/chat.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/chat.js)
- [functions/api/gatherings.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/gatherings.js)

### 프런트 수정

- [bsq_server.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/bsq_server.js)
  - 현재 접속 중인 `origin`을 우선 API base로 사용하도록 수정
  - 배포 프리뷰 URL, 본 배포 URL, same-origin 세션/SSE 동작 안정화

- [community/community.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/community/community.js)
  - 클래스 채팅 자동 등록 로직을 `type: 'class'` 방식으로 수정
  - 잘못된 클래스 목록 경로 수정

- [community/chat_ui.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/community/chat_ui.js)
  - `gatherings` 생성/참여/마감 요청을 실제 API 형식에 맞게 수정

- [dev_mode.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/dev_mode.js)
  - 클래스 생성 페이지 경로 수정

### 스키마 기준 파일

- [migrations/0001_canonical_schema.sql](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/migrations/0001_canonical_schema.sql)
  - `recommendations.description`, `type`, `category`를 canonical schema에 반영

## 운영 D1에 직접 반영한 내용

Wrangler를 통해 원격 D1에 직접 반영함.

- `recommendations.description` 추가
- `recommendations.type` 추가
- `recommendations.category` 추가
- `dm_messages.room_type` 추가
- `idx_dm_messages_room_created` 인덱스 생성

## 배포 이력

### 관련 배포 URL

- 중간 배포: `https://7dfc3689.b-square-web.pages.dev`
- 후속 배포: `https://bb178e4d.b-square-web.pages.dev`
- 최신 배포: `https://499d1419.b-square-web.pages.dev`

### 현재 기준 최신 배포

- `https://499d1419.b-square-web.pages.dev`

## Git 기록

- 브랜치: `main`
- 최신 커밋: `846b8b7`
- 커밋 메시지: `Fix D1 schema drift and stabilize community chat APIs`

## 주의사항 / 아직 남을 수 있는 리스크

### 1. `migrations/0001_canonical_schema.sql` 재적용 이슈

이 파일은 과거 remote apply 시 `dm_messages.room_type` 관련 오류로 실패한 적이 있다.

현재는 운영 DB에 필요한 핵심 컬럼을 직접 보정했고, 요청 시 자동 스키마 복구도 넣어둔 상태라 서비스는 훨씬 안정적이지만,
향후 마이그레이션 체계를 정리하려면 `canonical schema`와 실제 운영 스키마의 재정렬이 필요하다.

### 2. 아직 전 파일 수동 전수 QA는 아님

이번 작업은 실제 장애 가능성이 큰 축을 우선 정리한 것이다.

특히 아래는 후속 점검 가치가 높다.

- 관리자 대시보드 전체 메뉴 순회
- 커뮤니티 그룹 채팅 생성/수정/삭제
- 클래스 채팅, DM, SSE 스트림 실사용 테스트
- 결제/정산/재무 API의 구버전 스키마 호환성

### 3. self-healing schema는 응급 안정화 성격

`functions/api/_lib/schema.js` 기반 보정은 운영 장애를 줄이는 데는 유효하지만,
장기적으로는 정식 migration 정리 쪽이 더 바람직하다.

## 다음 작업 시작 시 추천 순서

1. 최신 배포 URL에서 커뮤니티 채팅 목록, DM 진입, 클래스 채팅 진입 테스트
2. 브라우저 콘솔과 API 오류 메시지 확인
3. 또 `no such column`이 뜨면 해당 테이블을 `schema.js`와 canonical schema 둘 다에 반영
4. 충분히 안정화되면 마이그레이션 체계 재정리

## 빠른 참고 포인트

- 공통 원인: 운영 D1 스키마가 코드보다 오래됨
- 공통 해결 지점: [functions/api/_lib/schema.js](c:/Users/po356/Desktop/B-Square/사이트/개발/B-Square_n/functions/api/_lib/schema.js)
- 최신 배포: `https://499d1419.b-square-web.pages.dev`
- 최신 커밋: `846b8b7`
