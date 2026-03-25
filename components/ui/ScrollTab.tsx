"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ScrollTabProps {
  items: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

const ScrollTab: React.FC<ScrollTabProps> = ({
  items,
  activeId,
  onChange,
  className,
}) => {
  return (
    <div className={cn("flex items-center gap-2 overflow-x-auto pb-4 no-scrollbar", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={cn(
            "px-5 py-2.5 rounded-2xl text-[15px] font-bold transition-all whitespace-nowrap",
            activeId === item.id
              ? "bg-foreground text-background scale-105 shadow-lg"
              : "bg-muted text-subtle"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default ScrollTab;
