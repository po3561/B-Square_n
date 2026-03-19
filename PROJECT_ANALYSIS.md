# B-Square 프로젝트 분석 보고서

본 문서는 B-Square 프로젝트의 구조, 기술 스택 및 주요 기능에 대한 분석 결과를 담고 있습니다.

## 1. 프로젝트 개요
B-Square는 온라인 클래스 플랫폼으로, 사용자가 다양한 카테고리의 강의를 탐색하고 수강할 수 있는 웹 애플리케이션입니다. Firebase와 Supabase를 결합한 하이브리드 백엔드 구조를 채택하고 있으며, 프레임워크 없이 순수 자바스크립트(Vanilla JS)로 구현된 것이 특징입니다.

## 2. 기술 스택
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Backend (Realtime/Config)**: Firebase (Realtime Database, Authentication)
- **Backend (Structured Data)**: Supabase (PostgreSQL, Row Level Security)
- **Deployment**: Firebase Hosting (추측)
- **Design**: 반응형 웹 (Mobile: `style_mobile.css`, PC: `style_pc.css`)

## 3. 프로젝트 아키텍처
### 중앙 서버 모듈 (`bsq_server.js`)
프로젝트의 핵심 엔진으로, 모든 페이지에서 공통적으로 로드됩니다.
- **초기화**: Firebase와 Supabase 클라이언트를 초기화하고 전역 객체 `window.BSQ`를 통해 API를 제공합니다.
- **보안**: Firebase 익명 인증을 통해 클라이언트 측에서의 안전한 데이터 쓰기를 보장합니다.
- **동적 설정**: 사이트 이름, 파비콘, 푸터 정보, SEO 메타 태그 등을 Firebase 데이터베이스에서 실시간으로 가져와 적용합니다.
- **트래킹**: 일일 방문자 수 및 실시간 접속자(Presence)를 관리합니다.

### 데이터베이스 전략
- **Firebase RTDB**: 배너 설정, 사이트 디자인 정보, 실시간 리뷰 상태, 방문자 통계 등 빠른 업데이트와 실시간 동기화가 필요한 데이터에 사용됩니다.
- **Supabase**: 사용자 프로필(`users`), 수강권(`user_passes`), 결제 및 클래스 메타데이터 등 관계형 구조와 엄격한 보안 규칙(RLS)이 필요한 데이터에 사용됩니다.

## 4. 주요 디렉토리 구조
- `root/`: 설정 파일 및 진입점 리다이렉트
- `bsnnnnnnnnnnnnnnnnnn/`: 실제 서비스의 메인 프런트엔드 코드 (인덱스, 메인 로직)
- `admin_dashboard/`: 관리자용 대시보드 및 설정 페이지
- `class/`, `class_view/`, `create_class/`: 클래스 목록, 상세 보기, 생성 관련 로직
- `community/`: 채팅 및 커뮤니티 기능
- `login/`: 인증 관련 페이지 (회원가입, 로그인, 계정 찾기)
- `mi_pesg/`: 마이페이지 (프로필, 수강 내역, 보안 설정)
- `api/`: 서버리스 함수 또는 API 관련 폴더 (내용 확인 필요)

## 5. 주요 기능
1. **실시간 클래스 탐색**: Firebase와 Supabase에서 데이터를 병합하여 실시간으로 클래스 목록을 렌더링합니다.
2. **동적 배너 및 추천**: 관리자가 Firebase 콘솔 또는 어드민 페이지에서 수정한 배너와 추천 목록이 즉시 반영됩니다.
3. **권한 기반 개발자 모드**: 특정 계정으로 로그인 시 `DEV_MODE`가 활성화되어 디버깅 및 관리 기능을 제공합니다.
4. **반응형 최적화**: 모바일 사용자 경험을 위해 전용 CSS와 Drawer 메뉴를 구현하고 있습니다.

## 6. 특징 및 장점
- **프레임워크 독립성**: 외부 프레임워크 의존성을 최소화하여 로딩 속도가 빠르고 유지보수가 용이합니다.
- **하이브리드 백엔드**: NoSQL(Firebase)의 실시간성과 SQL(Supabase)의 구조적 견고함을 동시에 활용합니다.
- **확장성**: `bsq_server.js`를 통해 백엔드 로직이 캡슐화되어 있어, 기능 추가 시 일관된 인터페이스를 사용할 수 있습니다.
