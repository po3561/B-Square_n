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
DROP POLICY IF EXISTS "누구나 정보 조회 가능" ON public.users;
DROP POLICY IF EXISTS "본인 정보만 생성 기능" ON public.users;
DROP POLICY IF EXISTS "본인 정보만 수정 가능" ON public.users;
DROP POLICY IF EXISTS "본인 정보만 삭제 가능" ON public.users;

-- 4. 보안 정책(Policy) 새로 작성

-- (1) 조회 권한: 누구나 기본 정보 조회 가능 (서브 강사 검색용)
CREATE POLICY "누구나 정보 조회 가능" 
ON public.users 
FOR SELECT 
USING (true);

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

-- ==============================================================================
-- 5. 수강권 및 패스(Passes) 테이블 생성 (Phase 6 신설)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.user_passes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    class_id TEXT NOT NULL,
    pass_type TEXT NOT NULL, -- 'monthly' (정기), '30days' (30일권), 'onetime' (1회권)
    remaining_count INTEGER DEFAULT 0, -- 1회권 잔여 수량 (onetime일 때만 보통 1 이상)
    expires_at TIMESTAMP WITH TIME ZONE, -- 만료일자 (monthly, 30days일 때 세팅)
    status TEXT DEFAULT 'active', -- 'active', 'expired', 'refunded'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.user_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "본인 및 강사 조회 가능" ON public.user_passes;
DROP POLICY IF EXISTS "본인 및 강사 생성 가능" ON public.user_passes;
DROP POLICY IF EXISTS "본인 및 강사 수정 가능" ON public.user_passes;

-- 클라이언트 로직 편의상, 일단 로그인한 유저라면 Read/Write가 가능하도록 개방적인 룰 채택 (추후 세분화)
CREATE POLICY "본인 및 강사 조회 가능" 
ON public.user_passes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "본인 및 강사 생성 가능" 
ON public.user_passes 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "본인 및 강사 수정 가능" 
ON public.user_passes 
FOR UPDATE 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
