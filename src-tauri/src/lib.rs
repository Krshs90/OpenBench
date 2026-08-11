use serde::{Deserialize, Serialize};
use std::process::Command;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use sysinfo::{System, CpuRefreshKind, RefreshKind, MemoryRefreshKind};
use walkdir::WalkDir;
use std::path::Path;
use std::time::{Instant, Duration};
use tauri::{Manager, Emitter, Window};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use futures_util::StreamExt;
use serde_json::Value;

static CANCEL_FLAG: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd
}
#[derive(Serialize)]
struct SystemInfo {
    cpu_name: String,
    ram_gb: f64,
    gpus: Vec<String>,
    vram_gb: f64,
}

#[derive(Serialize)]
struct LiveTelemetry {
    cpu_usage: f32,
    ram_usage_gb: f64,
    gpu_temp_c: f64,
    vram_usage_gb: f64,
}

#[derive(Serialize, Deserialize, Clone)]
struct LocalModel {
    name: String,
    size: String,
    format: String,
    status: String,
    path: String,
    engine: String,
    links: Vec<String>,
}

#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_cpu(CpuRefreshKind::everything()).with_memory(MemoryRefreshKind::everything())
    );
    sys.refresh_cpu_specifics(CpuRefreshKind::everything());
    
    let cpu_name = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_else(|| "Unknown CPU".to_string());
    let ram_gb = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    
    let mut gpus = Vec::new();
    let mut vram_gb = 0.0;
    
    if let Ok(output) = create_hidden_command("nvidia-smi")
        .args(&["--query-gpu=name,memory.total", "--format=csv,noheader"])
        .output() {
        if let Ok(s) = String::from_utf8(output.stdout) {
            for line in s.lines() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() == 2 {
                    gpus.push(parts[0].trim().to_string());
                    let vram_mb: f64 = parts[1].replace(" MiB", "").trim().parse().unwrap_or(0.0);
                    vram_gb += vram_mb / 1024.0;
                }
            }
        }
    }
    
    Ok(SystemInfo { cpu_name, ram_gb, gpus, vram_gb })
}

#[tauri::command]
async fn get_live_telemetry() -> Result<LiveTelemetry, String> {
    let mut sys = System::new_with_specifics(
        RefreshKind::nothing().with_cpu(CpuRefreshKind::everything()).with_memory(MemoryRefreshKind::everything())
    );
    sys.refresh_memory();
    let ram_usage_gb = sys.used_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    
    let (vram_usage_gb, gpu_temp_c) = get_nvidia_telemetry();
    
    Ok(LiveTelemetry {
        cpu_usage: 0.0,
        ram_usage_gb,
        vram_usage_gb,
        gpu_temp_c,
    })
}

#[tauri::command]
async fn get_local_models(app_handle: tauri::AppHandle) -> Result<Vec<LocalModel>, String> {
    let mut models = Vec::new();
    let home = std::env::var("USERPROFILE").unwrap_or_default();
    
    let lm_studio_path = format!("{}\\.cache\\lm-studio\\models", home);
    if Path::new(&lm_studio_path).exists() {
        for entry in WalkDir::new(lm_studio_path).into_iter().filter_map(|e| e.ok()) {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if ext == "gguf" || ext == "safetensors" || ext == "pt" || ext == "bin" || ext == "ckpt" {
                    let size_mb = entry.metadata().map(|m| m.len() as f64 / 1_048_576.0).unwrap_or(0.0);
                    let size_str = if size_mb > 1024.0 { format!("{:.1} GB", size_mb / 1024.0) } else { format!("{:.0} MB", size_mb) };
                    
                    let status = match ext {
                        "pt" | "bin" | "ckpt" => "DANGEROUS",
                        _ => "Safe",
                    };
                    
                    let filename = entry.file_name().to_string_lossy().to_string();
                    let hf_query = filename.replace(".gguf", "").replace(".safetensors", "");
                    
                    models.push(LocalModel {
                        name: filename,
                        size: size_str,
                        format: ext.to_uppercase(),
                        status: status.to_string(),
                        path: entry.path().to_string_lossy().to_string(),
                        engine: "LM Studio (Filesystem)".to_string(),
                        links: vec![format!("https://huggingface.co/search/full-text?q={}", hf_query)],
                    });
                }
            }
        }
    }
    
    if let Ok(output) = create_hidden_command("ollama").arg("list").output() {
        if let Ok(out_str) = String::from_utf8(output.stdout) {
            for line in out_str.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 3 {
                    let ollama_name = parts[0].to_string();
                    let base_name = ollama_name.split(':').next().unwrap_or(&ollama_name);
                    models.push(LocalModel {
                        name: ollama_name.clone(),
                        size: format!("{} {}", parts[2], parts.get(3).unwrap_or(&"")),
                        format: "Ollama".to_string(),
                        status: "Safe".to_string(),
                        path: "ollama-internal".to_string(),
                        engine: "Ollama".to_string(),
                        links: vec![
                            format!("https://ollama.com/library/{}", base_name),
                            format!("https://huggingface.co/models?search={}", base_name)
                        ],
                    });
                }
            }
        }
    }
    
    if let Ok(settings) = get_settings(app_handle.clone()).await {
        if !settings.custom_endpoints.is_empty() {
            let client = reqwest::Client::builder().timeout(Duration::from_secs(2)).build().unwrap();
            for endpoint in settings.custom_endpoints {
                let url = format!("{}/models", endpoint.trim_end_matches('/'));
                if let Ok(res) = client.get(&url).send().await {
                    if let Ok(json) = res.json::<Value>().await {
                        if let Some(data) = json.get("data").and_then(|v| v.as_array()) {
                            for m in data {
                                if let Some(id) = m.get("id").and_then(|v| v.as_str()) {
                                    models.push(LocalModel {
                                        name: id.to_string(),
                                        size: "Unknown".to_string(),
                                        format: "API".to_string(),
                                        status: "Safe".to_string(),
                                        path: endpoint.clone(),
                                        engine: "Custom Endpoint".to_string(),
                                        links: vec![format!("https://huggingface.co/models?search={}", id)],
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    if models.is_empty() {
        models.push(LocalModel {
            name: "Llama-3-8B-Instruct.gguf".to_string(),
            size: "4.7 GB".to_string(),
            format: "GGUF Q4".to_string(),
            status: "Not Found (Demo)".to_string(),
            path: "".to_string(),
            engine: "Demo".to_string(),
            links: vec!["https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct".to_string()],
        });
    }

    Ok(models)
}

#[tauri::command]
async fn get_ollama_version() -> Result<String, String> {
    if let Ok(output) = create_hidden_command("ollama").arg("-v").output() {
        if let Ok(out_str) = String::from_utf8(output.stdout) {
           
            let version = out_str.replace("ollama version is", "").trim().to_string();
            if !version.is_empty() {
                return Ok(version);
            }
        }
    }
    Err("Ollama not found".to_string())
}

#[derive(Serialize, Deserialize, Clone)]
struct PromptMetric {
    prompt: String,
    tokens_per_sec: f64,
    response: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct BenchmarkResult {
    model_name: String,
    tokens_per_sec: f64,
    vram_peak_gb: f64,
    temp_c: f64,
    response_text: Option<String>,
    prompt_metrics: Option<Vec<PromptMetric>>,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    model: String,
    status: String,
    current_tps: f64,
    progress_pct: f64,
    current_vram: Option<f64>,
    current_temp: Option<f64>,
}

fn get_nvidia_telemetry() -> (f64, f64) {
    let output = create_hidden_command("nvidia-smi")
        .args(&["--query-gpu=memory.used,temperature.gpu", "--format=csv,noheader,nounits"])
        .output();
    if let Ok(out) = output {
        if let Ok(s) = String::from_utf8(out.stdout) {
            if let Some(line) = s.lines().next() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() == 2 {
                    let vram_mb: f64 = parts[0].trim().parse().unwrap_or(0.0);
                    let temp_c: f64 = parts[1].trim().parse().unwrap_or(0.0);
                    return (vram_mb / 1024.0, temp_c);
                }
            }
        }
    }
    (0.0, 0.0)
}

async fn run_single_benchmark(window: Window, model_name: String, benchmark_type: String, prompt: String, engine: String, endpoint: String) -> Result<BenchmarkResult, String> {
    let _ = window.emit("benchmark-progress", ProgressPayload {
        model: model_name.clone(),
        status: "Warming up engine...".to_string(),
        current_tps: 0.0,
        progress_pct: 5.0,
        current_vram: None,
        current_temp: None,
    });

    CANCEL_FLAG.store(false, Ordering::SeqCst);

    let client = reqwest::Client::new();
    let start = Instant::now();
    
    let mut stream = if engine == "Ollama" {
        let _ = window.emit("benchmark-progress", ProgressPayload {
            model: model_name.clone(),
            status: "Preloading into VRAM...".to_string(),
            current_tps: 0.0,
            progress_pct: 2.0,
            current_vram: None,
            current_temp: None,
        });
        
        let preload_body = serde_json::json!({
            "model": model_name,
            "keep_alive": "5m"
        });
        let _ = client.post("http://localhost:11434/api/generate").json(&preload_body).send().await;
            
        let _ = window.emit("benchmark-progress", ProgressPayload {
            model: model_name.clone(),
            status: "Generating...".to_string(),
            current_tps: 0.0,
            progress_pct: 5.0,
            current_vram: None,
            current_temp: None,
        });

        let req_body = serde_json::json!({
            "model": model_name,
            "prompt": prompt,
            "stream": true
        });

        let res = client.post("http://localhost:11434/api/generate")
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

        if !res.status().is_success() {
            return Err(format!("Ollama error: {}", res.status()));
        }
        res.bytes_stream()
    } else {
        let req_body = serde_json::json!({
            "model": model_name,
            "messages": [{"role": "user", "content": prompt}],
            "stream": true
        });
        
        let url = format!("{}/chat/completions", endpoint.trim_end_matches('/'));
        let res = client.post(&url)
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to custom endpoint: {}", e))?;
            
        if !res.status().is_success() {
            return Err(format!("Endpoint error: {}", res.status()));
        }
        res.bytes_stream()
    };
    let mut tokens: u64 = 0;
    let mut first_token_time = None;
    let mut full_response = String::new();
    
    let mut peak_vram = 0.0;
    let mut peak_temp = 0.0;
    let mut last_emit = Instant::now();
    let mut last_tokens: u64 = 0;
    
    let mut custom_endpoint_token_estimate: u64 = 0;

    while let Some(chunk_res) = stream.next().await {
        if CANCEL_FLAG.load(Ordering::SeqCst) {
            return Err("Benchmark cancelled by user".to_string());
        }
        
        let chunk = chunk_res.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if line.is_empty() { continue; }
            
            if engine == "Ollama" {
                if let Ok(val) = serde_json::from_str::<Value>(line) {
                    if let Some(word) = val.get("response").and_then(|v| v.as_str()) {
                        if !word.is_empty() && first_token_time.is_none() {
                            first_token_time = Some(start.elapsed().as_secs_f64());
                            let _ = window.emit("benchmark-progress", ProgressPayload {
                                model: model_name.clone(),
                                status: format!("TTFT: {:.2}s. Generating...", first_token_time.unwrap()),
                                current_tps: 0.0,
                                progress_pct: 10.0,
                                current_vram: None,
                                current_temp: None,
                            });
                        }
                        if !word.is_empty() { 
                            tokens += 1; 
                            full_response.push_str(word);
                        }
                    }
                    if val.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                        if let Some(eval_count) = val.get("eval_count").and_then(|v| v.as_u64()) {
                             tokens = eval_count;
                        }
                    }
                }
            } else {
                let data_str = line.trim_start_matches("data: ").trim();
                if data_str == "[DONE]" { break; }
                if let Ok(val) = serde_json::from_str::<Value>(data_str) {
                    if let Some(choices) = val.get("choices").and_then(|c| c.as_array()) {
                        if let Some(delta) = choices.get(0).and_then(|c| c.get("delta")) {
                            if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                if !content.is_empty() && first_token_time.is_none() {
                                    first_token_time = Some(start.elapsed().as_secs_f64());
                                    let _ = window.emit("benchmark-progress", ProgressPayload {
                                        model: model_name.clone(),
                                        status: format!("TTFT: {:.2}s. Generating...", first_token_time.unwrap()),
                                        current_tps: 0.0,
                                        progress_pct: 10.0,
                                        current_vram: None,
                                        current_temp: None,
                                    });
                                }
                                if !content.is_empty() { 
                                    custom_endpoint_token_estimate += 1;
                                    tokens += 1; 
                                    full_response.push_str(content);
                                }
                            }
                        }
                    }
                    if let Some(usage) = val.get("usage") {
                        if let Some(comp_tokens) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                            tokens = comp_tokens;
                        }
                    }
                }
            }
        }
        
        let now = Instant::now();
        if now.duration_since(last_emit).as_millis() > 500 {
            let (vram, temp) = get_nvidia_telemetry();
            if vram > peak_vram { peak_vram = vram; }
            if temp > peak_temp { peak_temp = temp; }
            
            let current_tps = if tokens > last_tokens {
                (tokens - last_tokens) as f64 / (now.duration_since(last_emit).as_secs_f64().max(0.001))
            } else {
                0.0
            };
            
            let progress = (tokens as f64 / 300.0 * 100.0).clamp(10.0, 95.0); 
            
            let _ = window.emit("benchmark-progress", ProgressPayload {
                model: model_name.clone(),
                status: format!("VRAM: {:.1}GB | Temp: {:.0}°C", peak_vram, peak_temp),
                current_tps: current_tps.clamp(0.0, 200.0),
                progress_pct: progress,
                current_vram: Some(vram),
                current_temp: Some(temp),
            });
            
            last_emit = now;
            last_tokens = tokens;
        }
    }

    let duration = start.elapsed().as_secs_f64();
    let final_tps = tokens as f64 / duration.max(0.1);
    
    let (vram, temp) = get_nvidia_telemetry();
    if vram > peak_vram { peak_vram = vram; }
    if temp > peak_temp { peak_temp = temp; }
    

    let _ = window.emit("benchmark-progress", ProgressPayload {
        model: model_name.clone(),
        status: "Complete".to_string(),
        current_tps: final_tps,
        progress_pct: 100.0,
        current_vram: None,
        current_temp: None,
    });

    Ok(BenchmarkResult {
        model_name,
        tokens_per_sec: final_tps,
        vram_peak_gb: peak_vram,
        temp_c: peak_temp,
        response_text: Some(full_response),
        prompt_metrics: None,
    })
}

#[tauri::command]
async fn run_benchmark(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
    models: Vec<String>,
    benchmark_type: String,
    difficulty: String,
    custom_prompts: Option<Vec<String>>
) -> Result<Vec<BenchmarkResult>, String> {
    
    let all_models = get_local_models(app_handle.clone()).await.unwrap_or_default();
    
    let mut results = Vec::new();
    let mut handles = Vec::new();

    let base_prompt = match difficulty.as_str() {
        "Light" => "Explain the core mechanics of quantum entanglement in two simple paragraphs.",
        "Medium" => "Write a detailed, heavily-researched essay about the socioeconomic impacts of the Industrial Revolution on rural agrarian societies, including primary source citations.",
        "Heavy" => "Design a comprehensive, highly-detailed technical architecture document for a globally distributed, real-time multiplayer game server system. Include load-balancing strategies, database schemas, and failover mechanisms.",
        "Stress" => "Write an exhaustive, academic-level 10-chapter textbook covering the complete history, mathematics, and philosophical implications of artificial neural networks, from the Perceptron to modern Transformer architectures. Be as verbose and exhaustive as possible.",
        _ => "Explain quantum entanglement."
    };
    let prompts = match custom_prompts {
        Some(p) if !p.is_empty() => p,
        _ => {
            let p = match benchmark_type.as_str() {
                "Latency (TTFT)" => "Say hi".to_string(),
                "Context (NIAH)" => {
                    let filler = "The history of computational theory is replete with fascinating dead ends and brilliant breakthroughs. Alan Turing's theoretical machine laid the groundwork, while von Neumann's architecture provided the practical blueprint. The evolution of semiconductors allowed these abstract concepts to materialize in silicon. We must also consider the role of quantum states in future computing paradigms. ".repeat(match difficulty.as_str() {
                        "Light" => 150,
                        "Medium" => 500,
                        "Heavy" => 2000,
                        "Stress" => 8000,
                        _ => 200
                    });
                    format!("{} The secret code is ALBATROSS. {} What is the secret code?", filler, filler)
                },
                "Code Generation" => match difficulty.as_str() {
                    "Light" => "Write a simple, clean Python function that calculates the Levenshtein distance between two strings.",
                    "Medium" => "Write a complete, production-ready React hook (in TypeScript) that manages complex form state with asynchronous validation, field dependencies, and undo/redo history.",
                    "Heavy" => "Implement a fully functional, multithreaded web server from scratch in Rust using only the standard library (no external crates like Tokio or Hyper). Include connection pooling and HTTP/1.1 parsing.",
                    "Stress" => "Write the complete source code for a custom x86 bootloader and a minimalist 32-bit operating system kernel in C and Assembly. Include memory paging, hardware interrupts, and a simple VGA text mode driver.",
                    _ => "Write a Python script to scrape a website."
                }.to_string(),
                _ => base_prompt.to_string(),
            };
            vec![p]
        }
    };
    
    for model in models {
        let w = window.clone();
        let bt = benchmark_type.clone();
        let p_list = prompts.clone();
        
        let matched = all_models.iter().find(|m| m.name == model);
        let engine = matched.map(|m| m.engine.clone()).unwrap_or_else(|| "Ollama".to_string());
        let endpoint = matched.map(|m| m.path.clone()).unwrap_or_default();
        
        handles.push(tokio::spawn(async move {
            let mut total_tps = 0.0;
            let mut peak_vram = 0.0;
            let mut peak_temp = 0.0;
            let mut full_responses = Vec::new();
            let mut prompt_metrics = Vec::new();
            
            for (i, p) in p_list.iter().enumerate() {
                let _ = w.emit("benchmark-progress", ProgressPayload {
                    model: model.clone(),
                    status: format!("Running prompt {}/{}...", i + 1, p_list.len()),
                    current_tps: 0.0,
                    progress_pct: 5.0,
                    current_vram: None,
                    current_temp: None,
                });
                
                let res = run_single_benchmark(w.clone(), model.clone(), bt.clone(), p.clone(), engine.clone(), endpoint.clone()).await?;
                total_tps += res.tokens_per_sec;
                if res.vram_peak_gb > peak_vram { peak_vram = res.vram_peak_gb; }
                if res.temp_c > peak_temp { peak_temp = res.temp_c; }
                
                let res_text = res.response_text.unwrap_or_default();
                full_responses.push(res_text.clone());
                
                prompt_metrics.push(PromptMetric {
                    prompt: p.clone(),
                    tokens_per_sec: res.tokens_per_sec,
                    response: res_text,
                });
            }
            
            let avg_tps = total_tps / p_list.len() as f64;
            Ok::<BenchmarkResult, String>(BenchmarkResult {
                model_name: model.clone(),
                tokens_per_sec: avg_tps,
                vram_peak_gb: peak_vram,
                temp_c: peak_temp,
                response_text: Some(full_responses.join("\n---\n")),
                prompt_metrics: Some(prompt_metrics),
            })
        }));
    }
    
    let mut has_error = None;
    for handle in handles {
        if let Ok(res) = handle.await {
            match res {
                Ok(b) => results.push(b),
                Err(e) => has_error = Some(e),
            }
        }
    }
    
    if results.is_empty() {
        return Err(has_error.unwrap_or_else(|| "All benchmarks failed.".to_string()));
    }

    Ok(results)
}


#[derive(Serialize, Deserialize, Clone)]
struct SavedResult {
    id: String,
    model: String,
    hardware: String,
    speed: f64,
    vram: f64,
    temp: f64,
    score: i64,
    timestamp: u64,
    workload: Option<String>,
    benchmark_type: Option<String>,
    difficulty: Option<String>,
    reasoning: Option<String>,
    prompt_metrics: Option<Vec<PromptMetric>>,
}

fn get_db_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join("results.json"))
}

#[tauri::command]
async fn get_saved_results(app_handle: tauri::AppHandle) -> Result<Vec<SavedResult>, String> {
    let db_path = get_db_path(&app_handle)?;
    if !db_path.exists() {
        return Ok(Vec::new());
    }
    let content = std::fs::read_to_string(db_path).map_err(|e| e.to_string())?;
    let mut results: Vec<SavedResult> = serde_json::from_str(&content).unwrap_or_default();
    
    results.sort_by(|a, b| b.score.cmp(&a.score));
    
    Ok(results)
}

#[tauri::command]
async fn save_result(
    app_handle: tauri::AppHandle, 
    model: String, 
    speed: f64, 
    vram: f64, 
    temp: f64,
    workload: Option<String>,
    benchmark_type: Option<String>,
    difficulty: Option<String>,
    provided_score: Option<i64>,
    reasoning: Option<String>,
    prompt_metrics: Option<Vec<PromptMetric>>,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let mut results = get_saved_results(app_handle.clone()).await?;

    let score = if let Some(s) = provided_score {
        s
    } else {
        let mut raw_score = (speed * 10.0) + (100.0 - temp) - (vram * 5.0);
        if raw_score < 0.0 { raw_score = 0.0; }
        raw_score.round() as i64
    };
    
    let sys = get_system_info().await?;
    let hardware = format!("{} / {:.0} GB RAM", sys.cpu_name, sys.ram_gb);
    
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    let id = format!("{}-{}", timestamp, model);
    
    let new_result = SavedResult {
        id,
        model,
        hardware,
        speed,
        vram,
        temp,
        score,
        timestamp,
        workload,
        benchmark_type,
        difficulty,
        reasoning,
        prompt_metrics,
    };
    
    results.insert(0, new_result);
    
    let content = serde_json::to_string_pretty(&results).map_err(|e| e.to_string())?;
    std::fs::write(db_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn delete_result(app_handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    if !db_path.exists() {
        return Ok(());
    }
    let content = std::fs::read_to_string(&db_path).map_err(|e| e.to_string())?;
    let mut results: Vec<SavedResult> = serde_json::from_str(&content).unwrap_or_default();
    
    results.retain(|r| r.id != id);
    
    let content = serde_json::to_string_pretty(&results).map_err(|e| e.to_string())?;
    std::fs::write(db_path, content).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn delete_all_results(app_handle: tauri::AppHandle) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    if db_path.exists() {
        std::fs::remove_file(db_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}


#[derive(Serialize, Deserialize, Clone)]
struct AppSettings {
    auto_update: bool,
    preload_models: bool,
    custom_endpoints: Vec<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_update: true,
            preload_models: false,
            custom_endpoints: Vec::new(),
        }
    }
}

fn get_settings_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.join("settings.json"))
}

#[tauri::command]
async fn get_settings(app_handle: tauri::AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_path(&app_handle)?;
    if path.exists() {
        let content = std::fs::read_to_string(path).unwrap_or_default();
        if let Ok(settings) = serde_json::from_str(&content) {
            return Ok(settings);
        }
    }
    Ok(AppSettings::default())
}

#[derive(Serialize)]
struct ChatResponse {
    content: String,
    duration_secs: f64,
    tokens: usize,
    tokens_per_sec: f64,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

#[tauri::command]
async fn chat_ollama(window: Window, model: String, messages: Vec<ChatMessage>, endpoint: Option<String>) -> Result<ChatResponse, String> {
    let start = std::time::Instant::now();
    let client = reqwest::Client::new();
    
    let is_custom = endpoint.is_some() && !endpoint.as_ref().unwrap().is_empty();
    
    let mut res = if !is_custom {
        let req_body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true
        });
        
        client.post("http://localhost:11434/api/chat")
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to Ollama: {}", e))?
    } else {
        let ep = endpoint.unwrap();
        let url = format!("{}/chat/completions", ep.trim_end_matches('/'));
        let req_body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true
        });
        
        client.post(&url)
            .json(&req_body)
            .send()
            .await
            .map_err(|e| format!("Failed to connect to endpoint: {}", e))?
    };
    
    if !res.status().is_success() {
        return Err(format!("API error: {}", res.status()));
    }
    
    let mut duration_secs = 0.0;
    let mut tokens = 0;
    let mut content = String::new();
    
    while let Ok(Some(chunk)) = res.chunk().await {
        let chunk_str = String::from_utf8_lossy(&chunk);
        for line in chunk_str.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }
            
            let mut json_str = line;
            if json_str.starts_with("data: ") {
                json_str = &json_str[6..];
            }
            if json_str == "[DONE]" { continue; }

            if let Ok(json) = serde_json::from_str::<Value>(json_str) {
                let mut token_text = "";
                if !is_custom {
                    if let Some(msg) = json.get("message") {
                        if let Some(t) = msg.get("content").and_then(|c| c.as_str()) {
                            token_text = t;
                        }
                    }
                    if let Some(eval_count) = json.get("eval_count").and_then(|v| v.as_u64()) {
                        tokens = eval_count as usize;
                    }
                    if let Some(eval_duration) = json.get("eval_duration").and_then(|v| v.as_u64()) {
                        duration_secs = (eval_duration as f64) / 1_000_000_000.0;
                    }
                } else {
                    if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.get(0) {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(t) = delta.get("content").and_then(|c| c.as_str()) {
                                    token_text = t;
                                }
                            }
                        }
                    }
                }

                if !token_text.is_empty() {
                    content.push_str(token_text);
                    let _ = window.emit("playground-token", serde_json::json!({
                        "content": token_text,
                        "done": false
                    }));
                }
            }
        }
    }
    
    if tokens == 0 {
        tokens = content.split_whitespace().count();
    }
    if duration_secs == 0.0 {
        duration_secs = start.elapsed().as_secs_f64();
    }

    let tokens_per_sec = if duration_secs > 0.0 { (tokens as f64) / duration_secs } else { 0.0 };

    Ok(ChatResponse {
        content,
        duration_secs,
        tokens,
        tokens_per_sec,
    })
}

#[derive(Serialize, Deserialize, Clone)]
struct RunningModel {
    name: String,
    size: u64,
    size_vram: u64,
}

#[tauri::command]
async fn get_running_models() -> Result<Vec<RunningModel>, String> {
    let client = reqwest::Client::new();
    let res = client.get("http://localhost:11434/api/ps")
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Ollama error: {}", res.status()));
    }

    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    let mut models = Vec::new();
    
    if let Some(arr) = json.get("models").and_then(|v| v.as_array()) {
        for m in arr {
            models.push(RunningModel {
                name: m.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                size: m.get("size").and_then(|v| v.as_u64()).unwrap_or(0),
                size_vram: m.get("size_vram").and_then(|v| v.as_u64()).unwrap_or(0),
            });
        }
    }
    Ok(models)
}

#[tauri::command]
async fn unload_model(model: String) -> Result<(), String> {
    let client = reqwest::Client::new();
    let req_body = serde_json::json!({
        "model": model,
        "keep_alive": 0
    });
    
    let res = client.post("http://localhost:11434/api/generate")
        .json(&req_body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}", e))?;
        
    if !res.status().is_success() {
        return Err(format!("Failed to unload model: {}", res.status()));
    }
    
    Ok(())
}

#[tauri::command]
async fn pull_model(model: String) -> Result<(), String> {
    let status = create_hidden_command("ollama")
        .args(["pull", &model])
        .status()
        .map_err(|e| e.to_string())?;
        
    if status.success() { Ok(()) } else { Err("Failed to pull model".to_string()) }
}

#[derive(Serialize)]
struct IntelligenceResult {
    model: String,
    score: i64,
    reasoning: String,
    metrics: BenchmarkResult,
}

#[tauri::command]
async fn run_intelligence_benchmark(
    window: tauri::Window,
    app_handle: tauri::AppHandle,
    target_model: String, 
    judge_model: String,
    difficulty: String,
    custom_prompts: Option<Vec<String>>
) -> Result<IntelligenceResult, String> {
    
    let _ = create_hidden_command("ollama").args(["pull", &judge_model]).output();

    let all_models = get_local_models(app_handle.clone()).await.unwrap_or_default();
    let matched = all_models.iter().find(|m| m.name == target_model);
    let engine = matched.map(|m| m.engine.clone()).unwrap_or_else(|| "Ollama".to_string());
    let endpoint = matched.map(|m| m.path.clone()).unwrap_or_default();

    let base_prompt = "Write a short summary of the ocean.";
    let question = match custom_prompts {
        Some(p) if !p.is_empty() => p[0].clone(),
        _ => match difficulty.as_str() {
        "Light" => "Write a simple Python script to fetch the current weather from a public API.",
        "Medium" => "Implement a complete JWT authentication flow (Login, Register, Refresh Token) in Node.js and Express.",
        "Heavy" => "Write a robust, production-grade Kubernetes operator in Go that manages the lifecycle of a custom PostgreSQL cluster, including automated backups and replication.",
        "Stress" => "Design and implement a complete, distributed actor-model framework in C++20 with lock-free message queues, dynamic load balancing, and fault tolerance.",
        _ => "Write a script in Python."
        }.to_string(),
    };

    let metrics = run_single_benchmark(
        window.clone(),
        target_model.clone(),
        "Intelligence (LLM-as-a-Judge)".to_string(),
        question.clone(),
        engine,
        endpoint
    ).await?;
    
    let target_response = metrics.response_text.clone().unwrap_or_default();

    let _ = window.emit("benchmark-progress", ProgressPayload {
        model: target_model.clone(),
        status: format!("Waiting on Judge ({})...", judge_model),
        current_tps: 0.0,
        progress_pct: 95.0,
        current_vram: None,
        current_temp: None,
    });

    let client = reqwest::Client::new();
    
    let judge_prompt = format!(
        "You are an expert evaluator. The user asked: '{}'\nThe model answered: '{}'\nEvaluate the helpfulness and correctness. Output ONLY valid JSON in this format: {{\"reasoning\": \"your step by step thought process\", \"score\": X}} where X is 1 (wrong) to 5 (perfect).",
        question, target_response
    );
    
    let judge_body = serde_json::json!({
        "model": judge_model,
        "prompt": judge_prompt,
        "stream": false,
        "format": "json"
    });
    
    let res = client.post("http://localhost:11434/api/generate").json(&judge_body).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Err("Failed to prompt judge model".into()); }
    
    let judge_json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let judge_resp = judge_json.get("response").and_then(|v| v.as_str()).unwrap_or("");
    
    let parsed: serde_json::Value = serde_json::from_str(judge_resp).map_err(|_| "Judge failed to output valid JSON".to_string())?;
    
    let score = parsed.get("score").and_then(|v| v.as_i64()).unwrap_or(0);
    let reasoning = parsed.get("reasoning").and_then(|v| v.as_str()).unwrap_or("").to_string();
    
    let _ = window.emit("benchmark-progress", ProgressPayload {
        model: target_model.clone(),
        status: "Complete".to_string(),
        current_tps: metrics.tokens_per_sec,
        progress_pct: 100.0,
        current_vram: None,
        current_temp: None,
    });
    
    Ok(IntelligenceResult {
        model: target_model,
        score,
        reasoning,
        metrics,
    })
}


#[tauri::command]
async fn cancel_benchmark() {
    CANCEL_FLAG.store(true, Ordering::SeqCst);
}

#[tauri::command]
async fn check_app_updates(app_handle: tauri::AppHandle) -> Result<bool, String> {
    let client = reqwest::Client::new();
    let res = client.get("https://api.github.com/repos/Krshs90/OpenBench/releases/latest")
        .header("User-Agent", "OpenBench")
        .send().await.map_err(|e| e.to_string())?;
        
    if !res.status().is_success() { return Ok(false); }
    
    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let latest_tag = json.get("tag_name").and_then(|v| v.as_str()).unwrap_or("");
    
    let current_version = app_handle.package_info().version.to_string();
    let latest_clean = latest_tag.trim_start_matches('v');
    
    if !current_version.is_empty() && latest_clean != current_version && !latest_clean.is_empty() {
        return Ok(true);
    }
    
    Ok(false)
}

#[tauri::command]
async fn save_settings(app_handle: tauri::AppHandle, settings: AppSettings) -> Result<(), String> {
    let path = get_settings_path(&app_handle)?;
    let content = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    std::fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn save_file_to_disk(path: String, bytes: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, bytes).map_err(|e| format!("Failed to save file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_system_info, 
            get_local_models, 
            get_ollama_version,
            run_benchmark,
            get_saved_results,
            save_result,
            delete_result,
            delete_all_results,
            save_file_to_disk,
            get_settings,
            save_settings,
            chat_ollama,
            cancel_benchmark,
            get_running_models,
            unload_model,
            pull_model,
            save_file_to_disk,
            run_intelligence_benchmark,
            check_app_updates,
            get_live_telemetry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
