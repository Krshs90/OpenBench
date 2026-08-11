import { ReactNode } from "react";

interface SectionHeaderProps {
  icon: ReactNode;
  title: string;
}

export function SectionHeader({ icon, title }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 pb-4">
      {icon}
      <h2 className="text-lg text-white font-medium">{title}</h2>
    </div>
  );
}
