"use client";

import React, { useState } from "react";
import MobileShell from "@/components/mobile/MobileShell";
import ScrollTab from "@/components/ui/ScrollTab";
import ClassCard from "@/features/classes/ClassCard";
import LoadingState from "@/components/ui/LoadingState";
import { useClasses } from "@/hooks/use-classes";
import { Search, SlidersHorizontal, ChevronDown, ChevronUp, Zap, Sparkles, TrendingUp, Crown, Lightbulb, BarChart, Code, Palette, Terminal, Briefcase, Globe, Languages } from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_CATEGORIES = [
  { id: "job", label: "직무·실무", icon: <Zap className="w-5 h-5 text-orange-500" /> },
  { id: "design", label: "디자인", icon: <Sparkles className="w-5 h-5 text-purple-500" /> },
  { id: "dev", label: "개발", icon: <TrendingUp className="w-5 h-5 text-blue-500" /> },
  { id: "lang", label: "외국어", icon: <Crown className="w-5 h-5 text-yellow-500" /> },
  { id: "plan", label: "기획", icon: <Lightbulb className="w-5 h-5 text-amber-500" /> },
  { id: "market", label: "마케팅", icon: <BarChart className="w-5 h-5 text-rose-500" /> },
  { id: "coding", label: "코딩", icon: <Code className="w-5 h-5 text-sky-500" /> },
  { id: "brand", label: "브랜딩", icon: <Palette className="w-5 h-5 text-pink-500" /> },
  { id: "data", label: "데이터", icon: <Terminal className="w-5 h-5 text-slate-500" /> },
  { id: "career", label: "커리어", icon: <Briefcase className="w-5 h-5 text-indigo-500" /> },
];

export default function ClassListPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { data: classes, isLoading } = useClasses({ 
    category: activeCategory === "all" ? undefined : activeCategory,
    q: searchQuery || undefined
  });
  
  const visibleCategories = isExpanded ? ALL_CATEGORIES : ALL_CATEGORIES.slice(0, 5);

  return (
    <MobileShell title="클래스 찾기">
      <div className="sticky top-[var(--header-height)] z-30 pt-4 pb-2 -mx-4 px-4 glass border-b">
        <div className="relative mb-3">
          <input 
            type="text" 
            placeholder="어떤 지식을 찾으시나요?" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-[46px] pl-10 pr-10 rounded-xl bg-muted border-none outline-none text-[14px] font-bold"
          />
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-subtle" />
          <button className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 bg-white rounded-lg shadow-sm">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
          </button>
        </div>
        
        {/* Category Grid (Foldable) */}
        <div className={cn(
          "grid grid-cols-5 gap-y-4 gap-x-2 px-1 transition-all duration-300 overflow-hidden",
          isExpanded ? "max-h-[200px] mb-2" : "max-h-[85px] mb-1"
        )}>
          {visibleCategories.map((cat) => (
            <button 
              key={cat.id} 
              onClick={() => setActiveCategory(cat.id)}
              className="flex flex-col items-center gap-1.5 active:scale-95 transition-all"
            >
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center transition-colors",
                activeCategory === cat.id ? "bg-primary text-white shadow-md shadow-primary/20" : "bg-muted"
              )}>
                {React.cloneElement(cat.icon as React.ReactElement, { 
                  className: cn("w-4.5 h-4.5", activeCategory === cat.id ? "text-white" : "") 
                })}
              </div>
              <span className={cn(
                "text-[9px] font-black text-center whitespace-nowrap overflow-hidden text-ellipsis w-full",
                activeCategory === cat.id ? "text-primary" : "text-subtle/60"
              )}>
                {cat.label}
              </span>
            </button>
          ))}
        </div>
        
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full py-1 flex items-center justify-center gap-1 text-[11px] font-bold text-subtle/40 active:text-primary transition-colors border-t border-black/[0.03]"
        >
          <span>{isExpanded ? "접기" : "전체 카테고리"}</span>
          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between px-1">
        <span className="text-[12px] font-bold text-subtle">
          총 <span className="text-foreground">{classes.length}개</span>의 클래스
        </span>
        <select className="bg-transparent border-none text-[12px] font-bold outline-none cursor-pointer">
          <option>인기순</option>
          <option>최신순</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xxs:grid-cols-2 gap-3 mt-4 pb-10">
        {isLoading ? (
          <LoadingState />
        ) : (
          classes.map((cls) => (
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
    </MobileShell>
  );
}
