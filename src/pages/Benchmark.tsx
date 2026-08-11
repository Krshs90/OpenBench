import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, cn } from "../components/Card";
import { Button } from "../components/Button";
import { Cpu, CaretDown, Warning, FilePlus } from "@phosphor-icons/react";
import { useBenchmark } from "../context/BenchmarkContext";
import { LocalModel } from "../types";
import { Dropdown } from "../components/Dropdown";

interface SystemInfo {
  gpus: string[];
  vram_gb: number;
  ram_gb: number;
}

const BENCHMARK_TYPES = ["Standard (Chat)", "Context (NIAH)", "Code Generation", "Latency (TTFT)", "Intelligence (LLM-as-a-Judge)"];
const DIFFICULTIES = ["Light", "Medium", "Heavy", "Stress"];

export function Benchmark() {
  const { 
    status, error, selectedModels, benchmarkType, difficulty, judgeModel, streams, intelligenceResults,
    datasetMode, customPrompts, results,
    setSelectedModels, setBenchmarkType, setDifficulty, setJudgeModel, setDatasetMode, setCustomPrompts, runBenchmark, resetBenchmark 
  } = useBenchmark();

  const [availableModels, setAvailableModels] = useState<LocalModel[]>([]);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    invoke<LocalModel[]>("get_local_models").then(setAvailableModels).catch(console.error);
    invoke<SystemInfo>("get_system_info").then(setSysInfo).catch(console.error);
  }, []);

  const toggleModel = (name: string) => {
    if (selectedModels.includes(name)) {
      setSelectedModels(selectedModels.filter(m => m !== name));
    } else {
      setSelectedModels([...selectedModels, name]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (file.name.endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed) && parsed.every(i => typeof i === "string")) {
            setCustomPrompts(parsed);
          } else {
            console.error("JSON must be a flat array of strings.");
            setCustomPrompts([]);
          }
        } else if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
          setCustomPrompts(lines);
        }
      } catch (err) {
        console.error("Failed to parse file", err);
        setCustomPrompts([]);
      }
    };
    reader.readAsText(file);
  };

  const getMemoryWarning = () => {
    if (!sysInfo) return null;
    let requiredVramPerModel = 4;
    if (difficulty === "Heavy") requiredVramPerModel = 8;
    if (difficulty === "Stress") requiredVramPerModel = 16;
    
    if (benchmarkType === "Context (NIAH)") requiredVramPerModel += 4;

    const totalRequired = requiredVramPerModel * selectedModels.length;
    
    if (totalRequired > sysInfo.vram_gb) {
      return (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 mt-6">
          <Warning className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1">
            <span className="font-medium text-sm">VRAM Capacity Warning</span>
            <span className="text-xs opacity-80 leading-relaxed">
              Running {selectedModels.length} models simultaneously at {difficulty} difficulty in {benchmarkType} mode may require ~{totalRequired}GB VRAM. Your system reports {sysInfo.vram_gb.toFixed(1)}GB. This may cause fallback to system RAM, severely impacting TPS.
            </span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-8 h-full">
      <header className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-medium text-white tracking-tight">Run Benchmark</h1>
          <p className="text-sm text-neutral-400 mt-1">Configure and deploy workload simulations.</p>
        </div>
      </header>

      {status === "idle" || status === "error" ? (
        <div className="grid gap-6">
          {status === "error" && (
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <div className="flex items-center gap-2 font-medium">
                <Warning className="w-5 h-5 flex-shrink-0" />
                Benchmark Failed
              </div>
              <span className="text-sm opacity-80">{error}</span>
            </div>
          )}
          <Card innerClassName="p-6 flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <label htmlFor="model-select" className="text-xs  text-neutral-500 font-medium">Select Target Models</label>
              
              <div className="relative z-40 w-full">
                <Dropdown 
                  value=""
                  onChange={toggleModel}
                  placeholder="Select Models to add..."
                  options={availableModels.map(m => ({
                    value: m.name,
                    label: m.name,
                    description: `Size: ${m.size}`
                  }))}
                />
              </div>

              {selectedModels.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedModels.map(name => (
                    <div key={name} className="pl-3 pr-1 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-neutral-300 flex items-center gap-2">
                      {name}
                      <button 
                        onClick={() => toggleModel(name)} 
                        aria-label={`Remove ${name}`}
                        className="hover:text-white p-1 hover:bg-white/10 rounded transition-colors"
                      >
                        &times;
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-20">
              {/* Type Select */}
              <div className="flex flex-col gap-3 relative">
                <label htmlFor="benchmark-type" className="text-xs  text-neutral-500 font-medium">Benchmark Type</label>
                <Dropdown 
                  value={benchmarkType}
                  onChange={setBenchmarkType}
                  options={BENCHMARK_TYPES.map(t => ({
                    value: t,
                    label: t
                  }))}
                />
                <span className="text-[10px] text-neutral-500 leading-relaxed mt-1">
                  {benchmarkType === "Standard (Chat)" && "General conversation simulation to measure base throughput."}
                  {benchmarkType === "Context (NIAH)" && "Needle-in-a-Haystack: measures retrieval degradation at max context length."}
                  {benchmarkType === "Code Generation" && "Simulates intense IDE coding workloads with zero-shot python tasks."}
                  {benchmarkType === "Latency (TTFT)" && "Time-To-First-Token: exclusively measures prompt processing latency."}
                  {benchmarkType === "Intelligence (LLM-as-a-Judge)" && "Generates answers then uses another model to grade output quality."}
                </span>
              </div>

              {/* Dataset Mode Toggle */}
              <div className="flex flex-col gap-3 relative z-10">
                <label className="text-xs text-neutral-500 font-medium">Dataset Source</label>
                <div className="flex bg-neutral-900/50 p-1 rounded-lg border border-white/5">
                  <button 
                    className={`flex-1 text-sm py-2 rounded-md transition-colors ${datasetMode === "standard" ? "bg-white/10 text-white font-medium shadow-sm" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                    onClick={() => setDatasetMode("standard")}
                  >
                    Built-in
                  </button>
                  <button 
                    className={`flex-1 text-sm py-2 rounded-md transition-colors ${datasetMode === "custom" ? "bg-white/10 text-white font-medium shadow-sm" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                    onClick={() => setDatasetMode("custom")}
                  >
                    Custom (BYOD)
                  </button>
                </div>
              </div>

              {/* Difficulty Select OR File Upload */}
              {datasetMode === "standard" ? (
                <div className="flex flex-col gap-3 relative z-10">
                  <label htmlFor="benchmark-difficulty" className="text-xs text-neutral-500 font-medium">Difficulty Preset</label>
                  <Dropdown 
                    value={difficulty}
                    onChange={setDifficulty}
                    options={DIFFICULTIES.map(d => ({
                      value: d,
                      label: d
                    }))}
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3 relative z-10">
                  <label className="text-xs text-neutral-500 font-medium">Upload Custom Dataset</label>
                  <div className={`border border-dashed ${customPrompts.length > 0 ? "border-brand-500/50 bg-brand-500/5" : "border-white/20 hover:bg-white/5"} rounded-xl p-4 flex flex-col items-center justify-center text-center gap-2 transition-colors cursor-pointer relative overflow-hidden group`}>
                    <input type="file" accept=".json,.csv,.txt" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                    <FilePlus className={`w-6 h-6 transition-colors ${customPrompts.length > 0 ? "text-brand-400" : "text-neutral-500 group-hover:text-brand-400"}`} />
                    <span className={`text-sm ${customPrompts.length > 0 ? "text-brand-300 font-medium" : "text-neutral-400"}`}>
                      {customPrompts.length > 0 
                        ? `${customPrompts.length} prompts loaded`
                        : "Upload .json, .csv, or .txt"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {benchmarkType === "Intelligence (LLM-as-a-Judge)" && (
              <div className="flex flex-col gap-3 p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300">
                <label htmlFor="judge-model" className="text-xs  text-brand-400 font-medium">Judge Model</label>
                <div className="flex gap-2">
                  <Dropdown 
                    value={judgeModel}
                    onChange={setJudgeModel}
                    placeholder="Select a Judge Model..."
                    className="flex-1"
                    options={[
                      ...availableModels.map(m => ({ value: m.name, label: m.name })),
                      { value: "llama3.2", label: "Recommended: llama3.2", description: "Auto-Pull if missing" },
                      { value: "gemma2:9b", label: "Recommended: gemma2:9b", description: "Auto-Pull if missing" }
                    ]}
                  />
                </div>
                <span className="text-[10px] opacity-80 mt-1">
                  The judge model will evaluate the outputs of your selected models. If you select a recommended model you don't have, it will pull automatically.
                </span>
              </div>
            )}

            {getMemoryWarning()}

          </Card>

          <Button 
            variant="primary" 
            className="w-full py-4 text-base shadow-brand"
            disabled={selectedModels.length === 0}
            onClick={runBenchmark}
            icon={<Cpu weight="fill" />}
          >
            Start Benchmark
          </Button>
        </div>
      ) : status === "completed" && benchmarkType === "Intelligence (LLM-as-a-Judge)" ? (
        <div className="grid gap-6">
          <h2 className="text-xl font-medium text-white mb-2">Intelligence Results</h2>
          {intelligenceResults.map(res => (
            <Card key={res.model} innerClassName="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg text-white">{res.model}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-400  font-semibold">Score:</span>
                  <span className="text-3xl font-black text-brand-400">{res.score}<span className="text-lg text-brand-400/50">/5</span></span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 mb-2 border-y border-white/5 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500  font-semibold">Speed</span>
                  <span className="text-lg text-white font-mono">{res.metrics.tokens_per_sec.toFixed(1)} <span className="text-xs text-neutral-500">t/s</span></span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500  font-semibold">Peak VRAM</span>
                  <span className="text-lg text-white font-mono">{res.metrics.vram_peak_gb.toFixed(1)} <span className="text-xs text-neutral-500">GB</span></span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500  font-semibold">Peak Temp</span>
                  <span className="text-lg text-white font-mono">{res.metrics.temp_c.toFixed(0)} <span className="text-xs text-neutral-500">°C</span></span>
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-neutral-300 italic leading-relaxed">"{res.reasoning}"</p>
              </div>
            </Card>
          ))}
          <Button variant="secondary" onClick={resetBenchmark}>Run Another Benchmark</Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {selectedModels.map(model => {
            const stream = streams[model];
            return (
              <Card key={model} innerClassName="p-6 relative overflow-hidden">
                <div 
                  className="absolute top-0 left-0 bottom-0 bg-brand-500/10 transition-transform duration-300 ease-out w-full origin-left" 
                  style={{ transform: `scaleX(${(stream?.progress_pct || 0) / 100})` }} 
                />
                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="text-white font-medium">{model}</span>
                    <span className="text-xs text-neutral-400">{stream?.status || "Waiting..."}</span>
                  </div>
                  
                  {stream && (
                    <div className="flex items-center gap-6">
                      {stream.current_vram !== undefined && stream.current_vram > 0 && (
                        <div className="flex flex-col items-end hidden sm:flex">
                           <span className="text-xs text-neutral-500 font-medium">VRAM</span>
                           <span className="text-sm font-mono text-neutral-300">{stream.current_vram.toFixed(1)} <span className="text-[10px]">GB</span></span>
                        </div>
                      )}
                      
                      {stream.current_temp !== undefined && stream.current_temp > 0 && (
                        <div className="flex flex-col items-end hidden sm:flex">
                           <span className="text-xs text-neutral-500 font-medium">GPU Temp</span>
                           <span className={cn("text-sm font-mono", stream.current_temp > 80 ? "text-red-400 font-bold drop-shadow-[0_0_8px_rgba(248,113,113,0.5)]" : "text-neutral-300")}>{stream.current_temp.toFixed(0)} <span className="text-[10px]">°C</span></span>
                        </div>
                      )}

                      {stream.current_tps > 0 && (
                        <div className="flex items-baseline gap-1 min-w-[80px] justify-end">
                          <span className="text-xl text-brand-400 font-mono font-medium">{stream.current_tps.toFixed(1)}</span>
                          <span className="text-[10px] text-brand-400/70 uppercase font-bold tracking-wider">t/s</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          
          {status === "completed" && datasetMode === "custom" && results.length > 0 && results.some(r => r.prompt_metrics && r.prompt_metrics.length > 0) && (
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300 mt-4">
              <span className="font-medium text-sm">Matrix Saved</span>
              <span className="text-xs opacity-80">
                The detailed per-prompt performance matrix has been saved to your Results history. Head over to the Results page to view the full breakdown.
              </span>
            </div>
          )}

          {status === "completed" && (
             <Button variant="secondary" className="mt-4" onClick={resetBenchmark}>Run Another Benchmark</Button>
          )}
        </div>
      )}
    </div>
  );
}
