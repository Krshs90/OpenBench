use std::process::Command;
use std::time::Instant;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000);
    cmd
}

#[derive(Debug, Clone)]
struct CliResult {
    model: String,
    tokens_per_sec: f64,
    ttft_ms: f64,
    vram_gb: f64,
    temp_c: f64,
    workload: String,
}

fn detect_platform() -> &'static str {
    if create_hidden_command("nvidia-smi").arg("--query-gpu=name").arg("--format=csv,noheader").output().map(|o| o.status.success()).unwrap_or(false) {
        return "nvidia";
    }
    if create_hidden_command("rocm-smi").arg("--showid").output().map(|o| o.status.success()).unwrap_or(false) {
        return "amd";
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(out) = create_hidden_command("system_profiler").arg("SPDisplaysDataType").output() {
            if String::from_utf8_lossy(&out.stdout).contains("Apple M") {
                return "apple";
            }
        }
    }
    "cpu"
}

fn get_gpu_metrics(platform: &str) -> (f64, f64) {
    match platform {
        "nvidia" => {
            let out = create_hidden_command("nvidia-smi")
                .args(&["--query-gpu=memory.used,temperature.gpu", "--format=csv,noheader,nounits"])
                .output();
            if let Ok(o) = out {
                let s = String::from_utf8_lossy(&o.stdout);
                let parts: Vec<&str> = s.trim().split(',').collect();
                if parts.len() == 2 {
                    let vram: f64 = parts[0].trim().parse().unwrap_or(0.0);
                    let temp: f64 = parts[1].trim().parse().unwrap_or(0.0);
                    return (vram / 1024.0, temp);
                }
            }
            (0.0, 0.0)
        }
        "amd" => {
            (0.0, 0.0)
        }
        _ => (0.0, 0.0)
    }
}

fn get_workload_prompt(workload: &str, difficulty: &str) -> String {
    match workload {
        "latency" => "Say hi".to_string(),
        "code" => match difficulty {
            "light" => "Write a Python function to calculate Levenshtein distance with type hints.".to_string(),
            "hard" => "Implement a multithreaded HTTP/1.1 web server in Rust using only std.".to_string(),
            _ => "Write a Python function to reverse a linked list.".to_string(),
        },
        "reasoning" => match difficulty {
            "light" => "A train leaves at 9am at 60mph. Another leaves 800mi away at 10am at 80mph. When do they meet? Show work.".to_string(),
            "hard" => "Prove Cantor's diagonal argument in full mathematical rigor. What does it imply about the continuum hypothesis?".to_string(),
            _ => "What is 17 * 23? Show your work.".to_string(),
        },
        "math" => match difficulty {
            "light" => "Solve f(x) = 3x² - 7x + 2. Find all real roots. Show steps.".to_string(),
            "hard" => "Derive the Black-Scholes PDE from first principles using Ito's lemma.".to_string(),
            _ => "What is the derivative of sin(x²)?".to_string(),
        },
        _ => "Explain quantum entanglement in two paragraphs.".to_string(),
    }
}

async fn run_benchmark_cli(model: &str, workload: &str, difficulty: &str, endpoint: &str) -> Result<CliResult, String> {
    let prompt = get_workload_prompt(workload, difficulty);
    let client = reqwest::Client::new();
    let platform = detect_platform();
    let start = Instant::now();
    let mut first_token_time: Option<f64> = None;
    let mut tokens: u64 = 0;
    let mut prefill_count: u64 = 0;
    let mut prefill_ns: u64 = 0;

    let use_ollama = endpoint.is_empty() || endpoint == "ollama";
    let (vram_start, _) = get_gpu_metrics(platform);

    if use_ollama {
        let body = serde_json::json!({ "model": model, "prompt": prompt, "stream": true });
        let res = client.post("http://localhost:11434/api/generate")
            .json(&body).send().await.map_err(|e| e.to_string())?;
        
        let mut stream = res.bytes_stream();
        use futures_util::StreamExt;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            let text = String::from_utf8_lossy(&chunk);
            for line in text.lines() {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(word) = val.get("response").and_then(|v| v.as_str()) {
                        if !word.is_empty() && first_token_time.is_none() {
                            first_token_time = Some(start.elapsed().as_secs_f64());
                        }
                        if !word.is_empty() { tokens += 1; }
                    }
                    if val.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                        if let Some(c) = val.get("eval_count").and_then(|v| v.as_u64()) { tokens = c; }
                        if let Some(c) = val.get("prompt_eval_count").and_then(|v| v.as_u64()) { prefill_count = c; }
                        if let Some(d) = val.get("prompt_eval_duration").and_then(|v| v.as_u64()) { prefill_ns = d; }
                    }
                }
            }
        }
    }

    let duration = start.elapsed().as_secs_f64();
    let tps = tokens as f64 / duration.max(0.01);
    let ttft = first_token_time.unwrap_or(0.0) * 1000.0;
    let (vram_end, temp) = get_gpu_metrics(platform);
    let vram_used = (vram_end - vram_start).max(0.0);
    let _ = prefill_count;
    let _ = prefill_ns;

    Ok(CliResult {
        model: model.to_string(),
        tokens_per_sec: tps,
        ttft_ms: ttft,
        vram_gb: vram_used,
        temp_c: temp,
        workload: workload.to_string(),
    })
}

fn print_table(results: &[CliResult]) {
    println!("\n{:<30} {:<12} {:<12} {:<12} {:<12}", "Model", "Tokens/s", "TTFT (ms)", "VRAM (GB)", "Temp (°C)");
    println!("{}", "-".repeat(78));
    for r in results {
        println!("{:<30} {:<12.1} {:<12.0} {:<12.2} {:<12.0}", r.model, r.tokens_per_sec, r.ttft_ms, r.vram_gb, r.temp_c);
    }
    println!();
}

fn print_json(results: &[CliResult]) {
    let json: Vec<serde_json::Value> = results.iter().map(|r| {
        serde_json::json!({
            "model": r.model,
            "tokens_per_sec": r.tokens_per_sec,
            "ttft_ms": r.ttft_ms,
            "vram_gb": r.vram_gb,
            "temp_c": r.temp_c,
            "workload": r.workload
        })
    }).collect();
    println!("{}", serde_json::to_string_pretty(&json).unwrap());
}

fn print_hardware() {
    let platform = detect_platform();
    println!("GPU Platform: {}", platform);
    match platform {
        "nvidia" => {
            if let Ok(out) = create_hidden_command("nvidia-smi")
                .args(&["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"])
                .output() {
                let s = String::from_utf8_lossy(&out.stdout);
                for line in s.lines() {
                    let parts: Vec<&str> = line.split(',').collect();
                    if parts.len() >= 3 {
                        println!("GPU:    {}", parts[0].trim());
                        println!("VRAM:   {}", parts[1].trim());
                        println!("Driver: {}", parts[2].trim());
                    }
                }
            }
        }
        "amd" => {
            println!("AMD GPU detected. Install rocm-smi for full metrics.");
        }
        "apple" => {
            println!("Apple Silicon detected (unified memory).");
        }
        _ => {
            println!("No discrete GPU detected. Running on CPU.");
        }
    }
    if let Ok(out) = create_hidden_command("ollama").arg("-v").output() {
        let s = String::from_utf8_lossy(&out.stdout);
        let version = s.replace("ollama version is", "").trim().to_string();
        println!("Ollama: {}", version);
    } else {
        println!("Ollama: not found");
    }
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    
    if args.len() < 2 {
        eprintln!("OpenBench CLI v1.1.0");
        eprintln!("Usage:");
        eprintln!("  openbench run --model <name> [--workload standard] [--difficulty medium] [--output json]");
        eprintln!("  openbench compare --models <m1,m2,...> [--workload code] [--difficulty light]");
        eprintln!("  openbench hardware");
        std::process::exit(1);
    }

    match args[1].as_str() {
        "hardware" => {
            print_hardware();
        }
        "run" => {
            let model = args.iter().position(|a| a == "--model").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "llama3:8b".to_string());
            let workload = args.iter().position(|a| a == "--workload").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "standard".to_string());
            let difficulty = args.iter().position(|a| a == "--difficulty").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "medium".to_string());
            let output = args.iter().position(|a| a == "--output").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "table".to_string());
            let endpoint = args.iter().position(|a| a == "--endpoint").and_then(|i| args.get(i + 1)).cloned().unwrap_or_default();

            println!("Running {} benchmark on {} (difficulty: {})...", workload, model, difficulty);
            match run_benchmark_cli(&model, &workload, &difficulty, &endpoint).await {
                Ok(result) => {
                    if output == "json" { print_json(&[result]); }
                    else { print_table(&[result]); }
                }
                Err(e) => { eprintln!("Error: {}", e); std::process::exit(1); }
            }
        }
        "compare" => {
            let models_str = args.iter().position(|a| a == "--models").and_then(|i| args.get(i + 1)).cloned().unwrap_or_default();
            let models: Vec<&str> = models_str.split(',').collect();
            let workload = args.iter().position(|a| a == "--workload").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "standard".to_string());
            let difficulty = args.iter().position(|a| a == "--difficulty").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "medium".to_string());
            let output = args.iter().position(|a| a == "--output").and_then(|i| args.get(i + 1)).cloned().unwrap_or_else(|| "table".to_string());

            if models.is_empty() || models_str.is_empty() {
                eprintln!("Error: --models is required. Example: --models llama3:8b,mistral:7b");
                std::process::exit(1);
            }

            println!("Comparing {} models on {} benchmark (difficulty: {})...", models.len(), workload, difficulty);
            let mut results = Vec::new();
            for model in &models {
                println!("  Testing {}...", model);
                match run_benchmark_cli(model.trim(), &workload, &difficulty, "").await {
                    Ok(r) => results.push(r),
                    Err(e) => eprintln!("  Failed {}: {}", model, e),
                }
            }
            if output == "json" { print_json(&results); }
            else { print_table(&results); }
        }
        cmd => {
            eprintln!("Unknown command: {}. Use run, compare, or hardware.", cmd);
            std::process::exit(1);
        }
    }
}
