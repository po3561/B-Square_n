import React from "react";
import { Loader2 } from "lucide-react";

const LoadingState: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
      <p className="text-[14px] font-medium text-subtle tracking-tight">잠시만 기다려주세요...</p>
    </div>
  );
};

export default LoadingState;
