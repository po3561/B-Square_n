import React from "react";
import { Search, Bell, Menu } from "lucide-react";

interface MobileHeaderProps {
  title?: string;
  onMenuClick?: () => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ title = "B-Square", onMenuClick }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass h-[var(--header-height)] flex items-center justify-between px-4 pt-[var(--safe-top)] max-w-[768px] mx-auto border-b">
      <div className="flex items-center gap-1 min-w-0">
        <button 
          onClick={onMenuClick}
          className="p-1.5 -ml-1 hover:bg-black/5 rounded-full transition-colors active:scale-95 flex-shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-[15px] xs:text-[17px] font-bold tracking-tight truncate">{title}</h1>
      </div>
      
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <button className="p-1.5 hover:bg-black/5 rounded-full transition-colors active:scale-95">
          <Search className="w-5 h-5 text-subtle" />
        </button>
        <button className="p-1.5 hover:bg-black/5 rounded-full transition-colors active:scale-95 relative">
          <Bell className="w-5 h-5 text-subtle" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-primary rounded-full border border-white" />
        </button>
      </div>
    </header>
  );
};

export default MobileHeader;
