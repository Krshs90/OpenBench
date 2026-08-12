import argparse
import json
import sys
import os
import torch

try:
    import lm_eval
except ImportError as e:
    print(json.dumps({"error": "lm-eval is not installed. Please install it with 'pip install lm-eval'"}), file=sys.stderr)
    sys.exit(1)

def main():
    parser = argparse.ArgumentParser(description="LM-Eval Orchestrator for OpenBench")
    parser.add_argument("--model", type=str, required=True, help="Model name to evaluate")
    parser.add_argument("--base-url", type=str, default="http://localhost:11434/v1/completions", help="Base URL of the local OpenAI-compatible endpoint")
    parser.add_argument("--task", type=str, required=True, help="Task name (e.g. mmlu, hellaswag)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of questions (for testing)")

    args = parser.parse_args()

    # The lm_eval library expects us to pass the model as a string like:
    # "local-completions", but we configure the environment variables so it points to our local endpoint.
    
    os.environ["OPENAI_API_KEY"] = "openbench-local"
    os.environ["OPENAI_API_BASE"] = args.base_url

    try:
        results = lm_eval.simple_evaluate(
            model="local-completions",
            model_args=f"model={args.model},base_url={args.base_url},tokenizer=gpt2",
            tasks=[args.task],
            limit=args.limit,
            device="cuda" if torch.cuda.is_available() else "cpu",
            batch_size=1
        )
        
        # simple_evaluate returns a dict. We just dump it as json.
        # Ensure we only print the JSON to stdout so Rust can parse it cleanly.
        
        print(json.dumps(results["results"]))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
