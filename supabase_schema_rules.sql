-- ==============================================================================
-- Supabase 연결 및 보안 규칙(Firebase Rules와 동일한 역할) 파일
-- ==============================================================================
-- 이 파일은 Supabase 프로젝트의 'SQL Editor' 메뉴에 복사하여 붙여넣고 [Run] 하시면 적용됩니다.
-- 여러 번 실행해도 오류가 나지 않도록 기존 정책을 삭제하는 코드가 포함되어 있습니다.

-- 1. 사용자(Users) 테이블 생성 (회원가입/마이페이지 정보 저장용)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,
    username TEXT,
    sns_link TEXT,
    preferred_category TEXT,
    profile_image_url TEXT,
    birth_year TEXT,
    birth_month TEXT,
    birth_day TEXT,
    gender TEXT,
    nationality TEXT,
    signup_path TEXT,
    membership_level TEXT DEFAULT 'Free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Row Level Security (RLS) 활성화
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 3. 기존 정책(Policy)이 있다면 오류 방지를 위해 먼저 삭제 (초기화)
DROP POLICY IF EXISTS "본인 정보만 조회 가능" ON public.users;
DROP POLICY IF EXISTS "본인 정보만 생성 기능" ON public.users;
DROP POLICY IF EXISTS "본인 정보만 수정 가능" ON public.users;
DROP POLICY IF EXISTS "본인 정보만 삭제 가능" ON public.users;

-- 4. 보안 정책(Policy) 새로 작성

-- (1) 조회 권한: 로그인한 본인의 데이터만 조회 가능
CREATE POLICY "본인 정보만 조회 가능" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

-- (2) 인서트(생성) 권한: 자기 자신의 아이디로만 데이터 생성 가능
CREATE POLICY "본인 정보만 생성 기능" 
ON public.users 
FOR INSERT 
WITH CHECK (auth.uid() = id);

-- (3) 업데이트(수정) 권한: 자기 자신의 아이디만 수정 가능 (마이페이지용)
CREATE POLICY "본인 정보만 수정 가능" 
ON public.users 
FOR UPDATE 
USING (auth.uid() = id) 
WITH CHECK (auth.uid() = id);

-- (4) 삭제 권한: 자기 자신의 아이디만 삭제 가능
CREATE POLICY "본인 정보만 삭제 가능" 
ON public.users 
FOR DELETE 
USING (auth.uid() = id);
