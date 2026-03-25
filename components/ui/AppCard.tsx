import React from "react";
import { cn } from "@/lib/utils";

interface AppCardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  padding?: boolean;
}

const AppCard: React.FC<AppCardProps> = ({
  children,
  className,
  onClick,
  hover = true,
  padding = true,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-[20px] shadow-soft border border-black/5 overflow-hidden transition-all active:scale-[0.98]",
        hover && "hover:shadow-premium",
        padding && "p-3",
        className
      )}
    >
      {children}
    </div>
  );
};

export default AppCard;
