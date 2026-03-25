"use client";

import React, { useState } from "react";
import MobileShell from "@/components/mobile/MobileShell";
import AppCard from "@/components/ui/AppCard";
import SectionHeader from "@/components/ui/SectionHeader";
import Chip from "@/components/ui/Chip";
import LoadingState from "@/components/ui/LoadingState";
import ClassCard from "@/features/classes/ClassCard";
import { 
  Crown, Sparkles, TrendingUp, Zap, 
  ChevronDown, ChevronUp, Code, Lightbulb, 
  Palette, Globe, Languages, Terminal, 
  Briefcase, BarChart 
} from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES = [
  { id: "1", label: "직무·실무", icon: <Zap className="w-5 h-5 text-orange-500" /> },
  { id: "2", label: "디자인", icon: <Sparkles className="w-5 h-5 text-purple-500" /> },
  { id: "3", label: "개발", icon: <TrendingUp className="w-5 h-5 text-blue-500" /> },
  { id: "4", label: "외국어", icon: <Crown className="w-5 h-5 text-yellow-500" /> },
  { id: "5", label: "기획", icon: <Lightbulb className="w-5 h-5 text-amber-500" /> },
  { id: "6", label: "마케팅", icon: <BarChart className="w-5 h-5 text-rose-500" /> },
  { id: "7", label: "코딩", icon: <Code className="w-5 h-5 text-sky-500" /> },
  { id: "8", label: "브랜딩", icon: <Palette className="w-5 h-5 text-pink-500" /> },
  { id: "9", label: "데이터", icon: <Terminal className="w-5 h-5 text-slate-500" /> },
  { id: "10", label: "커리어", icon: <Briefcase className="w-5 h-5 text-indigo-500" /> },
  { id: "11", label: "글로벌", icon: <Globe className="w-5 h-5 text-teal-500" /> },
  { id: "12", label: "제2외국어", icon: <Languages className="w-5 h-5 text-violet-500" /> },
];

import { useClasses } from "@/hooks/use-classes";

export default function Home() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { data: popularClasses, isLoading } = useClasses({ limit: 4 } as any);
  const visibleCategories = isExpanded ? ALL_CATEGORIES : ALL_CATEGORIES.slice(0, 10);

  return (
    <MobileShell title="B-Square">
      {/* ... Hero Banner ... */}
      <section className="mt-2">
        <div className="relative h-[130px] w-full rounded-[20px] overflow-hidden bg-gradient-to-br from-primary to-secondary p-6 text-white shadow-premium">
          <div className="relative z-10 h-full flex flex-col justify-center">
            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">New Arrival</span>
            <h2 className="text-[19px] font-black leading-tight mb-3 text-pretty">
              B-Square에서 제안하는<br />실전 커리어 로드맵
            </h2>
            <button className="w-fit px-4 py-1.5 bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-[11px] font-bold active:scale-95 transition-all">
              자세히 보기
            </button>
          </div>
          <div className="absolute -right-2 -bottom-2 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
        </div>
      </section>

      {/* ... Categories ... */}
      {/* ... Grid Toggle ... */}

      {/* Popular Section (2-Column Grid) */}
      <SectionHeader title="지금 인기 있는 클래스" actionLabel="전체보기" className="mt-2" />
      <div className="grid grid-cols-2 gap-3 mb-6 min-h-[200px]">
        {isLoading ? (
          <div className="col-span-2 flex justify-center py-10"><LoadingState /></div>
        ) : (
          popularClasses.slice(0, 4).map((cls) => (
            <ClassCard
              key={cls.id}
              id={cls.id}
              title={cls.title}
              category={cls.category}
              instructor={cls.instructor_name}
              price={`₩${cls.price.toLocaleString()}`}
              discount={cls.discount_rate ? `${cls.discount_rate}%` : undefined}
            />
          ))
        )}
      </div>

      {/* Recommended Topics (Horizontal Small Cards) */}
      <SectionHeader title="추천 토픽" />
      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4">
        {[1, 2, 3, 4].map((_, i) => (
          <div key={i} className="min-w-[140px] max-w-[140px]">
            <AppCard padding={false} className="border-none bg-muted/40 shadow-none h-full">
              <div className="aspect-square rounded-2xl bg-muted mb-2 overflow-hidden">
                <div className="w-full h-full bg-gradient-to-tr from-muted to-white/20" />
              </div>
              <div className="px-1 pb-2">
                <span className="text-[10px] font-black text-primary block mb-1">MARKETING</span>
                <h4 className="text-[13px] font-bold leading-tight line-clamp-2">데이터로 말하는 퍼포먼스 마케팅</h4>
              </div>
            </AppCard>
          </div>
        ))}
      </div>

      <div className="h-10" />
    </MobileShell>
  );
}
