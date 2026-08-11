import React from "react";
import { SavedResult } from "../types";
import { Cpu, Thermometer, Database } from "@phosphor-icons/react";

export const Scorecard = React.forwardRef<HTMLDivElement, { result: SavedResult }>(({ result }, ref) => {
  return (
    <div 
      ref={ref} 
      className="w-[800px] h-[450px] relative overflow-hidden bg-neutral-950 flex flex-col justify-between p-12 select-none"
      style={{
        backgroundImage: "radial-gradient(circle at 100% 100%, rgba(56, 189, 248, 0.15), transparent 50%), radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.15), transparent 50%)",
        fontFamily: "'Inter', sans-serif"
      }}
    >
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.03]" 
           style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "32px 32px" }} />

      {/* Header */}
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex flex-col">
          <span className="text-brand-400 font-bold tracking-widest text-sm uppercase mb-2">Performance Benchmark</span>
          <h1 className="text-5xl font-bold text-white tracking-tight">{result.model}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-neutral-300 text-sm font-medium backdrop-blur-md">
              {result.hardware}
            </span>
            <span className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-neutral-300 text-sm font-medium backdrop-blur-md">
              {result.workload || "Standard"} Workload
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-3xl font-light text-white/50 tracking-tight">
            <span className="text-brand-500 font-bold">Open</span>Bench
          </span>
        </div>
      </div>

      {/* Main Stats */}
      <div className="relative z-10 flex gap-6 mt-auto">
        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent opacity-50" />
          <span className="text-neutral-400 text-sm font-medium mb-1">Inference Speed</span>
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-bold text-white tracking-tighter shadow-brand-500/50 drop-shadow-lg">
              {result.speed.toFixed(1)}
            </span>
            <span className="text-xl text-brand-400 font-medium">tokens/s</span>
          </div>
        </div>

        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md flex flex-col justify-center">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-neutral-400 text-sm font-medium">
              {result.benchmark_type === "Intelligence (LLM-as-a-Judge)" 
                ? "Intelligence Score" 
                : "Hardware Efficiency Rating"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-white tracking-tighter">
              {result.score}
            </span>
            {result.benchmark_type === "Intelligence (LLM-as-a-Judge)" && (
              <span className="text-lg text-neutral-500 font-medium">/ 5</span>
            )}
          </div>
        </div>
      </div>

      {/* Footer Metrics */}
      <div className="relative z-10 mt-8 pt-6 border-t border-white/10 flex items-center justify-between text-neutral-400">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-neutral-500" />
            <span className="text-sm font-mono">{result.vram.toFixed(1)} GB VRAM</span>
          </div>
          <div className="flex items-center gap-2">
            <Thermometer className="w-5 h-5 text-neutral-500" />
            <span className="text-sm font-mono">{result.temp.toFixed(1)}°C</span>
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-neutral-500" />
            <span className="text-sm font-mono">{(result.speed * 60).toFixed(0)} t/m</span>
          </div>
        </div>
        <div className="text-xs font-medium text-neutral-600">
          Generated on {new Date(result.timestamp * 1000).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
});

Scorecard.displayName = "Scorecard";
