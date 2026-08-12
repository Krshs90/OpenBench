import { useState, useEffect } from "react";
import { Card, cn } from "../components/Card";
import { Button } from "../components/Button";
import { Play, Cpu, HardDrive, Trash, Medal, ChartLineUp, Spinner } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useBenchmark } from "../context/BenchmarkContext";
import { INTELLIGENCE_TESTS } from "./Benchmark";

interface SystemInfo {
  cpu_name: string;
  ram_gb: number;
  gpus: string[];
  vram_gb: number;
}

interface LiveTelemetry {
  cpu_usage: number;
  ram_usage_gb: number;
  gpu_temp_c: number;
  vram_usage_gb: number;
}

interface SavedResult {
  id: string;
  model: string;
  hardware: string;
  speed: number;
  vram: number;
  temp: number;
  score: number;
  timestamp: number;
  workload: string;
}

export function Home() {
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [liveData, setLiveData] = useState<LiveTelemetry | null>(null);
  const [results, setResults] = useState<SavedResult[]>([]);
  const { status } = useBenchmark();

  useEffect(() => {
    invoke<SystemInfo>("get_system_info").then(setSysInfo).catch(console.error);
    loadResults();

    const interval = setInterval(() => {
      invoke<LiveTelemetry>("get_live_telemetry").then(setLiveData).catch(console.error);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadResults = () => {
    invoke<SavedResult[]>("get_saved_results").then(setResults).catch(console.error);
  };

  const deleteResult = async (id: string) => {
    try {
      await invoke("delete_result", { id });
      loadResults();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto flex flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl md:text-5xl tracking-tight leading-none text-white font-medium">
          Benchmark Your Machine
        </h1>
        <p className="text-neutral-400 text-sm max-w-[65ch] mt-2">
          Test local AI models on your hardware. Get reproducible, accurate performance reports instantly.
        </p>
      </header>
      
      {sysInfo && (
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-neutral-500 bg-white/5 border border-white/10 p-3 rounded-lg w-max shadow-sm">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              <span>{sysInfo.cpu_name}</span>
            </div>
            <div className="w-px h-3 bg-white/10 hidden md:block" />
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4" />
              <span>{sysInfo.ram_gb.toFixed(0)} GB RAM</span>
            </div>
            {sysInfo.gpus && sysInfo.gpus.length > 0 && (
              <>
                <div className="w-px h-3 bg-white/10 hidden md:block" />
                <div className="flex items-center gap-2 text-brand-500">
                  <Cpu className="w-4 h-4" />
                  <span>{sysInfo.gpus[0]}</span>
                </div>
                <div className="w-px h-3 bg-white/10 hidden md:block" />
                <div className="flex items-center gap-2 text-brand-500">
                  <HardDrive className="w-4 h-4" />
                  <span>{sysInfo.vram_gb.toFixed(0)} GB VRAM</span>
                </div>
              </>
            )}
          </div>
          
        </div>
      )}
      
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="col-span-1 md:col-span-2 relative overflow-hidden">
          <div className="flex flex-col h-full justify-between items-start z-10 relative gap-8">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl text-white font-medium tracking-tight">Run Full Suite</h2>
              <p className="text-neutral-400 text-sm max-w-[45ch]">Execute parallel benchmarks across multiple models with live streaming telemetry.</p>
            </div>
            
            <Link to="/benchmark" className="outline-none">
              <Button 
                icon={status === "running" ? <Spinner className="animate-spin w-4 h-4" /> : <Play weight="fill" />} 
                variant={status === "running" ? "secondary" : "primary"}
              >
                {status === "running" ? "Benchmark Running..." : "Start Benchmark"}
              </Button>
            </Link>
          </div>
        </Card>
        
        <Card innerClassName="flex flex-col justify-between h-full p-6 relative overflow-hidden">
          <h3 className="text-sm text-white font-medium tracking-tight mb-6">
            System Monitor
          </h3>
          
          {liveData ? (
            <div className="grid grid-cols-2 gap-y-6 gap-x-4 w-full">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-neutral-500 font-semibold tracking-widest uppercase">RAM</span>
                <span className="text-xl text-white font-mono">{liveData.ram_usage_gb.toFixed(1)}<span className="text-[10px] text-neutral-500 ml-1">GB</span></span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-neutral-500 font-semibold tracking-widest uppercase">VRAM</span>
                <span className="text-xl text-brand-400 font-mono">{liveData.vram_usage_gb.toFixed(1)}<span className="text-[10px] text-brand-500/50 ml-1">GB</span></span>
              </div>
              <div className="flex flex-col gap-1.5 col-span-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-500 font-semibold tracking-widest uppercase">GPU Temp</span>
                  <span className={cn("text-xs font-mono", liveData.gpu_temp_c > 80 ? "text-red-400" : "text-neutral-400")}>
                    {liveData.gpu_temp_c.toFixed(0)}°C
                  </span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                  <div 
                    className={cn("h-full rounded-full transition-transform duration-500 ease-out w-full origin-left", liveData.gpu_temp_c > 80 ? "bg-red-500" : "bg-brand-500")}
                    style={{ transform: `scaleX(${Math.min(liveData.gpu_temp_c / 100, 1)})` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-neutral-500 font-mono py-8">Waiting for data...</div>
          )}
        </Card>
      </section>
      
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg tracking-tight text-white font-medium">Local Rankings</h2>
          <span className="text-xs text-neutral-500 font-mono">{results.length} runs saved</span>
        </div>
        
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center bg-white/5 border border-white/10 rounded-xl">
            <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-1">
              <ChartLineUp className="w-7 h-7 text-neutral-500" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium text-white">No benchmarks yet</h3>
              <p className="text-xs text-neutral-500 max-w-[28ch]">Run a benchmark to see your local models ranked by performance.</p>
            </div>
            <Link to="/benchmark" className="outline-none">
              <Button variant="secondary" icon={<Play weight="fill" />}>Run First Benchmark</Button>
            </Link>
          </div>
        ) : (
          <div className="w-full bg-white/5 border border-white/10 rounded-xl overflow-x-auto pb-2">
            <table className="w-full text-left text-sm text-neutral-400 min-w-max" aria-label="Local benchmark rankings">
              <thead className="bg-white/5 text-xs  text-neutral-500 font-medium">
                <tr>
                  <th className="px-6 py-4 font-medium">Rank</th>
                  <th className="px-6 py-4 font-medium">Model</th>
                  <th className="px-6 py-4 font-medium">Workload</th>
                  <th className="px-6 py-4 font-medium text-right">Score</th>
                  <th className="px-6 py-4 font-medium text-right">Speed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {results.map((r, i) => (
                  <tr key={r.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      {i === 0 && <Medal className="w-5 h-5 text-yellow-500" weight="fill" />}
                      {i === 1 && <Medal className="w-5 h-5 text-neutral-400" weight="fill" />}
                      {i === 2 && <Medal className="w-5 h-5 text-amber-700" weight="fill" />}
                      {i > 2 && <span className="text-neutral-600 font-mono pl-1">{i + 1}</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-neutral-200">{r.model}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono"><span className="px-2 py-0.5 bg-white/5 rounded">{(r as any).difficulty || r.workload || "Standard"}</span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono text-white">
                      {r.score}
                      {INTELLIGENCE_TESTS.includes(r.benchmark_type || "") ? <span className="text-neutral-500 text-xs">/5</span> : ""}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right font-mono">{(r.speed ?? 0).toFixed(1)} <span className="text-[10px] text-neutral-600">t/s</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
