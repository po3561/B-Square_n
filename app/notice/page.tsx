"use client";

import React from "react";
import MobileShell from "@/components/mobile/MobileShell";
import SectionHeader from "@/components/ui/SectionHeader";
import AppCard from "@/components/ui/AppCard";
import Chip from "@/components/ui/Chip";
import LoadingState from "@/components/ui/LoadingState";
import { useNotices } from "@/hooks/use-support";
import { ChevronRight, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NoticePage() {
  const { notices, isLoading } = useNotices();
  const DUMMY_NOTICES = [
    { id: 1, type: "공지", title: "[중요] B-Square 정기 점검 안내 (04/01)", date: "2024.03.25", important: true },
    { id: 2, type: "업데이트", title: "모바일 앱 신규 기능 업데이트 소식 (v2.1.0)", date: "2024.03.24", important: false },
    { id: 3, type: "이벤트", title: "친구 초대하면 무제한 패스 10% 쿠폰 증정!", date: "2024.03.23", important: false },
    { id: 4, type: "공지", title: "개인정보 처리방침 개정 안내", date: "2024.03.20", important: false },
  ];

  return (
    <MobileShell title="공지사항">
      <SectionHeader title="새소식" className="mt-4" />
      
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
        {["전체", "공지", "업데이트", "이벤트", "안내"].map((label, i) => (
          <Chip key={i} label={label} active={i === 0} />
        ))}
      </div>

      <div className="space-y-2 pb-20">
        {isLoading ? (
          <LoadingState />
        ) : (
          DUMMY_NOTICES.map((notice) => (
            <AppCard 
              key={notice.id} 
              className={cn(
                "p-4 flex items-start justify-between border-none shadow-none bg-muted/20 active:bg-muted transition-colors rounded-2xl",
                notice.important && "bg-primary/5 border border-primary/10"
              )}
            >
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-1.5 mb-1.5">
                  {notice.important && (
                    <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded uppercase">URGENT</span>
                  )}
                  <span className="text-[10px] font-black text-primary/80 uppercase tracking-tight">{notice.type}</span>
                </div>
                <h4 className="text-[14px] font-bold leading-snug mb-2 line-clamp-2">
                  {notice.title}
                </h4>
                <div className="flex items-center gap-1 text-[11px] font-bold text-subtle/40">
                  <Calendar className="w-3 h-3" />
                  <span>{notice.date}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-subtle/20 mt-1" />
            </AppCard>
          ))
        )}
      </div>
    </MobileShell>
  );
}
