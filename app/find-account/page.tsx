"use client";

import MobileShell from "@/components/mobile/MobileShell";
import AuthLayout from "@/features/auth/AuthLayout";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export default function FindAccountPage() {
  return (
    <MobileShell showHeader={false} showTabBar={false}>
      <AuthLayout 
        title="Find account" 
        description="가입 시 등록한 이메일로 인증 링크를 발송합니다"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[13px] font-bold ml-1 text-subtle">등록된 이메일</label>
            <input type="email" placeholder="example@email.com" className="w-full h-[56px] px-5 rounded-[18px] bg-muted border-none outline-none text-[16px] font-medium" />
          </div>

          <button className="w-full h-[58px] bg-muted text-foreground rounded-[20px] font-bold text-[17px] active:scale-95 transition-all">
            인증 링크 보내기
          </button>

          <div className="text-center mt-10">
            <Link href={ROUTES.LOGIN} className="text-[14px] font-bold text-subtle">
              로그인 화면으로 돌아가기
            </Link>
          </div>
        </div>
      </AuthLayout>
    </MobileShell>
  );
}
