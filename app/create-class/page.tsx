"use client";

import React, { useState } from "react";
import MobileShell from "@/components/mobile/MobileShell";
import SectionHeader from "@/components/ui/SectionHeader";
import AppCard from "@/components/ui/AppCard";
import { cn } from "@/lib/utils";
import { Check, ClipboardList, ImageIcon, Video, UserCheck, CheckCircle2 } from "lucide-react";

const STEPS = [
  { id: 1, label: "기본 정보", icon: <ClipboardList className="w-4 h-4" /> },
  { id: 2, label: "미디어", icon: <ImageIcon className="w-4 h-4" /> },
  { id: 3, label: "커리큘럼", icon: <Video className="w-4 h-4" /> },
  { id: 4, label: "강사 인증", icon: <UserCheck className="w-4 h-4" /> },
];

export default function CreateClassPage() {
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <MobileShell title="클래스 개설">
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-10 pt-4 px-1">
        {STEPS.map((step, i) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2">
              <div className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500",
                currentStep >= step.id ? "bg-primary text-white scale-110 shadow-lg shadow-primary/20" : "bg-muted text-subtle"
              )}>
                {currentStep > step.id ? <CheckCircle2 className="w-5 h-5" /> : step.icon}
              </div>
              <span className={cn(
                "text-[10px] font-black tracking-tighter whitespace-nowrap transition-colors",
                currentStep >= step.id ? "text-primary" : "text-subtle"
              )}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "h-[2px] w-full flex-1 transition-colors duration-500",
                currentStep > step.id ? "bg-primary" : "bg-muted"
              )} />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="animate-in fade-in slide-in-from-right-4 duration-500">
        {currentStep === 1 && (
          <div className="space-y-6 pb-20">
            <SectionHeader title="기본 정보를 입력해주세요" className="mt-0" />
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[13px] font-black text-subtle ml-1">클래스 제목</label>
                <input 
                  type="text" 
                  placeholder="예) 기획부터 피그마 실전까지" 
                  className="w-full h-[58px] px-5 rounded-[20px] bg-muted border-none outline-none text-[16px] font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-black text-subtle ml-1">카테고리 선택</label>
                <div className="grid grid-cols-2 gap-3">
                  {["디자인", "개발", "비즈니스", "기타"].map((cat) => (
                    <button key={cat} className="h-[52px] rounded-[18px] bg-muted text-[14px] font-bold active:bg-primary active:text-white transition-all">
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[13px] font-black text-subtle ml-1">클래스 한 공간 소개</label>
                <textarea 
                  placeholder="수강생들을 끌어당길 수 있는 매력적인 한 줄을 입력하세요" 
                  className="w-full h-[120px] p-5 rounded-[20px] bg-muted border-none outline-none text-[15px] font-medium resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="fixed bottom-[var(--tabbar-height)] left-0 right-0 z-50 px-5 pb-[calc(var(--safe-bottom)+20px)] pt-4 glass border-t max-w-[768px] mx-auto flex gap-3">
          {currentStep > 1 && (
            <button 
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="flex-1 h-[58px] rounded-[20px] border border-black/10 font-bold text-foreground active:bg-muted transition-all"
            >
              이전
            </button>
          )}
          <button 
            onClick={() => currentStep < 4 && setCurrentStep(prev => prev + 1)}
            className="flex-[2] h-[58px] bg-primary text-white rounded-[20px] font-bold text-[17px] active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
          >
            {currentStep === 4 ? "개설 신청하기" : "다음 단계로"}
          </button>
        </div>
      </div>
    </MobileShell>
  );
}
