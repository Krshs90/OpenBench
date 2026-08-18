import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Card, cn } from "../components/Card";
import { Button } from "../components/Button";
import { Cpu, Warning, FilePlus, Trash, Plus, ArrowLeft, ArrowRight, CheckCircle, Brain, Desktop, ShieldChevron, MagnifyingGlass, ChartLineUp, XCircle } from "@phosphor-icons/react";
import { useBenchmark } from "../context/BenchmarkContext";
import { useToast } from "../components/Toast";
import { LocalModel } from "../types";
import { Dropdown } from "../components/Dropdown";
import { LineChart, Line, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const TelemetryTooltip = ({ active, payload, unit }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0];
    const val = dataPoint.value;
    const timeStr = dataPoint.payload?.timeLabel;
    return (
      <div className="bg-neutral-900/95 backdrop-blur-md border border-white/15 px-3 py-1.5 rounded-lg shadow-2xl flex flex-col gap-0.5 pointer-events-none z-50">
        {timeStr && <span className="text-[9px] text-neutral-400 font-mono">{timeStr}</span>}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dataPoint.stroke || dataPoint.color }} />
          <span className="text-xs font-mono font-bold text-white">
            {typeof val === "number" ? val.toFixed(1) : val}
          </span>
          <span className="text-[10px] text-neutral-400">{unit}</span>
        </div>
      </div>
    );
  }
  return null;
};

interface SystemInfo {
  gpus: string[];
  vram_gb: number;
  ram_gb: number;
}

export const HARDWARE_TESTS = ["Standard (Chat)", "Context (NIAH)", "Latency (TTFT)", "Canonical Suite"];
export const INTELLIGENCE_TESTS = ["Intelligence (LLM-as-a-Judge)"];
export const FEATURED_TESTS = ["MMLU-Pro", "GPQA Diamond", "LiveMCPBench", "Exercism", "GraphWalks", "SimpleQA"];
export const CODE_TESTS = ["SWE-bench", "HumanEval", "Code Generation"];
export const STANDARDIZED_TESTS = ["LSAT", "SAT", "AGIEval", "GSM8K", "Reasoning & Logic"];
export const AGENTIC_TESTS = ["BFCL"];
export const LM_EVAL_TESTS = ["hellaswag", "MMLU-Pro", "GPQA Diamond", "LiveMCPBench", "Exercism", "GraphWalks", "SimpleQA", "SWE-bench", "HumanEval", "LSAT", "SAT", "AGIEval", "GSM8K", "BFCL"];
export const OLLAMA_INCOMPATIBLE = ["hellaswag", "GPQA Diamond", "LSAT", "SAT", "AGIEval"];

export const BENCHMARK_DESCRIPTIONS: Record<string, { title: string, measures: string, desc: string }> = {
  "Standard (Chat)": {
    title: "Standard (Chat)",
    measures: "Raw Generation Speed",
    desc: "A standard conversational workload that tests raw token generation speed (TPS) without heavy reasoning overhead."
  },
  "Context (NIAH)": {
    title: "Context (NIAH)",
    measures: "Memory Bandwidth & KV Cache",
    desc: "Needle In A Haystack: evaluates performance under heavy VRAM pressure by processing massive context windows."
  },
  "Latency (TTFT)": {
    title: "Latency (TTFT)",
    measures: "Prompt Processing Speed",
    desc: "Time-To-First-Token: exclusively measures how fast the model can process the prompt before generating."
  },
  "Canonical Suite": {
    title: "Canonical Suite",
    measures: "Standardized Hardware Stats",
    desc: "A locked sequence of Code, Math, and Logic tests. Un-editable to ensure 100% comparability globally."
  },
  "Code Generation": {
    title: "Code Generation",
    measures: "Syntax & Formatting Latency",
    desc: "Simulates intense IDE coding workloads with zero-shot python tasks."
  },
  "Reasoning & Logic": {
    title: "Reasoning & Logic",
    measures: "Formal Logic & Deduction",
    desc: "Tests deep reasoning, formal logic, and complex puzzle solving."
  },
  "Intelligence (LLM-as-a-Judge)": {
    title: "Intelligence (LLM-as-a-Judge)",
    measures: "Subjective Output Quality",
    desc: "Generates answers then uses a highly capable frontier model (e.g. Llama 3) to grade the output quality out of 5."
  },
  "hellaswag": {
    title: "HellaSwag",
    measures: "Commonsense NLI",
    desc: "Evaluates commonsense natural language inference (NLI) by selecting the most logical completion for a scenario."
  },
  "MMLU-Pro": {
    title: "MMLU-Pro",
    measures: "Advanced Multitask Reasoning",
    desc: "A rigorous, reasoning-focused benchmark with 12,000+ complex questions across 14 disciplines with 10 options per question."
  },
  "MMLU": {
    title: "MMLU",
    measures: "Massive Multitask Knowledge",
    desc: "57 academic subjects testing broad world knowledge and problem-solving. Accuracy per subject."
  },
  "GPQA Diamond": {
    title: "GPQA Diamond",
    measures: "Expert-Level Scientific Reasoning",
    desc: "Graduate-level Google-Proof Q&A in biology, chemistry, and physics."
  },
  "LiveMCPBench": {
    title: "LiveMCPBench",
    measures: "Model Context Protocol",
    desc: "Evaluates how effectively models navigate and utilize the Model Context Protocol (MCP) ecosystem."
  },
  "Exercism": {
    title: "Exercism",
    measures: "Code Agent Challenges",
    desc: "Real world code agent programming challenges across 5 languages."
  },
  "GraphWalks": {
    title: "GraphWalks",
    measures: "Multi-hop Reasoning",
    desc: "Multi-hop reasoning on graphs - tests true logical routing, not just memorization."
  },
  "SimpleQA": {
    title: "SimpleQA",
    measures: "OpenAI Factuality",
    desc: "Measuring short-form factuality with simple Q&A pairs. Highly resistant to hallucination masking."
  },
  "SWE-bench": {
    title: "SWE-bench",
    measures: "Real-World Software Resolution",
    desc: "Evaluates models on resolving real-world GitHub issues in Python repositories."
  },
  "HumanEval": {
    title: "HumanEval",
    measures: "Functional Programming Correctness",
    desc: "A strict coding benchmark that provides a complex Python function signature and docstring."
  },
  "LSAT": {
    title: "LSAT",
    measures: "Logical Reasoning",
    desc: "Evaluates rigorous logical reasoning, reading comprehension, and analytical reasoning."
  },
  "SAT": {
    title: "SAT",
    measures: "Standardized High-School Exam",
    desc: "Standardized testing evaluating reading, writing, and mathematics."
  },
  "AGIEval": {
    title: "AGIEval",
    measures: "Human-centric Cognition",
    desc: "Evaluates foundational models in contexts pertinent to human cognition (LSAT, SAT, GRE, GMAT)."
  },
  "GSM8K": {
    title: "GSM8K",
    measures: "Multi-step Procedural Math",
    desc: "Tests the model's ability to break down and solve math word problems using CoT reasoning."
  },
  "BFCL": {
    title: "BFCL",
    measures: "Function Calling Leaderboard",
    desc: "Comprehensive evaluation of function calling capabilities across multiple languages."
  }
};

export function getModelCompatibility(modelName: string, benchmarkType: string): { 
  compatible: boolean; 
  badge: string; 
  reason?: string; 
} {
  const name = modelName.toLowerCase();
  const isVision = name.includes("llava") || name.includes("vision") || name.includes("vl");
  const isBaseCodeOnly = name.includes("starcoder") || (name.includes("codellama") && !name.includes("instruct"));
  const isTiny = name.includes("0.5b") || name.includes("1.1b") || name.includes("tiny");

  // Code benchmarks
  if (CODE_TESTS.includes(benchmarkType) || benchmarkType === "Code Generation" || benchmarkType === "HumanEval" || benchmarkType === "SWE-bench" || benchmarkType === "Exercism") {
    if (isVision) return { compatible: false, badge: "Incompatible", reason: "Vision models are not structured for pure code generation." };
    if (isBaseCodeOnly) return { compatible: true, badge: "Code Specialized", reason: "Optimized for raw code synthesis and completion." };
    return { compatible: true, badge: "Code Capable", reason: "Instruct model capable of code generation." };
  }

  // Large Context / NIAH
  if (benchmarkType === "Context (NIAH)") {
    if (isTiny) return { compatible: false, badge: "Limited Context", reason: "Sub-1B models may struggle with large context window retention." };
    return { compatible: true, badge: "Context Capable" };
  }

  // Chat / LLM-as-a-Judge / Standardized Exams / Agentic
  if (isBaseCodeOnly) {
    return { compatible: false, badge: "Code Only (Incompatible with Chat)", reason: "Base code completion model; lacks instruction tuning for conversational reasoning and Q&A." };
  }

  if (isVision && (STANDARDIZED_TESTS.includes(benchmarkType) || INTELLIGENCE_TESTS.includes(benchmarkType))) {
    return { compatible: false, badge: "Vision Specialized", reason: "Vision model; text-only reasoning and standardized exams may underperform." };
  }

  return { compatible: true, badge: "Compatible" };
}

const DIFFICULTIES = ["Light", "Medium", "Heavy", "Stress"];

export function Benchmark() {
  const { toast } = useToast();
  const { 
    status, error, selectedModels, benchmarkType, difficulty, judgeModel, streams, intelligenceResults,
    datasetMode, customPrompts, results, telemetryHistory, logStream, customQuestionLimit, setCustomQuestionLimit,
    setSelectedModels, setBenchmarkType, setDifficulty, setJudgeModel, setDatasetMode, setCustomPrompts, runBenchmark, resetBenchmark, cancelBenchmark 
  } = useBenchmark();

  const [step, setStep] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [hideIncompatible, setHideIncompatible] = useState<boolean>(true);
  const [filterCompatibleModels, setFilterCompatibleModels] = useState<boolean>(true);
  const [testCategory, setTestCategory] = useState<"hardware" | "intelligence" | "canonical">(() => {
    if (benchmarkType === "Canonical Suite") return "canonical";
    return HARDWARE_TESTS.includes(benchmarkType) ? "hardware" : "intelligence";
  });

  const [availableModels, setAvailableModels] = useState<LocalModel[]>([]);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);

  const [hasPythonDeps, setHasPythonDeps] = useState<boolean>(true);
  const [isCheckingDeps, setIsCheckingDeps] = useState<boolean>(false);
  const [isInstallingDeps, setIsInstallingDeps] = useState<boolean>(false);

  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    invoke<LocalModel[]>("get_local_models").then(setAvailableModels).catch(console.error);
    invoke<SystemInfo>("get_system_info").then(setSysInfo).catch(console.error);
    invoke("get_settings").then(setSettings).catch(console.error);
  }, []);

  useEffect(() => {
    if (LM_EVAL_TESTS.includes(benchmarkType)) {
      setIsCheckingDeps(true);
      invoke<boolean>("check_python_dependencies")
        .then(res => {
          setHasPythonDeps(res);
          setIsCheckingDeps(false);
        })
        .catch(err => {
          console.error(err);
          setHasPythonDeps(false);
          setIsCheckingDeps(false);
        });
    } else {
      setHasPythonDeps(true);
    }
  }, [benchmarkType]);

  const handleInstallDeps = async () => {
    setIsInstallingDeps(true);
    try {
      await invoke("install_python_dependencies");
      setHasPythonDeps(true);
      toast("Dependencies successfully installed!", "success");
    } catch (err) {
      console.error(err);
      toast("Failed to install dependencies: " + err, "error");
    } finally {
      setIsInstallingDeps(false);
    }
  };

  const toggleModel = (name: string) => {
    if (selectedModels.includes(name)) {
      setSelectedModels(selectedModels.filter(m => m !== name));
    } else {
      setSelectedModels([...selectedModels, name]);
    }
  };

  const handleSelectBenchmark = (type: string, category: "hardware" | "intelligence" | "canonical") => {
    setBenchmarkType(type);
    setTestCategory(category);
    if (category === "canonical") {
      setStep(3); // canonical skips config
    } else {
      setStep(2);
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
        <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 mt-6 animate-in fade-in slide-in-from-bottom-2">
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

  // ---------------------------------------------------------------------------
  // Step 1: Benchmark Selection Grid
  // ---------------------------------------------------------------------------
  const renderStep1 = () => {
    const filterBySearch = (tests: string[]) => {
      let filtered = tests;
      if (hideIncompatible) {
        filtered = filtered.filter(t => !OLLAMA_INCOMPATIBLE.includes(t));
      }
      if (!searchQuery.trim()) return filtered;
      const lower = searchQuery.toLowerCase();
      return filtered.filter(t => 
        BENCHMARK_DESCRIPTIONS[t]?.title.toLowerCase().includes(lower) || 
        BENCHMARK_DESCRIPTIONS[t]?.desc.toLowerCase().includes(lower) ||
        BENCHMARK_DESCRIPTIONS[t]?.measures.toLowerCase().includes(lower)
      );
    };

    const filteredFeatured = filterBySearch(FEATURED_TESTS);
    const filteredCode = filterBySearch(CODE_TESTS);
    const filteredStandardized = filterBySearch(STANDARDIZED_TESTS);
    const filteredAgentic = filterBySearch(AGENTIC_TESTS);
    const filteredHardware = filterBySearch(HARDWARE_TESTS);
    const filteredIntelligence = filterBySearch(INTELLIGENCE_TESTS);

    const renderCategory = (title: string, tests: string[], icon: React.ReactNode, desc: string, categoryVal: "hardware" | "intelligence" | "canonical") => {
      if (tests.length === 0) return null;
      return (
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-medium text-white flex items-center gap-2">
            {icon}
            {title}
          </h2>
          <p className="text-sm text-neutral-400 mb-2">{desc}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {tests.map(t => (
              <Card 
                key={t}
                hoverable 
                innerClassName="p-5 flex flex-col gap-2 cursor-pointer h-full"
                onClick={() => handleSelectBenchmark(t, t === "Canonical Suite" ? "canonical" : categoryVal)}
              >
                <span className="font-bold text-lg text-white">{BENCHMARK_DESCRIPTIONS[t]?.title || t}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] uppercase tracking-wider text-brand-400 font-bold">Measures</span>
                  <span className="text-xs font-medium text-neutral-300">{BENCHMARK_DESCRIPTIONS[t]?.measures || "N/A"}</span>
                </div>
                <p className="text-sm text-neutral-400 mt-2 leading-relaxed">
                  {BENCHMARK_DESCRIPTIONS[t]?.desc || ""}
                </p>
              </Card>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4 duration-500">
        
        {/* Search Bar & Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-2">
          <div className="relative flex-1">
            <MagnifyingGlass className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search benchmarks by name, measure, or description..."
              className="w-full bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 py-4 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-brand-500/50 transition-colors shadow-inner"
            />
          </div>
          <button 
            onClick={() => setHideIncompatible(!hideIncompatible)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all",
              hideIncompatible 
                ? "bg-brand-500/10 border-brand-500/30 text-brand-300" 
                : "bg-white/5 border-white/10 text-neutral-400 hover:text-white"
            )}
          >
            <CheckCircle weight={hideIncompatible ? "fill" : "regular"} className={hideIncompatible ? "text-brand-400" : ""} />
            Ollama Compatible Only
          </button>
        </div>

        {renderCategory("Featured", filteredFeatured, <ShieldChevron className="w-6 h-6 text-brand-400" />, "Industry-leading frontier evaluations.", "intelligence")}
        {renderCategory("Code & Engineering", filteredCode, <Desktop className="w-6 h-6 text-brand-400" />, "Real-world coding and software architecture.", "intelligence")}
        {renderCategory("Standardized Exams", filteredStandardized, <CheckCircle className="w-6 h-6 text-brand-400" />, "High-school to graduate-level logic and reasoning.", "intelligence")}
        {renderCategory("Agentic & Tool Calling", filteredAgentic, <Brain className="w-6 h-6 text-brand-400" />, "Evaluating tool-use, function calling, and MCP.", "intelligence")}
        {renderCategory("Hardware & Raw Performance", filteredHardware, <Cpu className="w-6 h-6 text-brand-400" />, "Stress-test memory bandwidth, TTFT, and TPS.", "hardware")}
        {renderCategory("Custom Intelligence", filteredIntelligence, <Brain className="w-6 h-6 text-brand-400" />, "Use LLM-as-a-Judge for subjective output quality.", "intelligence")}

        {filteredFeatured.length === 0 && filteredCode.length === 0 && filteredStandardized.length === 0 && filteredAgentic.length === 0 && filteredHardware.length === 0 && filteredIntelligence.length === 0 && (
          <div className="text-center p-8 text-sm text-neutral-500 border border-dashed border-white/10 rounded-xl mt-4">
            No benchmarks found matching "{searchQuery}"
          </div>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Step 2: Configuration
  // ---------------------------------------------------------------------------
  const renderStep2 = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <Card innerClassName="p-6 flex flex-col gap-8">
        <div>
          <h2 className="text-xl font-medium text-white mb-2">Configure {BENCHMARK_DESCRIPTIONS[benchmarkType]?.title}</h2>
          <p className="text-sm text-neutral-400">Set the parameters for this benchmark execution.</p>
        </div>

        {INTELLIGENCE_TESTS.includes(benchmarkType) ? (
          <div className="flex flex-col gap-3">
            <label htmlFor="judge-model" className="text-xs text-brand-400 font-medium">Select Judge Model</label>
            <Dropdown 
              value={judgeModel}
              onChange={setJudgeModel}
              placeholder="Select a Judge Model..."
              options={[
                ...availableModels.map(m => ({ value: m.name, label: m.name })),
                { value: "llama3.2", label: "Recommended: llama3.2", description: "Auto-Pull if missing" },
                { value: "gemma2:9b", label: "Recommended: gemma2:9b", description: "Auto-Pull if missing" }
              ]}
            />
            <span className="text-[10px] text-neutral-500 mt-1">
              The judge model will evaluate the outputs of your selected models. If you select a recommended model you don't have, it will pull automatically.
            </span>
          </div>
        ) : LM_EVAL_TESTS.includes(benchmarkType) ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-brand-400 font-medium">Evaluation Depth (Sample Size)</label>
              <p className="text-xs text-neutral-500">Choose how many questions to evaluate from the dataset.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: "Light", name: "Quick Sample", count: "25 Questions", time: "~1 min", desc: "Fast sanity check" },
                { id: "Medium", name: "Standard", count: "100 Questions", time: "~5 mins", desc: "Recommended balance" },
                { id: "Heavy", name: "Thorough", count: "500 Questions", time: "~25 mins", desc: "High precision" },
                { id: "Stress", name: "Full Dataset", count: "All Questions", time: "Hours", desc: "Exhaustive evaluation" }
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => { setDifficulty(preset.id); setCustomQuestionLimit(undefined); }}
                  className={cn(
                    "flex flex-col p-4 rounded-xl border text-left transition-all",
                    difficulty === preset.id && customQuestionLimit === undefined
                      ? "bg-brand-500/10 border-brand-500/50 shadow-[0_0_15px_rgba(56,189,248,0.15)] text-white"
                      : "bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-sm">{preset.name}</span>
                    <span className="text-[10px] font-mono text-brand-400">{preset.time}</span>
                  </div>
                  <span className="text-xs text-brand-300 font-mono mb-1">{preset.count}</span>
                  <span className="text-[10px] text-neutral-500">{preset.desc}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 p-4 rounded-xl bg-black/30 border border-white/10 mt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-neutral-300 font-medium">Custom Question Count</label>
                {customQuestionLimit !== undefined && (
                  <button 
                    onClick={() => setCustomQuestionLimit(undefined)}
                    className="text-[11px] text-brand-400 hover:underline"
                  >
                    Reset to preset ({difficulty})
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="number"
                  min="1"
                  max="15000"
                  placeholder="e.g. 50"
                  value={customQuestionLimit ?? ""}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setCustomQuestionLimit(isNaN(val) || val <= 0 ? undefined : val);
                  }}
                  className="w-48 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-neutral-600 focus:outline-none focus:border-brand-500/50"
                />
                <span className="text-xs text-neutral-500">
                  {customQuestionLimit ? `Will evaluate exactly ${customQuestionLimit} questions.` : "Type an exact count (e.g. 10, 50, 200) or use presets above."}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 relative z-20">
              <label className="text-xs text-neutral-500 font-medium">Dataset Source</label>
              <div className="flex bg-neutral-900/50 p-1 rounded-lg border border-white/5">
                <button 
                  className={`flex-1 text-sm py-2 rounded-md transition-colors ${datasetMode === "standard" ? "bg-white/10 text-white font-medium shadow-sm" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                  onClick={() => { setDatasetMode("standard"); setCustomPrompts([]); }}
                >
                  Built-in
                </button>
                <button 
                  className={`flex-1 text-sm py-2 rounded-md transition-colors ${datasetMode === "custom_file" ? "bg-white/10 text-white font-medium shadow-sm" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                  onClick={() => { setDatasetMode("custom_file"); setCustomPrompts([]); }}
                >
                  Upload File
                </button>
                <button 
                  className={`flex-1 text-sm py-2 rounded-md transition-colors ${datasetMode === "builder" ? "bg-white/10 text-white font-medium shadow-sm" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                  onClick={() => { setDatasetMode("builder"); if (customPrompts.length === 0) setCustomPrompts([""]); }}
                >
                  Build In-App
                </button>
              </div>
            </div>

            {datasetMode === "standard" && (
              <div className="flex flex-col gap-3 relative z-10 w-full md:w-1/2">
                <label className="text-xs text-neutral-500 font-medium">Difficulty Preset</label>
                <Dropdown 
                  value={difficulty}
                  onChange={setDifficulty}
                  options={DIFFICULTIES.map(d => ({ value: d, label: d }))}
                />
              </div>
            )}

            {datasetMode === "custom_file" && (
              <div className="flex flex-col gap-3 relative z-10">
                <label className="text-xs text-neutral-500 font-medium">Upload Custom Dataset</label>
                <div className={`border border-dashed ${customPrompts.length > 0 ? "border-brand-500/50 bg-brand-500/5" : "border-white/20 hover:bg-white/5"} rounded-xl p-6 flex flex-col items-center justify-center text-center gap-2 transition-colors cursor-pointer relative overflow-hidden group`}>
                  <input type="file" accept=".json,.csv,.txt" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                  <FilePlus className={`w-8 h-8 transition-colors ${customPrompts.length > 0 ? "text-brand-400" : "text-neutral-500 group-hover:text-brand-400"}`} />
                  <span className={`text-sm ${customPrompts.length > 0 ? "text-brand-300 font-medium" : "text-neutral-400"}`}>
                    {customPrompts.length > 0 ? `${customPrompts.length} prompts loaded successfully.` : "Click or drag to upload .json, .csv, or .txt"}
                  </span>
                </div>
              </div>
            )}

            {datasetMode === "builder" && (
              <div className="flex flex-col gap-3 relative z-10">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-neutral-500 font-medium">Test Builder ({customPrompts.length} Prompts)</label>
                  <button 
                    onClick={() => setCustomPrompts([...customPrompts, ""])}
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 font-medium transition-colors"
                  >
                    <Plus weight="bold" /> Add Prompt
                  </button>
                </div>
                <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {customPrompts.map((prompt, idx) => (
                    <div key={idx} className="flex gap-2 items-start">
                      <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center text-xs text-neutral-500 flex-shrink-0 mt-2">
                        {idx + 1}
                      </div>
                      <textarea
                        value={prompt}
                        onChange={(e) => {
                          const newPrompts = [...customPrompts];
                          newPrompts[idx] = e.target.value;
                          setCustomPrompts(newPrompts);
                        }}
                        placeholder="Enter your prompt..."
                        className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-sm text-neutral-300 placeholder-neutral-600 focus:outline-none focus:border-brand-500/50 resize-y min-h-[60px]"
                      />
                      <button
                        onClick={() => {
                          const newPrompts = [...customPrompts];
                          newPrompts.splice(idx, 1);
                          setCustomPrompts(newPrompts);
                        }}
                        className="p-2 mt-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                      >
                        <Trash weight="bold" className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {customPrompts.length === 0 && (
                    <div className="text-center p-6 text-sm text-neutral-500 border border-dashed border-white/10 rounded-lg">
                      No prompts added. Click "Add Prompt" to begin.
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <div className="flex items-center justify-between mt-4">
        <Button variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft />}>Back</Button>
        <Button variant="primary" onClick={() => setStep(3)} icon={<ArrowRight />}>Continue</Button>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step 3: Model Selection
  // ---------------------------------------------------------------------------
  const renderStep3 = () => (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <Card innerClassName="p-6 flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-medium text-white mb-1">Select Target Models</h2>
            <p className="text-sm text-neutral-400">Choose which local models will run {BENCHMARK_DESCRIPTIONS[benchmarkType]?.title || benchmarkType}.</p>
          </div>
          <button
            onClick={() => setFilterCompatibleModels(!filterCompatibleModels)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors",
              filterCompatibleModels ? "bg-brand-500/10 border-brand-500/30 text-brand-300" : "bg-white/5 border-white/10 text-neutral-400 hover:text-white"
            )}
          >
            <CheckCircle weight={filterCompatibleModels ? "fill" : "regular"} className={filterCompatibleModels ? "text-brand-400" : ""} />
            Compatible Models Only
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {availableModels
            .filter(model => !filterCompatibleModels || getModelCompatibility(model.name, benchmarkType).compatible)
            .map(model => {
              const isSelected = selectedModels.includes(model.name);
              const compat = getModelCompatibility(model.name, benchmarkType);
              return (
                <button
                  key={model.name}
                  onClick={() => toggleModel(model.name)}
                  className={cn(
                    "flex flex-col text-left p-4 rounded-xl border transition-all duration-200 outline-none relative group",
                    isSelected 
                      ? "bg-brand-500/10 border-brand-500/50 shadow-[0_0_15px_rgba(56,189,248,0.15)]" 
                      : compat.compatible
                        ? "bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10"
                        : "bg-white/[0.02] border-white/5 opacity-60 hover:opacity-100"
                  )}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className={cn("font-medium truncate", isSelected ? "text-brand-300" : "text-white")}>{model.name}</span>
                    {isSelected && <CheckCircle weight="fill" className="text-brand-400 flex-shrink-0 w-5 h-5" />}
                  </div>

                  <div className="mb-2">
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded",
                      compat.compatible 
                        ? compat.badge.includes("Specialized") ? "bg-purple-500/20 text-purple-300" : "bg-green-500/20 text-green-300"
                        : "bg-orange-500/20 text-orange-300"
                    )}>
                      {compat.badge}
                    </span>
                    {compat.reason && !compat.compatible && (
                      <p className="text-[10px] text-neutral-500 mt-1 leading-tight">{compat.reason}</p>
                    )}
                  </div>

                  <div className="flex items-center flex-wrap gap-2 text-[10px] text-neutral-500 font-mono mt-auto pt-2 border-t border-white/5">
                    <span className="bg-white/5 px-1.5 py-0.5 rounded">{model.size}</span>
                    {model.parameter_size && <span className="bg-white/5 px-1.5 py-0.5 rounded">{model.parameter_size}</span>}
                    {model.quantization_level && <span className="bg-white/5 px-1.5 py-0.5 rounded">{model.quantization_level}</span>}
                  </div>
                </button>
              );
          })}
        </div>

        {getMemoryWarning()}

        {!hasPythonDeps && LM_EVAL_TESTS.includes(benchmarkType) && (
          <div className="flex flex-col gap-3 p-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mt-2 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 font-medium">
              <Warning className="w-5 h-5 flex-shrink-0" />
              Missing Python Dependencies
            </div>
            <span className="text-sm opacity-80 leading-relaxed">
              This advanced benchmark requires <code>lm-eval</code>, <code>requests</code>, and <code>openai</code> to be installed in your local Python environment.
            </span>
            <Button 
              variant="secondary" 
              onClick={handleInstallDeps} 
              disabled={isInstallingDeps}
              className="mt-2 w-fit bg-red-500/20 hover:bg-red-500/30 text-white border-red-500/30"
            >
              {isInstallingDeps ? "Installing (this may take a minute)..." : "Install Dependencies Now"}
            </Button>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between mt-4">
        <Button variant="secondary" onClick={() => setStep(testCategory === "canonical" ? 1 : 2)} icon={<ArrowLeft />}>Back</Button>
        <Button 
          variant="primary" 
          disabled={selectedModels.length === 0 || (!hasPythonDeps && LM_EVAL_TESTS.includes(benchmarkType)) || isCheckingDeps}
          onClick={runBenchmark}
          icon={<Cpu weight="fill" />}
          className="shadow-brand px-8"
        >
          {isCheckingDeps ? "Checking Requirements..." : "Start Benchmark"}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col gap-8 h-full overflow-y-auto custom-scrollbar">
      <header className="flex flex-col gap-4 border-b border-white/5 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-medium text-white tracking-tight">Run Benchmark</h1>
            <p className="text-sm text-neutral-400 mt-1">Configure and deploy workload simulations.</p>
          </div>
          {(status === "idle" || status === "error") && (
            <div className="flex items-center gap-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                    step === i ? "bg-brand-500 text-black shadow-[0_0_15px_rgba(56,189,248,0.5)]" : step > i ? "bg-brand-500/20 text-brand-400" : "bg-white/5 text-neutral-500"
                  )}>
                    {step > i ? <CheckCircle weight="bold" /> : i}
                  </div>
                  {i < 3 && <div className={cn("w-8 h-[2px]", step > i ? "bg-brand-500/50" : "bg-white/10")} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      {status === "idle" || status === "error" ? (
        <div className="w-full relative">
          {status === "error" && (
            <div className="flex flex-col gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
              <div className="flex items-center gap-2 font-medium">
                <Warning className="w-5 h-5 flex-shrink-0" />
                Benchmark Failed
              </div>
              <span className="text-sm opacity-80">{error}</span>
            </div>
          )}

          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </div>
      ) : status === "completed" && benchmarkType === "Intelligence (LLM-as-a-Judge)" ? (
        <div className="grid gap-6 animate-in fade-in zoom-in-95 duration-500">
          <h2 className="text-xl font-medium text-white mb-2">Intelligence Results</h2>
          {intelligenceResults.map(res => (
            <Card key={res.model} innerClassName="p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-lg text-white">{res.model}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-400 font-semibold">Score:</span>
                  <span className="text-3xl font-black text-brand-400">{res.score}<span className="text-lg text-brand-400/50">/5</span></span>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 mb-2 border-y border-white/5 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 font-semibold">Speed</span>
                  <span className="text-lg text-white font-mono">{res.metrics.tokens_per_sec.toFixed(1)} <span className="text-xs text-neutral-500">t/s</span></span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 font-semibold">Peak VRAM</span>
                  <span className="text-lg text-white font-mono">{res.metrics.vram_peak_gb.toFixed(1)} <span className="text-xs text-neutral-500">GB</span></span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-neutral-500 font-semibold">Peak Temp</span>
                  <span className="text-lg text-white font-mono">{res.metrics.temp_c.toFixed(0)} <span className="text-xs text-neutral-500">°C</span></span>
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-neutral-300 italic leading-relaxed">"{res.reasoning}"</p>
              </div>
            </Card>
          ))}
          <Button variant="secondary" onClick={() => { resetBenchmark(); setStep(1); }}>Run Another Benchmark</Button>
        </div>
      ) : status === "completed" && LM_EVAL_TESTS.includes(benchmarkType) ? (
        <div className="grid gap-6 animate-in fade-in zoom-in-95 duration-500">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-medium text-white">{BENCHMARK_DESCRIPTIONS[benchmarkType]?.title || benchmarkType} Results</h2>
            <span className="text-xs text-brand-400 bg-brand-500/10 border border-brand-500/20 px-3 py-1 rounded-full font-mono">
              {customQuestionLimit ? `${customQuestionLimit} Questions Evaluated` : `${difficulty} Preset`}
            </span>
          </div>

          {results.map((res, i) => {
            const accScore = res.tokens_per_sec;
            return (
              <Card key={i} innerClassName="p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-lg text-white">{res.model_name}</span>
                    <span className="text-xs text-neutral-400">Standardized Knowledge & Reasoning Benchmark</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">Accuracy:</span>
                    <span className="text-3xl font-black text-brand-400 font-mono">
                      {accScore > 0 ? `${accScore.toFixed(1)}%` : "Complete"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2 mb-2 border-y border-white/5 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">Benchmark Task</span>
                    <span className="text-sm text-white font-mono">{benchmarkType}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">Evaluation Sample</span>
                    <span className="text-sm text-white font-mono">{customQuestionLimit ? `${customQuestionLimit} Qs` : `${difficulty} Preset`}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">Status</span>
                    <span className="text-sm text-green-400 font-medium">Saved to Results History</span>
                  </div>
                </div>

                <div className="p-4 bg-brand-500/5 rounded-xl border border-brand-500/20 text-xs text-brand-300">
                  Detailed evaluation metrics and accuracy breakdown have been saved to your local database. Head over to the Results page to view full history or export a scorecard.
                </div>
              </Card>
            );
          })}

          <div className="flex gap-4 items-center mt-2">
            <Button variant="secondary" onClick={() => { resetBenchmark(); setStep(1); }}>Run Another Benchmark</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-500">
          {status === "running" && (
            <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full bg-brand-400" />
                <div>
                  <span className="text-sm font-medium text-white">Benchmark in Progress</span>
                  <p className="text-xs text-neutral-400">Live telemetry and evaluations are streaming below.</p>
                </div>
              </div>
              <Button 
                variant="secondary" 
                onClick={cancelBenchmark}
                icon={<XCircle className="w-4 h-4 text-red-400" />}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/30 text-xs px-4 py-2"
              >
                Cancel Benchmark
              </Button>
            </div>
          )}
          {selectedModels.map(model => {
            const stream = streams[model];
            const isDetailed = settings?.detailed_telemetry;
            const history = telemetryHistory[model] || [];
            const logs = logStream[model] || [];

            if (isDetailed) {
              const lastKnownTps = stream?.current_tps > 0 ? stream.current_tps : (history.length > 0 ? history[history.length - 1].tps : 0);
              const lastKnownVram = stream?.current_vram || (history.length > 0 ? history[history.length - 1].vram : 0);
              const lastKnownTemp = stream?.current_temp || (history.length > 0 ? history[history.length - 1].temp : 0);

              return (
                <Card key={model} innerClassName="p-6 relative overflow-hidden flex flex-col gap-6">
                  <div className="absolute top-0 left-0 h-1 bg-brand-500 transition-transform duration-300 ease-out w-full origin-left shadow-[0_0_10px_rgba(56,189,248,0.5)]" style={{ transform: `scaleX(${(stream?.progress_pct || 0) / 100})` }} />
                  
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-xl text-white font-medium flex items-center gap-2">
                        <ChartLineUp className="text-brand-400 w-6 h-6" />
                        {model}
                      </span>
                      <span className="text-sm text-neutral-400">{stream?.status || "Initializing telemetry..."}</span>
                    </div>
                    {stream && (
                      <div className="flex items-baseline gap-1 min-w-[80px] justify-end">
                        <span className="text-3xl text-brand-400 font-mono font-medium">{lastKnownTps.toFixed(1)}</span>
                        <span className="text-sm text-brand-400/70 uppercase font-bold tracking-wider">t/s</span>
                      </div>
                    )}
                  </div>

                  <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-2 h-48 bg-black/20 p-4 rounded-xl border border-white/5">
                      <span className="text-[10px] text-brand-400 font-bold tracking-widest uppercase">Throughput (TPS)</span>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <Tooltip content={<TelemetryTooltip unit="t/s" />} cursor={{ stroke: 'rgba(56, 189, 248, 0.2)', strokeDasharray: '3 3' }} />
                          <Line type="monotone" dataKey="tps" stroke="#38bdf8" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#38bdf8', stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
                          <YAxis domain={['auto', 'auto']} hide />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex flex-col gap-2 h-48 bg-black/20 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-green-400 font-bold tracking-widest uppercase">VRAM Allocation</span>
                        <span className="text-xs font-mono text-green-400/70">{lastKnownVram.toFixed(1)} GB</span>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <Tooltip content={<TelemetryTooltip unit="GB" />} cursor={{ stroke: 'rgba(74, 222, 128, 0.2)', strokeDasharray: '3 3' }} />
                          <Line type="stepAfter" dataKey="vram" stroke="#4ade80" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#4ade80', stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
                          <YAxis domain={[0, 'auto']} hide />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex flex-col gap-2 h-48 bg-black/20 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-orange-400 font-bold tracking-widest uppercase">GPU Temp</span>
                        <span className="text-xs font-mono text-orange-400/70">{lastKnownTemp.toFixed(0)} °C</span>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history}>
                          <Tooltip content={<TelemetryTooltip unit="°C" />} cursor={{ stroke: 'rgba(251, 146, 60, 0.2)', strokeDasharray: '3 3' }} />
                          <Line type="monotone" dataKey="temp" stroke="#fb923c" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#fb923c', stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
                          <YAxis domain={[0, 100]} hide />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="relative z-10 flex flex-col gap-2 mt-2">
                    <span className="text-[10px] text-neutral-500 font-bold tracking-widest uppercase">Live Process Log</span>
                    <div className="bg-black/40 border border-white/5 rounded-lg p-4 h-32 overflow-y-auto font-mono text-xs text-neutral-400 custom-scrollbar flex flex-col gap-1.5 shadow-inner">
                      {logs.map((l, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <span className="text-brand-500/50 flex-shrink-0">[{new Date(l.time).toLocaleTimeString()}]</span>
                          <span className="text-neutral-300 break-words">{l.msg}</span>
                        </div>
                      ))}
                      <div className="w-1.5 h-3.5 bg-brand-500 mt-1" />
                    </div>
                  </div>
                </Card>
              );
            }

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
          
          {status === "completed" && datasetMode !== "standard" && results.length > 0 && results.some(r => r.prompt_metrics && r.prompt_metrics.length > 0) && (
            <div className="flex flex-col gap-2 p-4 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-300 mt-4 animate-in fade-in slide-in-from-bottom-2">
              <span className="font-medium text-sm">Matrix Saved</span>
              <span className="text-xs opacity-80">
                The detailed per-prompt performance matrix has been saved to your Results history. Head over to the Results page to view the full breakdown.
              </span>
            </div>
          )}

          {status === "completed" && (
             <Button variant="secondary" className="mt-4 animate-in fade-in slide-in-from-bottom-2" onClick={() => { resetBenchmark(); setStep(1); }}>Run Another Benchmark</Button>
          )}
        </div>
      )}
    </div>
  );
}
