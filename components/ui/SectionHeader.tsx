import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div className={cn("flex items-center justify-between mb-3 mt-4 px-1", className)}>
      <h2 className="text-[18px] font-bold tracking-tight text-foreground">{title}</h2>
      {actionLabel && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-[13px] font-semibold text-primary active:opacity-60 transition-opacity"
        >
          {actionLabel}
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default SectionHeader;
