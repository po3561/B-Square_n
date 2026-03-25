"use client";

import React from "react";
import { X, User, Settings, CreditCard, Users, BookOpen, Crown, ChevronRight, LogOut, Zap, Sparkles, TrendingUp, HelpCircle, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { label: "직무·실무", icon: <Zap className="w-4 h-4 text-orange-500" />, href: "/classes?cat=job" },
  { label: "디자인", icon: <Sparkles className="w-4 h-4 text-purple-500" />, href: "/classes?cat=design" },
  { label: "개발", icon: <TrendingUp className="w-4 h-4 text-blue-500" />, href: "/classes?cat=dev" },
  { label: "외국어", icon: <Crown className="w-4 h-4 text-yellow-500" />, href: "/classes?cat=lang" },
];

const MobileMenu: React.FC<MobileMenuProps> = ({ isOpen, onClose }) => {
  const { user, logout } = useAuth();

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside 
        className={cn(
          "fixed top-0 left-0 bottom-0 w-[280px] bg-white z-[101] shadow-2xl transition-transform duration-300 ease-out flex flex-col pt-[var(--safe-top)]",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-[18px] font-black italic tracking-tighter text-primary">B-Square</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* User Profile */}
          <div className="p-5 border-b">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-[20px]">
                  👤
                </div>
                <div>
                  <p className="text-[15px] font-bold">{user.name} 님</p>
                  <Link href="/mypage" onClick={onClose} className="text-[12px] text-primary font-bold hover:underline">마이페이지 관리 &gt;</Link>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[14px] font-medium text-subtle mb-3">더 많은 혜택을 누려보세요!</p>
                <Link 
                  href="/login" 
                  onClick={onClose}
                  className="inline-block px-4 py-2 bg-primary text-white text-[13px] font-bold rounded-xl active:scale-95 transition-all"
                >
                  로그인 / 회원가입
                </Link>
              </div>
            )}
          </div>

          {/* Quick Menu */}
          <div className="p-5 border-b">
            <h3 className="text-[12px] font-black text-subtle/50 uppercase tracking-widest mb-4">Quick Browse</h3>
            <div className="grid grid-cols-1 gap-2">
              {CATEGORIES.map((cat, i) => (
                <Link 
                  key={i} 
                  href={cat.href}
                  onClick={onClose}
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-muted transition-colors active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-white shadow-sm rounded-lg">
                      {cat.icon}
                    </div>
                    <span className="text-[14px] font-bold">{cat.label}</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-subtle/30" />
                </Link>
              ))}
            </div>
          </div>

          {/* Service Menu */}
          <div className="p-5">
            <h3 className="text-[12px] font-black text-subtle/50 uppercase tracking-widest mb-4">Service</h3>
            <div className="space-y-1">
              {[
                { label: "알림함", icon: <Bell className="w-5 h-5 text-subtle" />, href: "/notice" },
                { label: "내 학습실", icon: <BookOpen className="w-5 h-5 text-subtle" />, href: "/mypage" },
                { label: "1:1 문의", icon: <HelpCircle className="w-5 h-5 text-subtle" />, href: "/contact" },
                { label: "설정", icon: <Settings className="w-5 h-5 text-subtle" />, href: "/mypage" },
              ].map((item, i) => (
                <Link 
                  key={i} 
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors"
                >
                  {item.icon}
                  <span className="text-[14px] font-bold">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        {user && (
          <div className="p-5 border-t">
            <button 
              onClick={() => { logout(); onClose(); }}
              className="flex items-center gap-2 text-subtle text-[13px] font-bold hover:text-rose-500 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        )}
      </aside>
    </>
  );
};

export default MobileMenu;
