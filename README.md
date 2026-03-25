# B-Square 통합 웹 프로젝트 (Next.js + Legacy PC)

이 저장소는 기존 B-Square_n(PC 웹)과 신규 B-Square Mobile(Next.js)이 통합된 프로젝트입니다.

## 🗼 프로젝트 구조
- **모바일 (Primary)**: Next.js 14 App Router 기반 (`/app`, `/components`)
- **PC (Legacy)**: 기존 HTML/JS 자산 (`/public/pc`에 위치)
- **API (Functions)**: Cloudflare Pages Functions (`/functions`)

## 🚥 자동 기기 감지 서비스
`middleware.ts`를 통해 접속 기기에 따라 최적의 UI를 제공합니다.
- **모바일 기기**: Next.js 모바일 앱으로 자동 연결
- **데스크톱 기기**: `/pc/index.html` (Legacy)로 자동 전환

## 🛠 실행 및 관리 (Local)
1. `npm install`
2. `npm run dev` (메인 포트: 3000)

## 🧪 검증 도구
- `/debug`: API 상태 및 세션 실시간 점검 시스템

## 🚀 배포 정보
- `DEPLOY.md`: Cloudflare Pages 배포 가이드
- `QA_CHECKLIST.md`: 품질 점검 체크리스트
