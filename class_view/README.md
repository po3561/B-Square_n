# 🎓 B-Square Class View Project

B-Square 플랫폼의 클래스 상세 페이지 프로젝트입니다. 수강생에게 강의 정보를 효과적으로 전달하고, 강사와 수강생 간의 소통 및 학습 관리를 지원하는 통합 인터페이스를 제공합니다.

## 🚀 주요 기능

### 1. 클래스 정보 제공 (Intro)
- **리치 텍스트 설명**: Quill.js를 활용한 미려한 강의 상세 설명.
- **시각적 요약**: 학습 목표 및 대상 수강생을 그리드와 리스트 형태로 제공.
- **히어로 섹션**: 클래스 대표 이미지 슬라이더 및 주요 메타데이터(카테고리, 평점) 표시.

### 2. 학습 관리 및 소통
- **커리큘럼**: 전체 강의 구성을 한눈에 확인하고 섹션별로 토글 가능.
- **공지사항**: 강사의 중요 공지 확인 및 댓글을 통한 양방향 소통.
- **수강 후기**: 실시간 별점 후기 및 포토 리뷰 그리드를 통한 신뢰도 확보.

### 3. 클래스 전용 채널 (Real-time Chat)
- **실시간 소통**: Firebase 기반의 수강생 전용 채팅 서비스.
- **고급 채팅 기능**: 메시지 고정(Pin), 답장(Reply), 메시지 검색, 파일/이미지 전송.
- **참여자 관리**: 채널 참여자 목록 확인 및 정보 패널 제공.

### 4. 수강 신청 및 결제
- **다양한 옵션**: 월정액, 기간제 패키지, 원데이 클래스 등 다양한 수강 모델 지원.
- **결제 통합**: PortOne SDK를 통한 안전한 결제 프로세스 및 쿠폰 할인 시스템.

### 5. 강사 전용 관리 (Admin)
- **페이지 편집**: 별도의 관리자 페이지 이동 없이 상세 페이지 내에서 즉시 내용 수정 가능.
- **공지 관리**: 공지사항 작성, 수정 및 삭제 권한 부여.

## 📂 프로젝트 구조

```text
class_view/
├── class_view.html       # 메인 구조 및 탭 컨테이너
├── class_view.css        # 전체 레이아웃 및 테마 스타일
├── class_view.js         # 전체 페이지 로직 및 탭 전환 제어
├── view_intro.js         # [소개] 탭 렌더링 및 로직
├── view_curriculum.js    # [커리큘럼] 데이터 바인딩 및 UI 제어
├── view_notice.js        # [공지사항] CRUD 및 모달 제어
├── view_reviews.js       # [후기] 별점 및 리뷰 목록 처리
├── view_chat.js          # [채팅] 실시간 메시징 연동
├── view_edit.js          # [수정] 강사 전용 편집 기능
├── view_chat.css         # 채팅 UI 전용 스타일
├── view_intro.css        # 소개 페이지 전용 스타일
├── view_curriculum.css   # 커리큘럼 UI 스타일
├── view_reviews.css      # 후기 및 별점 스타일
└── payment_toast.css     # 결제 및 알림 토스트 스타일
```

## 🛠 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Database/Auth**: [Supabase](https://supabase.com/), [Firebase](https://firebase.google.com/)
- **Payments**: [PortOne](https://portone.io/)
- **Editor**: [Quill.js](https://quilljs.com/)
- **Icons**: FontAwesome 6.0
