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
}

export function Card({ children, className, innerClassName, role, "aria-label": ariaLabel }: CardProps) {
  return (
    <div className={cn("glass-panel", className)} role={role} aria-label={ariaLabel}>
      <div className={cn("h-full w-full bg-[var(--color-surface)] p-5 rounded-[11px]", innerClassName)}>
        {children}
      </div>
    </div>
  );
}

