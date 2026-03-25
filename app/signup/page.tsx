"use client";

import MobileShell from "@/components/mobile/MobileShell";
import AuthLayout from "@/features/auth/AuthLayout";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export default function SignupPage() {
  return (
    <MobileShell showHeader={false} showTabBar={false}>
      <AuthLayout 
        title="Create account" 
        description="가장 앞선 지식 공동체, B-Square의 멤버가 되어보세요"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[13px] font-bold ml-1 text-subtle">이름</label>
            <input type="text" placeholder="실명을 입력하세요" className="w-full h-[56px] px-5 rounded-[18px] bg-muted border-none outline-none text-[16px] font-medium" />
          </div>
          <div className="space-y-2">
            <label className="text-[13px] font-bold ml-1 text-subtle">이메일</label>
            <input type="email" placeholder="example@email.com" className="w-full h-[56px] px-5 rounded-[18px] bg-muted border-none outline-none text-[16px] font-medium" />
          </div>
          <div className="space-y-2">
            <label className="text-[13px] font-bold ml-1 text-subtle">비밀번호</label>
            <input type="password" placeholder="8자 이상 입력하세요" className="w-full h-[56px] px-5 rounded-[18px] bg-muted border-none outline-none text-[16px] font-medium" />
          </div>

          <div className="pt-4 space-y-3">
            <p className="text-[11px] text-subtle text-center px-4 leading-relaxed">
              가입 시 B-Square의 <span className="underline font-bold text-foreground">이용약관</span> 및 <span className="underline font-bold text-foreground">개인정보처리방침</span>에 동의하게 됩니다.
            </p>
            <button className="w-full h-[58px] bg-foreground text-background rounded-[20px] font-bold text-[17px] active:scale-95 transition-all">
              동의하고 가입하기
            </button>
          </div>

          <div className="text-center mt-10">
            <Link href={ROUTES.LOGIN} className="text-[14px] font-bold text-subtle">
              이미 계정이 있나요? <span className="text-primary ml-1">로그인</span>
            </Link>
          </div>
        </div>
      </AuthLayout>
    </MobileShell>
  );
}
