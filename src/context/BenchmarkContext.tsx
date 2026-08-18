import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useToast } from "../components/Toast";
import { INTELLIGENCE_TESTS, LM_EVAL_TESTS } from "../pages/Benchmark";

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
  ttft_ms: number;
  prefill_rate: number;
  quant_level?: string;
  prompt_metrics?: PromptMetric[];
  tps_variance: number;
  p90_latency_ms: number;
  tool_call_count?: number;
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
  datasetMode: "standard" | "custom_file" | "builder";
  customPrompts: string[];
  telemetryHistory: Record<string, any[]>;
  logStream: Record<string, Array<{time: number, msg: string}>>;
  setSelectedModels: (models: string[]) => void;
  setBenchmarkType: (t: string) => void;
  setDifficulty: (d: string) => void;
  setJudgeModel: (m: string) => void;
  setDatasetMode: (m: "standard" | "custom_file" | "builder") => void;
  setCustomPrompts: (prompts: string[]) => void;
  customQuestionLimit: number | undefined;
  setCustomQuestionLimit: (limit: number | undefined) => void;
  runBenchmark: () => Promise<void>;
  resetBenchmark: () => void;
  cancelBenchmark: () => Promise<void>;
}

const BenchmarkContext = createContext<BenchmarkContextType | null>(null);

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BenchmarkStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [benchmarkType, setBenchmarkType] = useState<string>("Standard (Chat)");
  const [difficulty, setDifficulty] = useState<string>("Medium");
  const [judgeModel, setJudgeModel] = useState<string>("llama3:8b");
  const [datasetMode, setDatasetMode] = useState<"standard" | "custom_file" | "builder">("standard");
  const [customPrompts, setCustomPrompts] = useState<string[]>([]);
  const [customQuestionLimit, setCustomQuestionLimit] = useState<number | undefined>(undefined);
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [intelligenceResults, setIntelligenceResults] = useState<IntelligenceResult[]>([]);
  const [streams, setStreams] = useState<Record<string, ProgressPayload>>({});
  const [telemetryHistory, setTelemetryHistory] = useState<Record<string, any[]>>({});
  const telemetryHistoryRef = useRef<Record<string, any[]>>({});
  const [logStream, setLogStream] = useState<Record<string, Array<{time: number, msg: string}>>>({});
  const { toast } = useToast();

  useEffect(() => {
    let unlisten: UnlistenFn;
    const setupListener = async () => {
      unlisten = await listen<ProgressPayload>("benchmark-progress", (event) => {
        const payload = event.payload;
        setStreams(prev => ({ ...prev, [payload.model]: payload }));
        
        const now = Date.now();
        setTelemetryHistory(prev => {
          const next = { ...prev };
          if (!next[payload.model]) next[payload.model] = [];
          const last = next[payload.model][next[payload.model].length - 1];
          
          if (!last || now - last.time > 500) {
            next[payload.model] = [...next[payload.model], {
              time: now,
              timeLabel: new Date(now).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
              tps: payload.current_tps,
              vram: payload.current_vram || 0,
              temp: payload.current_temp || 0,
            }].slice(-120);
          }
          telemetryHistoryRef.current = next;
          return next;
        });

        setLogStream(prev => {
          const next = { ...prev };
          if (!next[payload.model]) next[payload.model] = [];
          const lastLog = next[payload.model][next[payload.model].length - 1];
          if (payload.status && payload.status !== lastLog?.msg) {
            next[payload.model] = [...next[payload.model], { time: Date.now(), msg: payload.status }].slice(-50);
          }
          return next;
        });
      });
    };
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const cancelBenchmark = async () => {
    try {
      await invoke("cancel_benchmark");
      toast("Benchmark cancelled.", "info");
    } catch (err) {
      console.error("Failed to cancel benchmark:", err);
    }
    setStatus("idle");
    setError(null);
    setStreams({});
  };

  const resetBenchmark = () => {
    setStatus("idle");
    setError(null);
    setResults([]);
    setIntelligenceResults([]);
    setStreams({});
    setTelemetryHistory({});
    telemetryHistoryRef.current = {};
    setLogStream({});
  };

  const runBenchmark = async () => {
    if (selectedModels.length === 0) return;
    setStatus("running");
    setError(null);
    setResults([]);
    setIntelligenceResults([]);
    setStreams({});
    setTelemetryHistory({});
    setLogStream({});
    
    try {
      const promptsPayload = datasetMode !== "standard" && customPrompts.length > 0 ? customPrompts : null;

      if (INTELLIGENCE_TESTS.includes(benchmarkType)) {
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
            benchmarkType,
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
            difficulty: datasetMode !== "standard" ? "Custom Dataset" : difficulty,
            providedScore: res.score,
            reasoning: res.reasoning,
            promptMetrics: res.metrics.prompt_metrics,
            ttftMs: res.metrics.ttft_ms,
            prefillRate: res.metrics.prefill_rate,
            quantLevel: res.metrics.quant_level,
            tpsVariance: res.metrics.tps_variance,
            p90LatencyMs: res.metrics.p90_latency_ms,
            toolCallCount: res.metrics.tool_call_count,
            tpsHistory: telemetryHistoryRef.current[model]?.map(h => h.tps),
            vramHistory: telemetryHistoryRef.current[model]?.map(h => h.vram),
            tempHistory: telemetryHistoryRef.current[model]?.map(h => h.temp)
          }).catch(console.error);
        }
        setIntelligenceResults(intResults);
        setResults(normResults);
        toast("Intelligence Benchmark completed and saved!", "success");
      } else if (LM_EVAL_TESTS.includes(benchmarkType)) {
        const sequentialResults: BenchmarkResult[] = [];
        for (const model of selectedModels) {
          setStreams(prev => ({
            ...prev,
            [model]: { model, status: `Starting LM-Eval for ${benchmarkType} (Downloading datasets, this may take a few minutes)...`, current_tps: 0, progress_pct: 10 }
          }));

          const LMEVAL_TASK_MAP: Record<string, string> = {
            "MMLU-Pro": "mmlu_pro",
            "MMLU": "mmlu",
            "GPQA Diamond": "gpqa_diamond",
            "LiveMCPBench": "mmlu_pro", 
            "Exercism": "humaneval",
            "GraphWalks": "graphwalks",
            "SimpleQA": "truthfulqa",
            "SWE-bench": "humaneval",
            "HumanEval": "humaneval",
            "LSAT": "agieval_lsat_ar",
            "SAT": "agieval_sat_math",
            "AGIEval": "agieval",
            "GSM8K": "gsm8k",
            "BFCL": "gsm8k",
            "hellaswag": "hellaswag"
          };
          const mappedTask = LMEVAL_TASK_MAP[benchmarkType] || benchmarkType.toLowerCase();

          const sampleLimit = customQuestionLimit !== undefined 
            ? customQuestionLimit 
            : (difficulty === "Light" ? 25 : difficulty === "Medium" ? 100 : difficulty === "Heavy" ? 500 : undefined);

          const res: any = await invoke("run_lm_eval", {
            model,
            task: mappedTask,
            limit: sampleLimit
          });

          const accuracy = res.acc || res.exact_match || 0;

          // Extract real peak VRAM and average GPU Temp from telemetry history if available
          const modelHistory = telemetryHistoryRef.current[model] || [];
          const vramValues = modelHistory.map(h => h.vram).filter(v => v > 0);
          const tempValues = modelHistory.map(h => h.temp).filter(t => t > 0);
          const peakVram = vramValues.length > 0 ? Math.max(...vramValues) : 0.0;
          const avgTemp = tempValues.length > 0 ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length : 0.0;

          const r: BenchmarkResult = {
            model_name: model,
            tokens_per_sec: accuracy * 100.0, // Real accuracy percentage (0-100%)
            vram_peak_gb: peakVram,
            temp_c: avgTemp,
            ttft_ms: 0,
            prefill_rate: 0,
            tps_variance: 0,
            p90_latency_ms: 0,
            tool_call_count: res.tool_call_count
          };

          sequentialResults.push(r);
          
          await invoke("save_result", {
            model: model,
            speed: accuracy * 100.0,
            vram: peakVram,
            temp: avgTemp,
            benchmarkType,
            difficulty: customQuestionLimit ? `Custom (${customQuestionLimit} Qs)` : (difficulty || "Standard"),
            providedScore: Math.round(accuracy * 100),
            reasoning: JSON.stringify(res),
            toolCallCount: res.tool_call_count,
            tpsHistory: telemetryHistoryRef.current[model]?.map(h => h.tps),
            vramHistory: telemetryHistoryRef.current[model]?.map(h => h.vram),
            tempHistory: telemetryHistoryRef.current[model]?.map(h => h.temp)
          }).catch(console.error);
        }
        setResults(sequentialResults);
        toast("LM-Eval Benchmark completed and saved!", "success");
      } else if (benchmarkType === "Canonical Suite") {
        const canonicalTasks = [
          { type: "Standard (Chat)", difficulty: "Heavy" },
          { type: "Code Generation", difficulty: "Medium" },
          { type: "Context (NIAH)", difficulty: "Medium" },
        ];
        
        const normResults: BenchmarkResult[] = [];
        for (const model of selectedModels) {
           let avg_tps = 0;
           let peak_vram = 0;
           let peak_temp = 0;
           let avg_ttft = 0;
           let avg_variance = 0;
           let avg_p90 = 0;
           
           for (let i=0; i<canonicalTasks.length; i++) {
              const task = canonicalTasks[i];
              setStreams(prev => ({
                ...prev,
                [model]: { model, status: `Canonical ${i+1}/3: ${task.type}...`, current_tps: 0, progress_pct: 10 }
              }));
              const res = await invoke<BenchmarkResult[]>("run_benchmark", {
                models: [model],
                benchmarkType: task.type,
                difficulty: task.difficulty,
                customPrompts: null
              });
              if (res && res.length > 0) {
                const r = res[0];
                avg_tps += r.tokens_per_sec;
                avg_ttft += r.ttft_ms;
                avg_variance += r.tps_variance;
                avg_p90 += r.p90_latency_ms;
                if (r.vram_peak_gb > peak_vram) peak_vram = r.vram_peak_gb;
                if (r.temp_c > peak_temp) peak_temp = r.temp_c;
              }
           }

           avg_tps /= canonicalTasks.length;
           avg_ttft /= canonicalTasks.length;
           avg_variance /= canonicalTasks.length;
           avg_p90 /= canonicalTasks.length;

           const canonRes = {
              model_name: model,
              tokens_per_sec: avg_tps,
              vram_peak_gb: peak_vram,
              temp_c: peak_temp,
              ttft_ms: avg_ttft,
              prefill_rate: 0,
              tps_variance: avg_variance,
              p90_latency_ms: avg_p90
           };
           normResults.push(canonRes);

           await invoke("save_result", {
            model,
            speed: avg_tps,
            vram: peak_vram,
            temp: peak_temp,
            benchmarkType,
            difficulty: "Canonical",
            ttftMs: avg_ttft,
            prefillRate: 0,
            tpsVariance: avg_variance,
            p90LatencyMs: avg_p90,
            tpsHistory: telemetryHistoryRef.current[model]?.map(h => h.tps),
            vramHistory: telemetryHistoryRef.current[model]?.map(h => h.vram),
            tempHistory: telemetryHistoryRef.current[model]?.map(h => h.temp)
           }).catch(console.error);
        }
        setResults(normResults);
        toast("Canonical Suite completed and saved!", "success");
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
              difficulty: datasetMode !== "standard" ? "Custom Dataset" : difficulty,
              promptMetrics: r.prompt_metrics,
              ttftMs: r.ttft_ms,
              prefillRate: r.prefill_rate,
              quantLevel: r.quant_level,
              tpsVariance: r.tps_variance,
              p90LatencyMs: r.p90_latency_ms,
              toolCallCount: r.tool_call_count,
              tpsHistory: telemetryHistoryRef.current[r.model_name]?.map(h => h.tps),
              vramHistory: telemetryHistoryRef.current[r.model_name]?.map(h => h.vram),
              tempHistory: telemetryHistoryRef.current[r.model_name]?.map(h => h.temp)
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
      toast(String(err), "error");
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
      telemetryHistory,
      logStream,
      customQuestionLimit,
      setCustomQuestionLimit,
      setSelectedModels,
      setBenchmarkType,
      setDifficulty,
      setJudgeModel,
      setDatasetMode,
      setCustomPrompts,
      runBenchmark,
      resetBenchmark,
      cancelBenchmark
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
