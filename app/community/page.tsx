"use client";

import React, { useState } from "react";
import MobileShell from "@/components/mobile/MobileShell";
import AppCard from "@/components/ui/AppCard";
import { cn } from "@/lib/utils";
import { useCommunity } from "@/hooks/use-community";
import { Send, ChevronRight, MessageSquare, Users, Info } from "lucide-react";

export default function CommunityPage() {
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const { messages, isLoading, sendMessage } = useCommunity(selectedChannel || "general");
  const [inputText, setInputText] = useState("");

  const CHANNELS = [
    { id: "general", label: "자유게시판", description: "일상부터 정보 공유까지 자유롭게", icon: <MessageSquare className="w-5 h-5 text-blue-500" />, members: 1250 },
    { id: "study", label: "스터디 모집", description: "함께 공부할 팀원을 찾아보세요", icon: <Users className="w-5 h-5 text-purple-500" />, members: 840 },
    { id: "qna", label: "Q&A 질문답변", description: "모르는 것은 무엇이든 물어보세요", icon: <Info className="w-5 h-5 text-orange-500" />, members: 2100 },
  ];

  if (!selectedChannel) {
    return (
      <MobileShell title="커뮤니티">
        <div className="mt-4 space-y-3">
          <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 mb-6">
            <h3 className="text-[14px] font-black text-primary mb-1">Community Guide</h3>
            <p className="text-[12px] text-subtle font-medium leading-relaxed">
              B-Square 커뮤니티는 수강생 간의 지식 공유와<br />성장을 돕는 공간입니다. 매너를 지켜주세요!
            </p>
          </div>

          {CHANNELS.map((ch) => (
            <button 
              key={ch.id} 
              onClick={() => setSelectedChannel(ch.id)}
              className="w-full text-left active:scale-[0.98] transition-all"
            >
              <AppCard className="flex items-center gap-4 p-4 border-none bg-muted/30 shadow-none">
                <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center shadow-sm">
                  {ch.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="text-[15px] font-bold">{ch.label}</h3>
                    <span className="text-[10px] font-bold text-subtle/50">{ch.members}명</span>
                  </div>
                  <p className="text-[12px] text-subtle truncate">{ch.description}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-subtle/30" />
              </AppCard>
            </button>
          ))}
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell 
      title={CHANNELS.find(c => c.id === selectedChannel)?.label || "채팅"} 
      showTabbar={false}
    >
      <div className="flex flex-col h-[calc(100vh-var(--header-height)-var(--safe-top)-var(--safe-bottom))] -mx-4">
        <div className="p-3 border-b bg-white flex items-center justify-between">
          <button 
            onClick={() => setSelectedChannel(null)}
            className="text-[13px] font-bold text-subtle hover:text-primary transition-colors flex items-center gap-1"
          >
            &lt; 목록으로
          </button>
          <div className="text-[11px] font-bold text-primary px-2 py-0.5 bg-primary/10 rounded-full">
            LIVE 🟢 12명 접속중
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar bg-muted/20">
          <div className="text-center py-4">
            <span className="text-[11px] font-bold text-subtle/50 px-3 py-1 bg-black/5 rounded-full uppercase tracking-widest">
              Today
            </span>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center items-center h-20">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.sender === "me" ? "items-end" : "items-start"}`}>
                {msg.sender !== "me" && (
                  <span className="text-[11px] font-black text-subtle/60 ml-1 mb-1">{msg.senderName}</span>
                )}
                <div className={cn(
                  "max-w-[80%] px-4 py-2.5 rounded-2xl text-[14px] font-medium leading-relaxed shadow-sm",
                  msg.sender === "me" 
                    ? "bg-primary text-white rounded-tr-none" 
                    : "bg-white text-foreground rounded-tl-none border border-black/5"
                )}>
                  {msg.text}
                </div>
                <span className="text-[10px] text-subtle/40 mt-1 px-1">{msg.time}</span>
              </div>
            ))
          )}
        </div>

        <div className="p-4 bg-white border-t safe-padding">
          <div className="flex items-center gap-2 bg-muted/50 rounded-full px-4 py-1.5 border border-black/5 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all">
            <input 
              type="text" 
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inputText && (sendMessage(inputText), setInputText(""))}
              placeholder="메시지를 입력하세요..." 
              className="flex-1 bg-transparent border-none outline-none text-[14px] py-1.5"
            />
            <button 
              onClick={() => inputText && (sendMessage(inputText), setInputText(""))}
              className="p-2 bg-primary text-white rounded-full active:scale-90 transition-all shadow-md shadow-primary/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
