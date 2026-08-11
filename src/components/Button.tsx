import React, { ReactNode } from "react";
import { cn } from "./Card";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ 
  children, 
  icon, 
  variant = "primary", 
  className,
  ...props 
}: ButtonProps) {
  
  const baseStyles = "inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-white text-black hover:bg-neutral-200 shadow-sm",
    secondary: "bg-white/5 text-white border border-white/10 hover:bg-white/10",
    ghost: "text-neutral-400 hover:text-white hover:bg-white/5",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:text-red-300",
  };

  return (
    <button
      className={cn(baseStyles, variants[variant], className)}
      {...(props as any)}
    >
      {icon && (
        <div className="w-4 h-4 flex items-center justify-center">
          {icon}
        </div>
      )}
      <span>{children}</span>
    </button>
  );
}
