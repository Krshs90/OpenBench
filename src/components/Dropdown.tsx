import { useState, useRef, useEffect } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "./Card";

export interface DropdownOption {
  value: string;
  label: string;
  description?: string;
}

interface DropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Dropdown({ value, onChange, options, placeholder = "Select...", className, disabled }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className={cn("relative w-full", className)} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full bg-white/5 border text-left rounded-lg p-3 text-sm transition-colors flex items-center justify-between outline-none disabled:opacity-50 disabled:cursor-not-allowed",
          isOpen ? "border-white/30 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]" : "border-white/10 text-neutral-200 hover:border-white/20"
        )}
      >
        <span className={cn("block truncate", !selectedOption && "text-neutral-500")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <CaretDown className={cn("w-4 h-4 transition-transform duration-200 text-neutral-400 flex-shrink-0", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[#111111] border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="max-h-60 overflow-y-auto p-1.5 flex flex-col gap-0.5">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-center justify-between group outline-none",
                  value === option.value ? "bg-brand-500/10 text-brand-400" : "text-neutral-300 hover:bg-white/10 hover:text-white focus:bg-white/10"
                )}
              >
                <div className="flex flex-col gap-0.5 min-w-0 pr-3">
                  <span className="truncate">{option.label}</span>
                  {option.description && (
                    <span className="text-[10px] text-neutral-500 truncate group-hover:text-neutral-400 transition-colors">
                      {option.description}
                    </span>
                  )}
                </div>
                {value === option.value && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
