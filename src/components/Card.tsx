import { ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CardProps {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  glow?: boolean;
  role?: string;
  "aria-label"?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ children, className, innerClassName, role, "aria-label": ariaLabel, onClick, hoverable }: CardProps) {
  return (
    <div 
      className={cn(
        "glass-panel", 
        hoverable && "hover:border-brand-500/50 hover:shadow-[0_0_20px_rgba(56,189,248,0.15)] transition-all cursor-pointer group",
        className
      )} 
      role={role} 
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <div className={cn("h-full w-full bg-[var(--color-surface)] p-5 rounded-[11px]", innerClassName)}>
        {children}
      </div>
    </div>
  );
}

