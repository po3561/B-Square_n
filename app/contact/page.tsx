"use client";

import React, { useState } from "react";
import MobileShell from "@/components/mobile/MobileShell";
import SectionHeader from "@/components/ui/SectionHeader";
import AppCard from "@/components/ui/AppCard";
import { useInquiry } from "@/hooks/use-support";
import { MessageCircle, Mail, Phone, Clock, Send, Loader2, ChevronRight } from "lucide-react";

export default function ContactPage() {
  const { sendInquiry, isSubmitting } = useInquiry();
  const [formData, setFormData] = useState({
    type: "수강 및 환불 문의",
    email: "",
    content: "",
  });

  const handleSubmit = async () => {
    if (!formData.email || !formData.content) {
      alert("모든 필드를 입력해주세요.");
      return;
    }
    const res = await sendInquiry(formData);
    if (res.success) {
      alert(res.message);
      setFormData({ type: "수강 및 환불 문의", email: "", content: "" });
    }
  };

  return (
    <MobileShell title="고객센터">
      <SectionHeader title="문의하기" className="mt-4" />
      
      <div className="grid grid-cols-2 gap-3 mb-8">
        {[
          { icon: <MessageCircle className="w-5 h-5 text-blue-500" />, title: "채널톡", desc: "1:1 실시간 대응" },
          { icon: <Phone className="w-5 h-5 text-emerald-500" />, title: "전화연결", desc: "1588-XXXX" },
        ].map((item, i) => (
          <div key={i} className="bg-muted/30 p-4 rounded-2xl flex flex-col gap-3 active:scale-95 transition-all">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
              {item.icon}
            </div>
            <div>
              <h4 className="text-[14px] font-bold">{item.title}</h4>
              <p className="text-[11px] text-subtle font-medium">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <SectionHeader title="문의 메일 작성" />
      <div className="space-y-4 pb-20 mt-2">
        <div className="space-y-1.5">
          <label className="text-[11px] font-black text-subtle/50 ml-1 uppercase tracking-widest">문의 유형</label>
          <div className="relative">
            <select 
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full h-[52px] px-4 rounded-xl bg-muted/40 border-none outline-none text-[14px] font-bold appearance-none cursor-pointer focus:bg-muted transition-colors"
            >
              <option>수강 및 환불 문의</option>
              <option>기업 교육 문의</option>
              <option>기타 제휴 문의</option>
            </select>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-subtle/30 rotate-90" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-black text-subtle/50 ml-1 uppercase tracking-widest">이메일 주소</label>
          <input 
            type="email" 
            placeholder="답변 받으실 이메일" 
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full h-[52px] px-4 rounded-xl bg-muted/40 border-none outline-none text-[14px] font-bold focus:bg-muted transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-black text-subtle/50 ml-1 uppercase tracking-widest">문의 내용</label>
          <textarea 
            placeholder="상세한 내용을 입력해주세요" 
            value={formData.content}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            className="w-full h-[150px] p-4 rounded-xl bg-muted/40 border-none outline-none text-[14px] font-medium resize-none leading-relaxed focus:bg-muted transition-colors"
          />
        </div>

        <button 
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full h-[56px] bg-primary text-white rounded-xl font-bold text-[15px] mt-4 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-primary/20"
        >
          {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4" />}
          {isSubmitting ? "전송 중" : "문의 제출하기"}
        </button>
      </div>
    </MobileShell>
  );
}
