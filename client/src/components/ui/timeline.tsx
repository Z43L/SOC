import React, { ReactNode } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TimelineProps {
  children: ReactNode;
  className?: string;
}

export function Timeline({ children, className }: TimelineProps) {
  return (
    <div className={cn("space-y-8", className)}>
      {children}
    </div>
  );
}

interface TimelineItemProps {
  icon: ReactNode;
  iconColor?: string;
  title: string;
  time: string | Date | null;
  children?: ReactNode;
  current?: boolean;
}

export function TimelineItem({ 
  icon, 
  iconColor = "bg-blue-600", 
  title, 
  time, 
  children,
  current = false 
}: TimelineItemProps) {
  const formattedTime = time 
    ? typeof time === 'string' 
      ? format(new Date(time), "PPp")
      : format(time, "PPp")
    : null;
    
  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-0 bottom-0 -ml-px w-0.5 h-full bg-gray-800"></div>
      
      <div className="flex items-start mb-6">
        {/* Icon */}
        <div 
          className={cn(
            "z-10 flex h-8 w-8 items-center justify-center rounded-full text-white",
            iconColor,
            current && "ring-2 ring-offset-2 ring-offset-background ring-primary",
          )}
        >
          {icon}
        </div>
        
        {/* Content */}
        <div className="ml-4 min-w-0 flex-1">
          <div className="flex justify-between text-sm">
            <h3 className="font-medium text-text-primary">
              {title}
              {current && (
                <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                  Current
                </span>
              )}
            </h3>
            {formattedTime && (
              <p className="text-xs text-muted-foreground">{formattedTime}</p>
            )}
          </div>
          <div className="mt-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}