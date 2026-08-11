import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useToast } from "../components/Toast";

interface PromptMetric {
  prompt: string;
  tokens_per_sec: number;
  response: string;
}

interface BenchmarkResult {
  model_name: string;
  tokens_per_sec: number;
  vram_peak_gb: number;
  temp_c: number;
  prompt_metrics?: PromptMetric[];
}

interface ProgressPayload {
  model: string;
  status: string;
  current_tps: number;
  progress_pct: number;
  current_vram?: number;
  current_temp?: number;
}

type BenchmarkStatus = "idle" | "running" | "completed" | "error";

interface IntelligenceResult {
  model: string;
  score: number;
  reasoning: string;
  metrics: BenchmarkResult;
}

interface BenchmarkContextType {
  status: BenchmarkStatus;
  error: string | null;
  selectedModels: string[];
  benchmarkType: string;
  difficulty: string;
  judgeModel: string;
  results: BenchmarkResult[];
  intelligenceResults: IntelligenceResult[];
  streams: Record<string, ProgressPayload>;
  datasetMode: "standard" | "custom";
  customPrompts: string[];
  setSelectedModels: (models: string[]) => void;
  setBenchmarkType: (t: string) => void;
  setDifficulty: (d: string) => void;
  setJudgeModel: (m: string) => void;
  setDatasetMode: (m: "standard" | "custom") => void;
  setCustomPrompts: (prompts: string[]) => void;
  runBenchmark: () => Promise<void>;
  resetBenchmark: () => void;
}

const BenchmarkContext = createContext<BenchmarkContextType | null>(null);

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BenchmarkStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [benchmarkType, setBenchmarkType] = useState<string>("Standard (Chat)");
  const [difficulty, setDifficulty] = useState<string>("Medium");
  const [judgeModel, setJudgeModel] = useState<string>("llama3:8b");
  const [datasetMode, setDatasetMode] = useState<"standard" | "custom">("standard");
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [intelligenceResults, setIntelligenceResults] = useState<IntelligenceResult[]>([]);
  const [streams, setStreams] = useState<Record<string, ProgressPayload>>({});
  const { toast } = useToast();

  useEffect(() => {
    let unlisten: UnlistenFn;
    const setupListener = async () => {
      unlisten = await listen<ProgressPayload>("benchmark-progress", (event) => {
        setStreams(prev => ({ ...prev, [event.payload.model]: event.payload }));
      });
    };
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const resetBenchmark = () => {
    setStatus("idle");
    setError(null);
    setResults([]);
    setIntelligenceResults([]);
    setStreams({});
  };

  const runBenchmark = async () => {
    if (selectedModels.length === 0) return;
    setStatus("running");
    setError(null);
    setResults([]);
    setIntelligenceResults([]);
    setStreams({});
    
    try {
      const promptsPayload = datasetMode === "custom" && customPrompts.length > 0 ? customPrompts : null;

      if (benchmarkType === "Intelligence (LLM-as-a-Judge)") {
        const intResults: IntelligenceResult[] = [];
        const normResults: BenchmarkResult[] = [];
        for (const model of selectedModels) {
          setStreams(prev => ({
            ...prev,
            [model]: { model, status: "Judge is evaluating...", current_tps: 0, progress_pct: 50 }
          }));
          const res = await invoke<IntelligenceResult>("run_intelligence_benchmark", {
            targetModel: model,
            judgeModel,
            difficulty,
            customPrompts: promptsPayload
          });
          intResults.push(res);
          normResults.push(res.metrics);
          
          await invoke("save_result", {
            model: res.metrics.model_name,
            speed: res.metrics.tokens_per_sec,
            vram: res.metrics.vram_peak_gb,
            temp: res.metrics.temp_c,
            benchmarkType,
            difficulty: datasetMode === "custom" ? "Custom Dataset" : difficulty,
            providedScore: res.score,
            reasoning: res.reasoning,
            promptMetrics: res.metrics.prompt_metrics
          }).catch(console.error);
        }
        setIntelligenceResults(intResults);
        setResults(normResults);
        toast("Intelligence Benchmark completed and saved!", "success");
      } else {
        const sequentialResults: BenchmarkResult[] = [];
        for (const model of selectedModels) {
          const res = await invoke<BenchmarkResult[]>("run_benchmark", { 
            models: [model],
            benchmarkType,
            difficulty,
            customPrompts: promptsPayload
          });
          
          if (res && res.length > 0) {
            const r = res[0];
            sequentialResults.push(r);
            await invoke("save_result", {
              model: r.model_name,
              speed: r.tokens_per_sec,
              vram: r.vram_peak_gb,
              temp: r.temp_c,
              benchmarkType,
              difficulty: datasetMode === "custom" ? "Custom Dataset" : difficulty,
              promptMetrics: r.prompt_metrics
            }).catch(console.error);
          }
        }
        setResults(sequentialResults);
        toast("Benchmark completed and saved to history!", "success");
      }

      setStatus("completed");
    } catch (err) {
      console.error("Benchmark failed", err);
      setError(String(err));
      setStatus("error");
    }
  };

  return (
    <BenchmarkContext.Provider value={{
      status,
      error,
      selectedModels,
      benchmarkType,
      difficulty,
      judgeModel,
      results,
      intelligenceResults,
      streams,
      datasetMode,
      customPrompts,
      setSelectedModels,
      setBenchmarkType,
      setDifficulty,
      setJudgeModel,
      setDatasetMode,
      setCustomPrompts,
      runBenchmark,
      resetBenchmark
    }}>
      {children}
    </BenchmarkContext.Provider>
  );
}

export function useBenchmark() {
  const context = useContext(BenchmarkContext);
  if (!context) throw new Error("useBenchmark must be used within BenchmarkProvider");
  return context;
}
