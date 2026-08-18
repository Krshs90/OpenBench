export interface LocalModel {
  name: string;
  size: string;
  format: string;
  family?: string;
  parameter_size?: string;
  quantization_level?: string;
  engine: string;
  path?: string;
  status?: string;
  links?: string[];
}

export interface RunningModel {
  name: string;
  size: number;
  size_vram: number;
}

export interface PromptMetric {
  prompt: string;
  tokens_per_sec: number;
  response: string;
}

export interface SavedResult {
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
  prompt_metrics?: PromptMetric[];
  ttft_ms?: number;
  prefill_rate?: number;
  tps_variance?: number;
  p90_latency_ms?: number;
  tool_call_count?: number;
  tps_history?: number[];
  vram_history?: number[];
  temp_history?: number[];
  gpu_platform?: string;
  quant_level?: string;
}
