# B-Square Mobile Deployment Guide (Cloudflare Pages)

이 문서는 기존 PC 웹과 신규 모바일 Next.js 프론트엔드를 Cloudflare Pages에 통합 배포하는 방법을 설명합니다.

## 1. 프로젝트 구조 (Monorepo)
- 모든 소스는 `bsq-mobile` 디렉토리를 중심으로 관리됩니다.
- 레거시 PC 파일은 `bsq-mobile/public/pc`에 위치합니다.
- 레거시 API Functions는 `bsq-mobile/functions`에 통합되어 스테이리스하게 동작합니다.

## 2. Cloudflare Pages 설정
대시보드에서 다음 설정을 적용하십시오.

| 항목 | 설정값 |
| :--- | :--- |
| **Framework Preset** | Next.js (App Router) |
| **Build Command** | `npm run build` |
| **Build Output Directory** | `.next` 또는 `.vercel/output` |
| **Root Directory** | `/bsq-mobile` |

## 3. 환경 변수 (Environment Variables)
| 변수명 | 설명 | 추천값 |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_BASE_URL` | API 엔드포인트 루트 | `/api` |
| `NEXT_PUBLIC_MOCK_MODE` | Mock 데이터 사용 여부 | `false` (운영 시) |

## 4. 자동 배포 흐름
1. 로컬에서 작업 완료 후 `main` 브랜치로 `git push`.
2. Cloudflare Pages가 변경사항을 감지하여 빌드 시작.
3. 빌드 완료 후 `https://b-square-web.pages.dev/`에 자동 반영.

## 5. 확인 사항
- 배포 후 `/debug` 경로에 접속하여 API 연결 상태를 최종 확인하십시오.
