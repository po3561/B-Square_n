import React from "react";
import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  children: React.ReactNode;
  className?: string;
}

const StickyActionBar: React.FC<StickyActionBarProps> = ({ children, className }) => {
  return (
    <div className={cn(
      "fixed bottom-[var(--tabbar-height)] left-0 right-0 z-40 px-4 py-3 pb-[calc(var(--safe-bottom)+12px)] glass border-t max-w-[768px] mx-auto",
      className
    )}>
      {children}
    </div>
  );
};

export default StickyActionBar;
