import React, { useState } from "react";
import MobileHeader from "./MobileHeader";
import BottomTabBar from "./BottomTabBar";
import { cn } from "@/lib/utils";
import MobileMenu from "./MobileMenu";

interface MobileShellProps {
  children: React.ReactNode;
  title?: string;
  showHeader?: boolean;
  showTabbar?: boolean;
}

const MobileShell: React.FC<MobileShellProps> = ({
  children,
  title,
  showHeader = true,
  showTabbar = true
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background relative max-w-[768px] mx-auto overflow-hidden">
      {showHeader && <MobileHeader title={title} onMenuClick={() => setIsMenuOpen(true)} />}

      <MobileMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />

      <main className={`px-4 pb-24 ${showHeader ? "pt-[var(--header-height)]" : "pt-0"} w-full`}>
        {children}
      </main>

      {showTabbar && <BottomTabBar />}
    </div>
  );
};

export default MobileShell;
