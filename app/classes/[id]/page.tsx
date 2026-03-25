"use client";

import React, { useState } from "react";
import MobileShell from "@/components/mobile/MobileShell";
import StickyActionBar from "@/components/ui/StickyActionBar";
import LoadingState from "@/components/ui/LoadingState";
import { useClassDetail } from "@/hooks/use-classes";
import { useParams } from "next/navigation";
import { Star, Share2, Heart, Check, ChevronRight, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "intro", label: "소개" },
  { id: "curriculum", label: "커리큘럼" },
  { id: "reviews", label: "리뷰" },
  { id: "notice", label: "공지" },
];

export default function ClassDetailPage() {
  const { id } = useParams() as { id: string };
  const { data: cls, isLoading } = useClassDetail(id);
  const [activeTab, setActiveTab] = useState("intro");

  if (isLoading) return <MobileShell title="Loading..."><LoadingState /></MobileShell>;
  if (!cls) return <MobileShell title="Not Found"><div>Class not found</div></MobileShell>;

  return (
    <MobileShell showHeader={false} className="px-0">
      {/* Hero Image Section */}
      <div className="relative aspect-video bg-muted">
        <img 
          src="https://images.unsplash.com/photo-1541462608141-ad4d4f94b88a?w=800"
          alt="Class Cover"
          className="w-full h-full object-cover"
        />
        <div className="absolute top-[var(--safe-top)] left-4 right-4 flex justify-between pt-4">
          <button className="p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white active:scale-95 transition-all">
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
          <div className="flex gap-2">
            <button className="p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white active:scale-95 transition-all">
              <Share2 className="w-5 h-5" />
            </button>
            <button className="p-2.5 bg-black/40 backdrop-blur-md rounded-full text-white active:scale-95 transition-all">
              <Heart className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 pb-20">
        {/* Title & Info */}
        <div className="pt-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2.5 py-1 bg-primary/10 text-primary text-[11px] font-black rounded-full uppercase">{cls.category}</span>
            <span className="text-[12px] font-bold text-subtle">{cls.instructor_name} 강사</span>
          </div>
          <h1 className="text-[22px] font-black leading-tight mb-4 text-pretty">
            {cls.title}
          </h1>
          <div className="flex items-center gap-4 mb-6">
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="text-[14px] font-black underline underline-offset-4">4.8 (124)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-primary" />
              <span className="text-[14px] font-black">실시간 질문 24건</span>
            </div>
          </div>
          
          <AppCard className="bg-muted border-none shadow-none flex items-center justify-between p-4 mb-8">
            <div className="space-y-1">
              <span className="text-[12px] font-bold text-subtle">현재 최대 혜택가</span>
              <div className="flex items-center gap-2">
                {cls.discount_rate && <span className="text-[18px] font-black text-rose-500">{cls.discount_rate}%</span>}
                <span className="text-[20px] font-black italic tracking-tighter">₩{cls.price.toLocaleString()}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-subtle line-through opacity-60 italic">₩112,000</span>
              <p className="text-[11px] font-bold text-foreground">무이자 3개월</p>
            </div>
          </AppCard>
        </div>

        {/* Floating Tabs */}
        <div className="sticky top-[var(--safe-top)] z-30 flex overflow-x-auto gap-1 py-3 -mx-5 px-5 glass border-y no-scrollbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-5 py-2.5 rounded-full text-[14px] font-bold whitespace-nowrap transition-all",
                activeTab === tab.id ? "bg-foreground text-background" : "text-subtle"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Section Placeholder */}
        <div className="pt-8 min-h-[50vh] animate-in fade-in duration-700">
          <h3 className="text-[18px] font-black mb-4">입문자를 위한 최고의 시작</h3>
          <p className="text-[15px] leading-relaxed text-subtle font-medium mb-6">
            이 클래스는 디자인의 기초도 모르는 비전공자분들을 위해 준비되었습니다.
            이론보다는 실습 위주로 구성되어 있으며, 현업에서 가장 많이 사용되는 도구인 Figma를 완벽하게 정복합니다.
          </p>
          
          <div className="space-y-3">
            {[1, 2, 3].map((_, i) => (
              <div key={i} className="flex gap-4 p-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3.5 h-3.5 text-primary" />
                </div>
                <span className="text-[14px] font-bold leading-relaxed">디자인 기획부터 사용자 리서치까지 실무 워크플로우를 경험합니다.</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sticky Action Bar */}
      <StickyActionBar className="flex gap-3">
        <button className="flex-1 h-[56px] border border-black/10 rounded-2xl font-bold text-foreground active:bg-muted transition-all">
          장바구니
        </button>
        <button className="flex-[2] h-[56px] bg-primary text-white rounded-2xl font-bold text-[16px] shadow-lg shadow-primary/20 active:scale-[0.98] transition-all">
          지금 바로 시작하기
        </button>
      </StickyActionBar>
    </MobileShell>
  );
}

// Internal Local Component
function AppCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-white rounded-3xl p-4 shadow-sm border", className)}>{children}</div>;
}
