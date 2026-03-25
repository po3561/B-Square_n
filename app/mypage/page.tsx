"use client";

import React from "react";
import MobileShell from "@/components/mobile/MobileShell";
import AppCard from "@/components/ui/AppCard";
import SectionHeader from "@/components/ui/SectionHeader";
import LoadingState from "@/components/ui/LoadingState";
import { useAuth } from "@/hooks/use-auth";
import Link from "next/link";
import { User, Settings, CreditCard, Users, BookOpen, Crown, ChevronRight, LogOut } from "lucide-react";

export default function MyPage() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) return <MobileShell title="My Page"><LoadingState /></MobileShell>;

  if (!user) {
    return (
      <MobileShell title="마이페이지">
        <section className="mt-8 flex flex-col items-center text-center px-6">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center text-[40px] mb-6">
            👤
          </div>
          <h2 className="text-[22px] font-black mb-2">로그인이 필요합니다</h2>
          <p className="text-[14px] text-subtle font-medium mb-8">
            B-Square의 모든 혜택을 누리려면<br />지금 바로 로그인하세요.
          </p>
          <Link 
            href="/login" 
            className="w-full h-[56px] bg-primary text-white rounded-2xl flex items-center justify-center text-[15px] font-bold active:scale-[0.98] transition-all shadow-lg shadow-primary/20 mb-4"
          >
            로그인하기
          </Link>
          <Link 
            href="/signup" 
            className="text-[14px] font-bold text-subtle hover:text-primary transition-colors"
          >
            아직 계정이 없으신가요? 회원가입
          </Link>
        </section>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="마이페이지">
      {/* Profile Card */}
      <section className="mt-4">
        <AppCard className="bg-foreground text-background p-5 flex items-center justify-between border-none shadow-premium relative overflow-hidden">
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-[24px]">
              👤
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <h2 className="text-[18px] font-black">{user.name} 님</h2>
                <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[9px] font-black rounded border border-primary/30 uppercase tracking-tighter">
                  {user.role}
                </span>
              </div>
              <p className="text-[12px] font-medium opacity-60">Lv.1 실무 꿈나무</p>
            </div>
          </div>
          <button className="relative z-10 p-2 bg-white/10 rounded-full">
            <Settings className="w-4 h-4 opacity-60" />
          </button>
          <div className="absolute -right-16 -bottom-16 w-40 h-40 bg-primary/20 rounded-full blur-3xl opacity-50" />
        </AppCard>
      </section>

      {/* Summary Widget */}
      <section className="mt-6 grid grid-cols-3 gap-3">
        {[
          { icon: <BookOpen className="w-4 h-4 text-blue-500" />, label: "수강중", count: "2" },
          { icon: <Crown className="w-4 h-4 text-yellow-500" />, label: "상장/수료", count: "1" },
          { icon: <Users className="w-4 h-4 text-orange-500" />, label: "네트워킹", count: "12" },
        ].map((item, i) => (
          <AppCard key={i} className="flex flex-col items-center justify-center p-3 gap-1.5 border-none bg-muted/30 shadow-none active:scale-95 transition-all">
            <div className="p-2 bg-white rounded-xl shadow-sm">
              {item.icon}
            </div>
            <div className="text-center">
              <span className="text-[9px] font-black text-subtle/60 uppercase tracking-tighter block">{item.label}</span>
              <span className="text-[14px] font-black italic">{item.count}</span>
            </div>
          </AppCard>
        ))}
      </section>

      {/* Menu List */}
      <SectionHeader title="학습 관리" className="mt-8" />
      <div className="space-y-2 mb-4">
        {[
          { icon: <BookOpen className="w-5 h-5 text-blue-500" />, label: "내 강의실 (수강 목록)" },
          { icon: <StarIcon className="w-5 h-5 text-yellow-500" />, label: "찜한 클래스" },
          { icon: <HistoryIcon className="w-5 h-5 text-emerald-500" />, label: "시청 기록" },
        ].map((item, i) => (
          <button key={i} className="w-full flex items-center justify-between p-4 bg-muted/30 rounded-2xl active:bg-muted transition-colors">
            <div className="flex items-center gap-4">
              {item.icon}
              <span className="text-[14px] font-bold">{item.label}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-subtle/30" />
          </button>
        ))}
      </div>

      <SectionHeader title="기타" className="mt-6" />
      <div className="space-y-2 mb-10">
        {[
          { icon: <CreditCard className="w-5 h-5 text-indigo-500" />, label: "결제 내역 및 영수증" },
          { icon: <HelpIcon className="w-5 h-5 text-subtle" />, label: "고객센터 / 문의하기" },
        ].map((item, i) => (
          <button key={i} className="w-full flex items-center justify-between p-4 bg-muted/30 rounded-2xl active:bg-muted transition-colors">
            <div className="flex items-center gap-4">
              {item.icon}
              <span className="text-[14px] font-bold">{item.label}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-subtle/30" />
          </button>
        ))}
      </div>

      <button 
        onClick={logout}
        className="w-full h-[50px] flex items-center justify-center gap-2 text-subtle/40 font-bold text-[13px] active:text-rose-500 mb-10 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        로그아웃
      </button>
    </MobileShell>
  );
}

// Icons
function StarIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> }
function HistoryIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg> }
function HelpIcon(props: any) { return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg> }
