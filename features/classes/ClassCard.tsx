import React from "react";
import AppCard from "@/components/ui/AppCard";
import Chip from "@/components/ui/Chip";
import { cn } from "@/lib/utils";
import { User, Star, Clock } from "lucide-react";

interface ClassCardProps {
  id: string;
  title: string;
  category: string;
  instructor: string;
  price: string;
  discount?: string;
  image_url?: string;
  rating?: number;
  enrolledCount?: number;
}

import Link from "next/link";

const ClassCard: React.FC<ClassCardProps> = ({
  id,
  title,
  category,
  instructor,
  price,
  discount,
  image_url,
  rating = 4.8,
  enrolledCount = 120,
}) => {
  return (
    <Link href={`/classes/${id}`} className="block h-full group active:scale-[0.98] transition-all">
      <AppCard padding={false} className="overflow-hidden flex flex-col h-full border-none shadow-sm hover:shadow-md transition-shadow">
        <div className="aspect-square bg-muted relative overflow-hidden">
          {image_url ? (
            <img src={image_url} alt={title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/10">
            <Star className="w-8 h-8 fill-current" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <span className="text-[9px] font-black bg-black/60 text-white px-1.5 py-0.5 rounded-md backdrop-blur-md uppercase tracking-tighter">
            {category}
          </span>
        </div>
      </div>
      <div className="p-2.5 flex flex-col flex-1 justify-between">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] font-black text-primary px-1.5 py-0.5 bg-primary/10 rounded-md">BEST</span>
            <span className="text-[10px] font-bold text-subtle truncate">{instructor}</span>
          </div>
          <h3 className="text-[13px] font-bold leading-[1.3] mb-2 line-clamp-2 min-h-[34px]">
            {title}
          </h3>
        </div>
        
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-subtle/60 mb-2">
            <div className="flex items-center gap-0.5">
              <Star className="w-2.5 h-2.5 text-yellow-400 fill-yellow-400" />
              <span>{rating}</span>
            </div>
            <span>•</span>
            <span>{enrolledCount}명</span>
          </div>
          
          <div className="flex items-center justify-between pt-2 border-t border-black/[0.03]">
            <div className="flex items-center gap-1">
              {discount && <span className="text-[13px] font-black text-rose-500">{discount}</span>}
              <span className="text-[13px] font-black">{price}</span>
            </div>
          </div>
        </div>
        </div>
      </AppCard>
    </Link>
  );
};

export default ClassCard;
