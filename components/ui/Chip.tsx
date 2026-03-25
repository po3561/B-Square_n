import React from "react";
import { cn } from "@/lib/utils";

interface ChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const Chip: React.FC<ChipProps> = ({ label, active = false, onClick, className }) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 rounded-full text-[13px] font-semibold transition-all active:scale-95 whitespace-nowrap",
        active
          ? "bg-primary text-white shadow-md shadow-primary/20"
          : "bg-muted text-subtle hover:bg-black/5",
        className
      )}
    >
      {label}
    </button>
  );
};

export default Chip;
