import React from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ 
  title, 
  description, 
  icon = <Inbox className="w-12 h-12 text-muted-foreground/30" /> 
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center animate-in fade-in zoom-in duration-500">
      <div className="mb-4 p-4 bg-muted rounded-full">
        {icon}
      </div>
      <h3 className="text-[17px] font-bold text-foreground mb-1">{title}</h3>
      {description && <p className="text-[14px] text-subtle leading-relaxed">{description}</p>}
    </div>
  );
};

export default EmptyState;
