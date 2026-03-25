import React from "react";
import { cn } from "@/lib/utils";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children, title, description, className }) => {
  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[80vh] px-4", className)}>
      <div className="w-full max-w-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-10">
          <h1 className="text-[32px] font-black tracking-tight mb-3">{title}</h1>
          {description && <p className="text-[15px] text-subtle font-medium leading-relaxed">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
};

export default AuthLayout;
