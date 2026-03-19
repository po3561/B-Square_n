# Admin Dashboard (관리자 대시보드)

이 폴더는 B-Square 플랫폼의 전체적인 관리 및 설정을 위한 관리자 전용 대시보드 기능을 포함하고 있습니다.

## 📁 주요 파일 구성
- `admin.html`: 관리자 대시보드의 메인 레이아웃 및 UI 구조 (Single Page Application 방식).
- `admin.css`: 대시보드 전용 스타일시트. 사이드바, 카드형 통계, 표(Table) 스타일 등을 정의.
- `admin_core.js`: 관리자 페이지의 핵심 엔진. 인증 확인(`verifyAdminAccess`), 사이드바 네비게이션 및 탭 전환 로직 담당.
- `admin_dashboard.js`: 메인 대시보드 탭의 통계 데이터(사용자 수, 클래스 수, 매출, 방문자 수) 로드 및 Chart.js를 이용한 시각화.
- `admin_classes.js`: 클래스 목록 관리, 승인, 수정 및 삭제 로직.
- `admin_users.js`: 사용자 목록 조회 및 권한 관리.
- `admin_payments.js`: 결제 내역(수강권) 조회 및 상태 관리.
- `admin_recommend.js`: 메인 페이지의 추천 클래스 및 배너 설정 관리.
- `admin_settings.js`: 사이트 전역 설정(이름, 로고, 푸터 정보 등) 관리.
- `admin_extensions.js`: 추가 확장 기능 및 유틸리티 로직.

## 🛠️ 주요 기능
1. **보안 및 접근 제어**: 특정 관리자 계정(Firebase/Supabase Auth 기준)만 접근 가능하도록 `admin_core.js`에서 강력한 가드 로직을 수행합니다.
2. **실시간 통계**: Firebase Realtime Database를 활용하여 실시간 방문자 수 및 현재 접속자 수를 표시합니다.
3. **데이터 통합**: Firebase(클래스, 설정)와 Supabase(사용자, 결제)의 데이터를 통합하여 관리합니다.
4. **탭 기반 인터페이스**: 페이지 새로고침 없이 사이드바 메뉴를 통해 다양한 관리 기능 간의 전환이 가능합니다.

## ⚠️ 주의 사항
- `admin_core.js` 내부에 하드코딩된 관리자 이메일 리스트가 존재하므로, 관리자 추가 시 해당 파일을 업데이트하거나 DB 기반의 Role 시스템으로 고도화가 필요합니다.
- 외부 라이브러리로 `Chart.js`를 사용하고 있습니다.
