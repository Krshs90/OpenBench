import { useState, useEffect, useRef } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { ShareNetwork, DownloadSimple, Cpu, Spinner, Wrench, Lightbulb, Clock, Info, ArrowLeft, Trash, Image } from "@phosphor-icons/react";
import { toPng, toJpeg, toSvg } from "html-to-image";
import { Scorecard } from "../components/Scorecard";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Link } from "react-router-dom";
import { cn } from "../components/Card";
import { ChartLineUp } from "@phosphor-icons/react";
import { SectionHeader } from "../components/SectionHeader";
import { Dropdown } from "../components/Dropdown";

interface SavedResult {
  id: string;
  model: string;
  hardware: string;
  speed: number;
  vram: number;
  temp: number;
  score: number;
  timestamp: number;
  workload?: string;
  benchmark_type?: string;
  difficulty?: string;
  reasoning?: string;
  prompt_metrics?: { prompt: string; tokens_per_sec: number; response: string }[];
}

export function Results() {
  const [results, setResults] = useState<SavedResult[]>([]);
  const [activeResult, setActiveResult] = useState<SavedResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [filterType, setFilterType] = useState("all");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<string[]>([]);

  const loadResults = () => {
    invoke<SavedResult[]>("get_saved_results")
      .then(res => {
        setResults(res);
        if (res.length > 0) {
          setActiveResult(prev => {
            if (prev && res.find(r => r.id === prev.id)) return prev;
            return res[0];
          });
        } else {
          setActiveResult(null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadResults();
  }, []);

  const handleClearHistory = async () => {
    if (!deleteMode) {
      setDeleteMode(true);
      setSelectedForDeletion([]);
      return;
    }
    
    if (selectedForDeletion.length === 0) {
      setDeleteMode(false);
      return;
    }

    try {
      for (const id of selectedForDeletion) {
        await invoke("delete_result", { id });
      }
      setDeleteMode(false);
      setSelectedForDeletion([]);
      loadResults();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredAndSorted = [...results]
    .filter(r => filterType === "all" || (r.benchmark_type || r.workload || "Standard") === filterType)
    .sort((a, b) => {
      if (sortBy === "newest") return b.timestamp - a.timestamp;
      if (sortBy === "score") return b.score - a.score;
      if (sortBy === "speed") return b.speed - a.speed;
      return 0;
    });
    
  const availableTypes = Array.from(new Set(results.map(r => r.benchmark_type || r.workload || "Standard")));

  if (loading) {
    return (
      <div className="p-8 mx-auto flex items-center justify-center h-full">
        <Spinner className="animate-spin text-neutral-500 w-8 h-8" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center gap-4 h-[60vh] text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
          <ChartLineUp className="w-8 h-8 text-neutral-500" />
        </div>
        <h3 className="text-lg text-white font-medium">No Benchmark Results</h3>
        <p className="text-sm text-neutral-400 max-w-sm mb-2">
          You haven't run any benchmarks yet. Run a workload simulation to see detailed performance analytics here.
        </p>
        <Link to="/benchmark">
          <Button variant="primary" icon={<ChartLineUp weight="bold" />}>Run a Benchmark</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full max-h-screen overflow-hidden">
      {/* History Sidebar */}
      <div className={cn("w-full md:w-80 border-r border-white/5 bg-[#0a0a0a] flex-col overflow-hidden", activeResult ? "hidden md:flex" : "flex")}>
        <div className="p-5 border-b border-white/5 flex flex-col gap-4">
          <div>
            <h2 className="text-white font-medium">Run History</h2>
            <p className="text-xs text-neutral-500 mt-1">{results.length} total benchmarks</p>
          </div>
          <div className="flex flex-col gap-2">
            <Dropdown 
              value={filterType}
              onChange={setFilterType}
              className="w-full"
              options={[
                { value: "all", label: "All Workloads" },
                ...availableTypes.map(t => ({ value: t, label: t }))
              ]}
            />
            <div className="flex items-center gap-2">
              <Dropdown 
                value={sortBy} 
                onChange={setSortBy} 
                className="flex-1"
                options={[
                  { value: "newest", label: "Newest First" },
                  { value: "score", label: "Highest Score" },
                  { value: "speed", label: "Highest Speed" },
                ]}
              />
            <button 
              onClick={handleClearHistory}
              className={cn("p-2.5 rounded-lg border transition-colors flex items-center justify-center outline-none", deleteMode ? "bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]" : "bg-white/5 text-neutral-400 border-white/10 hover:bg-white/10 hover:text-white")}
              title={deleteMode ? (selectedForDeletion.length > 0 ? `Delete ${selectedForDeletion.length} items` : "Cancel delete mode") : "Select results to delete"}
            >
              <Trash className="w-5 h-5" />
            </button>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col p-3 gap-2 pb-24">
          {filteredAndSorted.map(res => {
            const isActive = activeResult?.id === res.id;
            return (
              <button
                key={res.id}
                onClick={() => {
                  if (deleteMode) {
                    setSelectedForDeletion(prev => prev.includes(res.id) ? prev.filter(id => id !== res.id) : [...prev, res.id]);
                  } else {
                    setActiveResult(res);
                  }
                }}
                className={cn(
                  "flex flex-col gap-2 p-3 rounded-lg text-left transition-colors border",
                  deleteMode && selectedForDeletion.includes(res.id)
                    ? "bg-red-500/10 border-red-500/30"
                    : isActive && !deleteMode ? "bg-white/10 border-white/20" : "hover:bg-white/5 border-transparent"
                )}
              >
                <div className="flex justify-between items-center w-full">
                  <span className="text-sm font-medium text-white truncate pr-2">{res.model}</span>
                  <span className="text-xs font-mono text-brand-400 bg-brand-500/10 px-1.5 py-0.5 rounded">{res.score}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 ">
                  <Clock size={12} className="mt-[1px]" />
                  <span>{new Date(res.timestamp * 1000).toLocaleDateString()}</span>
                  <span className="mx-0.5">•</span>
                  <span>{res.speed.toFixed(1)} t/s</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail View */}
      <div className={cn("flex-1 overflow-y-auto p-4 md:p-8 pb-32", !activeResult ? "hidden md:block" : "block")}>
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          {activeResult && (
            <>
              <button 
                onClick={() => setActiveResult(null)}
                className="md:hidden self-start flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to History
              </button>
              <ResultDetail result={activeResult} copied={copied} setCopied={setCopied} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultDetail({ result, copied, setCopied }: { result: SavedResult, copied: boolean, setCopied: (v: boolean) => void }) {
  const dateStr = new Date(result.timestamp * 1000).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  const scorecardRef = useRef<HTMLDivElement>(null);
  const [exportingCard, setExportingCard] = useState(false);

  const handleExportScorecard = async () => {
    if (!scorecardRef.current) return;
    setExportingCard(true);
    try {
      const filePath = await save({
        filters: [
          { name: 'PNG Image', extensions: ['png'] },
          { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
          { name: 'SVG Vector', extensions: ['svg'] }
        ],
        defaultPath: `openbench-${result.model.replace(/\W+/g, '-')}-scorecard.png`
      });

      if (!filePath) {
        setExportingCard(false);
        return;
      }

      let dataUrl = "";
      if (filePath.endsWith(".svg")) {
        dataUrl = await toSvg(scorecardRef.current, { cacheBust: true });
      } else if (filePath.endsWith(".jpeg") || filePath.endsWith(".jpg")) {
        dataUrl = await toJpeg(scorecardRef.current, { cacheBust: true, pixelRatio: 2, quality: 0.95 });
      } else {
        dataUrl = await toPng(scorecardRef.current, { cacheBust: true, pixelRatio: 2 });
      }

      const parts = dataUrl.split(',');
      let bytesArray: number[] = [];
      if (parts[0].includes('base64')) {
        const binaryString = atob(parts[1]);
        for (let i = 0; i < binaryString.length; i++) {
          bytesArray.push(binaryString.charCodeAt(i));
        }
      } else {
        const u8 = new TextEncoder().encode(decodeURIComponent(parts[1]));
        bytesArray = Array.from(u8);
      }

      await invoke("save_file_to_disk", { path: filePath, bytes: bytesArray });
    } catch (err) {
      console.error('Failed to export scorecard:', err);
    } finally {
      setExportingCard(false);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openbench-${result.model.replace(/\W+/g, '-')}-${result.timestamp}.json`;
    a.click();
  };

  const handleShare = () => {
    const md = `**OpenBench Result**\nModel: ${result.model}\nHardware: ${result.hardware}\nScore: ${result.score}\nSpeed: ${result.speed.toFixed(1)} t/s\nVRAM: ${result.vram.toFixed(1)} GB`;
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  let hwAdvice = "Your system is perfectly balanced for this workload.";
  let modelRec = "You can run most standard 7B models comfortably.";

  if (result.vram > 12) {
    hwAdvice = `Your ${result.hardware} handled the intense memory footprint (${result.vram.toFixed(1)}GB) well. You have plenty of headroom.`;
    modelRec = "You have the headroom to run heavy 32B-70B parameter models (like Command-R or Llama-3 70B-Q4).";
  } else if (result.speed < 10) {
    hwAdvice = "You are heavily Memory Bandwidth constrained. Upgrading from DDR4 to DDR5 or getting a GPU with more VRAM will significantly increase your TPS.";
    modelRec = "Stick to optimized 3B models (like Phi-3 or Qwen-1.5 4B) heavily quantized to Q4_K_M.";
  } else {
    hwAdvice = "Solid mid-tier performance. Your thermals and compute are healthy, but you may experience slowdowns at high context lengths.";
    modelRec = "Your system handles 8B models (like Llama-3 8B) extremely well. Try a Q5 quantization for the optimal speed-to-intelligence ratio.";
  }

  return (
    <>
      <header className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-medium text-white tracking-tight">Benchmark Result</h1>
          <p className="text-sm text-neutral-400 mt-1">{dateStr} • OpenBench v1.0.0</p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="secondary" icon={exportingCard ? <Spinner className="animate-spin" /> : <Image />} onClick={handleExportScorecard} disabled={exportingCard}>
            {exportingCard ? "Generating..." : "Save Image"}
          </Button>
          <Button variant="secondary" icon={<DownloadSimple />} onClick={handleExport}>JSON</Button>
          <Button icon={<ShareNetwork weight="fill" />} onClick={handleShare}>
            {copied ? "Copied!" : "Share Text"}
          </Button>
        </div>
      </header>

      <Card innerClassName="p-0 flex flex-col">
        <div className="p-6 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center flex-shrink-0">
              <Cpu className="text-neutral-300 w-6 h-6" />
            </div>
            <div className="flex-1 overflow-hidden">
              <h2 className="text-xl text-white font-medium truncate" title={result.model}>{result.model}</h2>
              <div className="flex items-center gap-3 text-xs text-neutral-400 mt-1.5 font-mono truncate" title={result.hardware}>
                <span>{result.hardware}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1 w-40 flex-shrink-0">
              <span className="text-[10px]  text-neutral-500 font-medium">Workload</span>
              <div className="flex items-center gap-2 text-sm text-neutral-200">
                <Wrench className="w-4 h-4 text-neutral-400" />
                <span>
                  {result.benchmark_type && result.difficulty 
                    ? `${result.benchmark_type} • ${result.difficulty}` 
                    : (result.workload || "Standard")}
                </span>
              </div>
            </div>
            <div
              tabIndex={0}
              className="flex flex-col items-center justify-center w-20 h-20 rounded bg-white/5 border border-white/5 text-white flex-shrink-0 relative group cursor-help focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-[var(--color-surface)]"
            >
              <span className="text-2xl font-mono tracking-tight">{result.score}{result.benchmark_type === "Intelligence (LLM-as-a-Judge)" ? "/5" : ""}</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[9px] font-semibold text-neutral-500">Score</span>
                <Info weight="bold" className="text-neutral-500 w-3 h-3" />
              </div>
              
              {/* Tooltip — visible on hover AND on focus */}
              <div className="absolute top-full right-0 mt-2 w-64 bg-neutral-900 border border-white/10 rounded-lg shadow-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus:opacity-100 group-focus:visible transition-all z-50 text-left">
                {result.benchmark_type === "Intelligence (LLM-as-a-Judge)" ? (
                  <p className="text-[10px] text-neutral-500 leading-relaxed">
                    Score given out of 5 by the designated LLM Judge.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-neutral-300 font-medium mb-1">Score Calculation</p>
                    <code className="text-[10px] text-brand-400 block mb-2 bg-black/50 p-1.5 rounded font-mono">
                      (TPS * 10) + (100 - Temp) - (VRAM * 5)
                    </code>
                    <p className="text-[10px] text-neutral-500 leading-relaxed">
                      The OpenBench score rewards generation speed and thermal efficiency, while penalizing heavy memory consumption.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {result.reasoning && (
          <div className="px-8 pt-8">
             <div className="flex flex-col gap-2 p-4 bg-white/5 border border-white/10 rounded-lg">
                <span className="text-[10px] text-neutral-500  font-semibold">Judge's Reasoning</span>
                <p className="text-sm text-neutral-300 italic leading-relaxed">"{result.reasoning}"</p>
             </div>
          </div>
        )}
        
        {/* Stats Strip — replaces hero metric grid */}
        <div className="border-t border-white/5 px-8 py-5">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-5">
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] text-neutral-500 font-semibold tracking-widest uppercase">Speed</dt>
              <dd className="font-mono text-xl text-white tracking-tight">{result.speed.toFixed(1)} <span className="text-xs text-neutral-500 font-sans">tok/s</span></dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] text-neutral-500 font-semibold tracking-widest uppercase">Peak VRAM</dt>
              <dd className="font-mono text-xl text-neutral-300 tracking-tight">{result.vram.toFixed(1)} <span className="text-xs text-neutral-500 font-sans">GB</span></dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] text-neutral-500 font-semibold tracking-widest uppercase">Avg Temp</dt>
              <dd className={cn("font-mono text-xl tracking-tight", result.temp > 80 ? "text-red-400" : "text-neutral-300")}>{result.temp.toFixed(0)} <span className="text-xs text-neutral-500 font-sans">°C</span></dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-[10px] text-neutral-500 font-semibold tracking-widest uppercase">Workload</dt>
              <dd className="text-sm text-neutral-300 truncate">{result.workload || "Medium"}</dd>
            </div>
          </dl>
        </div>
      </Card>
      
      {result.prompt_metrics && result.prompt_metrics.length > 0 && (
        <Card innerClassName="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-medium text-white">Matrix</h2>
          </div>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-neutral-900/50">
            <table className="w-full text-left text-sm text-neutral-400">
              <thead className="text-xs uppercase bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 font-medium text-neutral-300">Prompt</th>
                  <th className="px-6 py-4 font-medium text-brand-400 min-w-[200px]">SPEED & RESPONSE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {result.prompt_metrics.map((metric, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 align-top w-1/3 max-w-xs">
                      <p className="line-clamp-4 text-neutral-300 italic">"{metric.prompt}"</p>
                    </td>
                    <td className="px-6 py-4 align-top">
                      <div className="flex flex-col gap-2">
                        <span className="inline-flex items-center w-fit px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-brand-500/10 text-brand-300 border border-brand-500/20">
                          {metric.tokens_per_sec.toFixed(1)} t/s
                        </span>
                        <div className="max-h-40 overflow-y-auto bg-black/20 p-2 rounded border border-white/5 custom-scrollbar">
                          <p className="text-xs text-neutral-400 whitespace-pre-wrap">{metric.response}</p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6">
        <Card innerClassName="p-6 flex flex-col gap-4">
          <SectionHeader icon={<Wrench className="text-brand-500 w-5 h-5" />} title="Hardware Advisor" />
          <p className="text-sm text-neutral-400 leading-relaxed">
            {hwAdvice}
          </p>
        </Card>
        
        <Card innerClassName="p-6 flex flex-col gap-4">
          <SectionHeader icon={<Lightbulb className="text-yellow-500 w-5 h-5" />} title="Model Recommendations" />
          <p className="text-sm text-neutral-400 leading-relaxed">
            {modelRec}
          </p>
        </Card>
      </div>
      
      {/* Hidden Scorecard for Export */}
      <div className="absolute opacity-0 pointer-events-none -z-50" style={{ left: 0, top: 0 }}>
        <Scorecard ref={scorecardRef} result={result} />
      </div>
    </>
  );
}
