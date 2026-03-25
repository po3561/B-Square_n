"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/lib/routes";
import { cn } from "@/lib/utils";
import * as LucideIcons from "lucide-react";

const BottomTabBar: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass h-[var(--tabbar-height)] pb-[var(--safe-bottom)] flex items-center justify-around px-2 max-w-[768px] mx-auto border-t">
      {NAV_ITEMS.map((item) => {
        const Icon = (LucideIcons as any)[item.icon] || LucideIcons.HelpCircle;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 w-full h-[60px] transition-all duration-300",
              isActive ? "text-primary scale-105" : "text-subtle"
            )}
          >
            <div className={cn(
              "p-1.5 rounded-xl transition-colors",
              isActive ? "bg-primary/10" : "bg-transparent"
            )}>
              <Icon className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-black tracking-tighter uppercase">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomTabBar;
