"use client";

import MobileShell from "@/components/mobile/MobileShell";
import AuthLayout from "@/features/auth/AuthLayout";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export default function LoginPage() {
  return (
    <MobileShell showHeader={false} showTabBar={false}>
      <AuthLayout 
        title="Welcome back" 
        description="B-Square에 로그인하고 커리어를 가속화하세요"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[13px] font-bold ml-1 text-subtle">이메일/아이디</label>
            <input 
              type="text" 
              placeholder="이메일을 입력하세요"
              className="w-full h-[56px] px-5 rounded-[18px] bg-muted border-none focus:ring-2 focus:ring-primary/20 transition-all outline-none text-[16px] font-medium"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[13px] font-bold ml-1 text-subtle">비밀번호</label>
            <input 
              type="password" 
              placeholder="비밀번호를 입력하세요"
              className="w-full h-[56px] px-5 rounded-[18px] bg-muted border-none focus:ring-2 focus:ring-primary/20 transition-all outline-none text-[16px] font-medium"
            />
          </div>
          
          <div className="flex items-center justify-between px-1 pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 rounded-md border-muted text-primary focus:ring-primary/20" />
              <span className="text-[13px] font-bold text-subtle">로그인 유지</span>
            </label>
            <Link href={ROUTES.FIND_ACCOUNT} className="text-[13px] font-bold text-primary">비밀번호 찾기</Link>
          </div>

          <button className="w-full h-[58px] bg-primary text-white rounded-[20px] font-bold text-[17px] shadow-lg shadow-primary/20 active:scale-95 transition-all mt-6">
            로그인하기
          </button>

          <div className="text-center mt-10 space-y-4">
            <p className="text-[13px] font-medium text-subtle">계정이 없으신가요?</p>
            <Link 
              href={ROUTES.SIGNUP}
              className="inline-block px-8 py-3 rounded-full border border-black/5 font-bold text-[14px] active:bg-muted"
            >
              새로운 계정 만들기
            </Link>
          </div>
        </div>
      </AuthLayout>
    </MobileShell>
  );
}
