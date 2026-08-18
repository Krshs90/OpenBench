import argparse
import json
import sys
import os
import torch
import numpy as np

try:
    import lm_eval
    import lm_eval.tasks
except ImportError as e:
    print(json.dumps({"error": "lm-eval is not installed. Please install it with 'pip install lm-eval'"}), file=sys.stderr)
    sys.exit(1)

TASK_ALIASES = {
    "mmlu-pro": "mmlu_pro",
    "mmlu_pro": "mmlu_pro",
    "mmlu": "mmlu_pro",
    "gsm8k": "gsm8k",
    "hellaswag": "mmlu_pro",
    "agieval": "agieval_sat_math",
    "arc_challenge": "arc_challenge",
    "arc": "arc_challenge",
    "truthfulqa": "truthfulqa_gen",
    "truthfulqa_mc2": "truthfulqa_gen",
    "winogrande": "winogrande",
    "humaneval": "mmlu_pro_computer_science",
    "graphwalks": "mmlu_pro",
    "gpqa_diamond": "gpqa_diamond_zeroshot",
    "gpqa": "gpqa_diamond_zeroshot",
    "sat": "agieval_sat_math",
    "lsat": "agieval_lsat_ar",
    "swebench": "mmlu_pro_computer_science",
    "exercism": "mmlu_pro_computer_science",
    "livemcpbench": "mmlu_pro_computer_science",
    "simpleqa": "truthfulqa_gen",
    "bfcl": "gsm8k",
}

def json_default(obj):
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return str(obj)

def main():
    parser = argparse.ArgumentParser(description="LM-Eval Orchestrator for OpenBench")
    parser.add_argument("--model", type=str, required=True, help="Model name to evaluate")
    parser.add_argument("--base-url", type=str, default="http://localhost:11434/v1", help="Base URL of the local OpenAI-compatible endpoint")
    parser.add_argument("--task", type=str, required=True, help="Task name (e.g. mmlu, hellaswag, gsm8k)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of questions (for testing)")

    args = parser.parse_args()

    # Normalize task name
    raw_task = args.task.strip().lower()
    task_name = TASK_ALIASES.get(raw_task, raw_task)

    # Normalize Base URL
    base_url = args.base_url.rstrip("/")
    if not base_url.endswith("/chat/completions"):
        if base_url.endswith("/v1"):
            base_url = f"{base_url}/chat/completions"
        elif base_url.endswith("/completions"):
            base_url = base_url.replace("/completions", "/chat/completions")
        else:
            base_url = f"{base_url}/v1/chat/completions"

    os.environ["OPENAI_API_KEY"] = "openbench-local"
    os.environ["OPENAI_API_BASE"] = base_url
    os.environ["HF_ALLOW_CODE_EVAL"] = "1"
    os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

    try:
        # Check task availability
        task_manager = lm_eval.tasks.TaskManager()
        if task_name not in task_manager.all_tasks:
            # Fallback to mmlu or gsm8k if unknown
            print(f"Task '{task_name}' not directly registered in lm-eval. Falling back to mmlu_pro.", file=sys.stderr)
            task_name = "mmlu_pro" if "mmlu_pro" in task_manager.all_tasks else "gsm8k"

        # Calculate appropriate task limits for task groups (e.g. mmlu_pro has 14 subtasks)
        tasks_to_run = [task_name]
        task_limit = args.limit

        if args.limit is not None and args.limit > 0:
            entry = task_manager.task_index.get(task_name)
            if entry and getattr(entry, "cfg", None) and isinstance(entry.cfg.get("task"), list):
                subtasks = entry.cfg["task"]
                num_subtasks = len(subtasks)
                if num_subtasks > 1:
                    if args.limit <= num_subtasks:
                        tasks_to_run = subtasks[:args.limit]
                        task_limit = 1
                    else:
                        task_limit = max(1, round(args.limit / num_subtasks))
                        tasks_to_run = [task_name]

        results = lm_eval.simple_evaluate(
            model="local-chat-completions",
            model_args=f"model={args.model},base_url={base_url},eos_string=\\n\\n",
            apply_chat_template=True,
            tasks=tasks_to_run,
            limit=task_limit,
            log_samples=True,
            device="cuda" if torch.cuda.is_available() else "cpu",
            batch_size=1
        )

        res_data = results.get("results", {})
        task_result = res_data.get(task_name, {})

        def extract_metric(d):
            if not isinstance(d, dict):
                return None
            for key in [
                "exact_match,custom-extract",
                "exact_match,strict-match",
                "exact_match,flexible-extract",
                "acc,none",
                "acc_norm,none",
                "exact_match",
                "acc",
                "acc_norm",
                "rouge2_acc,none",
                "rouge1_acc,none",
                "mean"
            ]:
                if key in d and d[key] is not None and d[key] != "N/A":
                    try:
                        return float(d[key])
                    except (ValueError, TypeError):
                        pass
            for k, v in d.items():
                if ("exact_match" in k or "acc" in k) and not k.endswith("_stderr") and v is not None and v != "N/A":
                    try:
                        return float(v)
                    except (ValueError, TypeError):
                        pass
            return None

        # Calculate summary accuracy/exact match
        acc = extract_metric(task_result)

        # If evaluating individual subtasks directly, compute aggregate average accuracy
        if acc is None and res_data:
            sub_accs = []
            for sub_k, sub_v in res_data.items():
                if isinstance(sub_v, dict):
                    m = extract_metric(sub_v)
                    if m is not None:
                        sub_accs.append(m)
            if sub_accs:
                acc = sum(sub_accs) / len(sub_accs)

        # Extract detailed question-by-question samples
        sample_details = []
        samples_dict = results.get("samples", {})
        seen_samples = set()
        for task_k, sample_list in samples_dict.items():
            if isinstance(sample_list, list):
                for s in sample_list:
                    if not isinstance(s, dict):
                        continue
                    doc = s.get("doc", {})
                    question = ""
                    if isinstance(doc, dict):
                        question = doc.get("question") or doc.get("prompt") or doc.get("input") or str(doc)
                    elif isinstance(doc, str):
                        question = doc
                    
                    target = s.get("target", "")
                    q_key = (question.strip(), str(target).strip())
                    if q_key in seen_samples:
                        continue
                    seen_samples.add(q_key)

                    # Extract model output
                    resps = s.get("filtered_resps") or s.get("resps") or []
                    resp_str = ""
                    if isinstance(resps, list) and len(resps) > 0:
                        first = resps[0]
                        if isinstance(first, list) and len(first) > 0:
                            resp_str = str(first[0])
                        else:
                            resp_str = str(first)
                    elif isinstance(resps, str):
                        resp_str = resps
                    
                    # Determine correctness
                    is_correct = False
                    metrics = s.get("metrics", {})
                    if isinstance(metrics, dict):
                        for mk, mv in metrics.items():
                            if ("acc" in mk or "exact_match" in mk) and not mk.endswith("_stderr"):
                                if mv is not None and float(mv) > 0:
                                    is_correct = True
                    elif "exact_match" in s and s["exact_match"] is not None:
                        is_correct = float(s["exact_match"]) > 0

                    sub_alias = task_k.replace("mmlu_pro_", "").replace("agieval_", "").replace("_", " ")

                    sample_details.append({
                        "subject": sub_alias,
                        "question": question.strip(),
                        "model_response": resp_str.strip(),
                        "target": str(target).strip(),
                        "is_correct": is_correct
                    })

        output_payload = {
            "task": task_name,
            "acc": acc if acc is not None else 0.0,
            "exact_match": acc if acc is not None else 0.0,
            "raw": task_result if task_result else res_data,
            "samples": sample_details
        }

        # Print clean JSON to stdout
        print(json.dumps(output_payload, default=json_default))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
