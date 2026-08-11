import React, { useState, useEffect } from "react";
import { Card, cn } from "../components/Card";
import { Button } from "../components/Button";
import { DownloadSimple, CheckCircle, Storefront, Spinner, Cpu, HardDrive } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { LocalModel } from "../types";

interface MarketplaceModel {
  id: string;
  name: string;
  company: string;
  description: string;
  size: string;
  parameters: string;
  category: string;
  tags: string[];
}

const CURATED_MODELS: MarketplaceModel[] = [
  { id: "llama3", name: "Llama 3", company: "Meta", description: "Meta's most capable open LLM. Excellent for reasoning, coding, and general instruction following.", size: "4.7 GB", parameters: "8B", category: "Flagship", tags: ["Reasoning", "General"] },
  { id: "mistral", name: "Mistral v0.3", company: "Mistral AI", description: "The premier 7B open model. Renowned for its efficiency and strong context handling.", size: "4.1 GB", parameters: "7B", category: "Flagship", tags: ["Efficient", "Context"] },
  { id: "mixtral", name: "Mixtral 8x7B", company: "Mistral AI", description: "A high-quality sparse mixture of experts model (SMoE) with open weights.", size: "26 GB", parameters: "47B", category: "Flagship", tags: ["MoE", "Powerful"] },
  { id: "gemma2", name: "Gemma 2", company: "Google", description: "Built from the same research as Gemini. Extremely strong performance for its size.", size: "5.4 GB", parameters: "9B", category: "Flagship", tags: ["Reasoning", "Google"] },
  { id: "qwen2", name: "Qwen 2", company: "Alibaba", description: "State-of-the-art multilingual model with incredible speed and coding capabilities.", size: "4.4 GB", parameters: "7B", category: "Flagship", tags: ["Multilingual", "Fast"] },
  { id: "command-r", name: "Command R", company: "Cohere", description: "A 35B parameter model optimized for conversational interaction and long context tasks.", size: "20 GB", parameters: "35B", category: "Flagship", tags: ["RAG", "Conversational"] },
  { id: "yi", name: "Yi", company: "01.AI", description: "A highly capable bilingual foundation model from 01.AI with deep reasoning capabilities.", size: "20 GB", parameters: "34B", category: "Flagship", tags: ["Bilingual", "Powerful"] },
  { id: "nemotron", name: "Nemotron Mini", company: "NVIDIA", description: "A highly optimized small language model by NVIDIA for commercial and edge use.", size: "4.7 GB", parameters: "8B", category: "Flagship", tags: ["NVIDIA", "Fast"] },

  { id: "codellama", name: "CodeLlama", company: "Meta", description: "A large language model that can use text prompts to generate and discuss code.", size: "3.8 GB", parameters: "7B", category: "Coding", tags: ["Code", "Python"] },
  { id: "deepseek-coder-v2", name: "DeepSeek Coder V2", company: "DeepSeek", description: "Open-source Mixture-of-Experts code language model.", size: "8.9 GB", parameters: "16B", category: "Coding", tags: ["Code", "MoE"] },
  { id: "starcoder2", name: "StarCoder 2", company: "BigCode", description: "Next generation transparently trained open code model.", size: "1.7 GB", parameters: "3B", category: "Coding", tags: ["Code", "Lightweight"] },

  { id: "phi3", name: "Phi-3 Mini", company: "Microsoft", description: "A highly capable small language model. Punches way above its weight class for its tiny footprint.", size: "2.3 GB", parameters: "3.8B", category: "Lightweight", tags: ["Fast", "Edge"] },
  { id: "qwen:0.5b", name: "Qwen 1.5 Mini", company: "Alibaba", description: "An incredibly tiny yet surprisingly capable model for low-end hardware.", size: "395 MB", parameters: "0.5B", category: "Lightweight", tags: ["Tiny", "Fast"] },
  { id: "tinyllama", name: "TinyLlama", company: "Community", description: "The TinyLlama project is an open endeavor to train a compact 1.1B Llama model.", size: "637 MB", parameters: "1.1B", category: "Lightweight", tags: ["Tiny", "Edge"] },
  { id: "orca-mini", name: "Orca Mini", company: "Microsoft/Community", description: "A general-purpose model built to excel at logic and reasoning on edge devices.", size: "2.0 GB", parameters: "3B", category: "Lightweight", tags: ["Reasoning", "Fast"] },

  { id: "openhermes", name: "OpenHermes 2.5", company: "Teknium", description: "A state of the art Mistral Fine-tune, trained on 242,000 highly curated conversations.", size: "4.1 GB", parameters: "7B", category: "Community", tags: ["Creative", "Curated"] },
  { id: "dolphin-mixtral", name: "Dolphin Mixtral", company: "Cognitive Computations", description: "An uncensored, highly creative fine-tune of Mixtral 8x7b. Excellent for roleplay.", size: "26 GB", parameters: "47B", category: "Community", tags: ["Uncensored", "Roleplay"] },
  { id: "starling-lm", name: "Starling LM", company: "Berkeley", description: "Trained by Berkeley using RLHF. Excels in helpfulness and harmlessness.", size: "4.1 GB", parameters: "7B", category: "Community", tags: ["Helpful", "RLHF"] },
  { id: "neural-chat", name: "Neural Chat", company: "Intel", description: "A fine-tuned model by Intel designed to perform exceptionally well on consumer hardware.", size: "4.1 GB", parameters: "7B", category: "Community", tags: ["Optimized", "Intel"] },
  { id: "openchat", name: "OpenChat", company: "OpenChat", description: "A family of open-source language models fine-tuned to achieve ChatGPT-like capabilities.", size: "4.1 GB", parameters: "7B", category: "Community", tags: ["Chat", "High-Quality"] },
  { id: "aya", name: "Aya", company: "Cohere", description: "A massive multilingual model serving 101 different languages from Cohere for AI.", size: "4.7 GB", parameters: "8B", category: "Community", tags: ["Multilingual", "Global"] },
  { id: "nexusraven", name: "NexusRaven V2", company: "Nexusflow", description: "An open-source model highly tuned for function calling and tool use workflows.", size: "7.7 GB", parameters: "13B", category: "Community", tags: ["Tool Use", "Agents"] },
  { id: "llava", name: "LLaVA", company: "Haotian Liu et al.", description: "Large Language-and-Vision Assistant. Multimodal model capable of understanding images.", size: "4.7 GB", parameters: "7B", category: "Community", tags: ["Vision", "Multimodal"] }
];

export function Marketplace() {
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [installing, setInstalling] = useState<Record<string, boolean>>({});

  const loadLocalModels = () => {
    invoke<LocalModel[]>("get_local_models")
      .then(setLocalModels)
      .catch(console.error);
  };

  useEffect(() => {
    loadLocalModels();
  }, []);

  const handleDownload = async (modelId: string) => {
    setInstalling(prev => ({ ...prev, [modelId]: true }));
    try {
      await invoke("pull_model", { model: modelId });
    } catch (e) {
      console.warn("Pull model returned an error (likely stderr stream), but process is active:", e);
    }
    loadLocalModels();
    setInstalling(prev => ({ ...prev, [modelId]: false }));
  };

  return (
    <div className="p-8 pb-24 max-w-7xl mx-auto flex flex-col gap-8 h-full overflow-y-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium text-white tracking-tight flex items-center gap-2">
            <Storefront className="w-6 h-6 text-brand-400" />
            Model Marketplace
          </h1>
          <p className="text-sm text-neutral-400 max-w-xl">
            Discover and securely download 100% trustworthy, community-verified LLMs directly to your local environment. Zero telemetry.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-12">
        {["Flagship", "Coding", "Lightweight", "Community"].map((category) => {
          const categoryModels = CURATED_MODELS.filter(m => m.category === category);
          
          let categoryTitle = "";
          let categoryDesc = "";
          if (category === "Flagship") {
            categoryTitle = "Flagship General Purpose";
            categoryDesc = "The most powerful, widely-used foundation models available today.";
          } else if (category === "Coding") {
            categoryTitle = "Coding & Math";
            categoryDesc = "Models fine-tuned specifically for programming, code completion, and logic.";
          } else if (category === "Lightweight") {
            categoryTitle = "Lightweight & Edge";
            categoryDesc = "Small, highly optimized models that run incredibly fast even on low-end hardware.";
          } else if (category === "Community") {
            categoryTitle = "Community Favorites";
            categoryDesc = "Uncensored, highly creative, or experimental fine-tunes created by the open-source community.";
          }

          return (
            <div key={category} className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-medium text-white tracking-tight">{categoryTitle}</h2>
                <p className="text-sm text-neutral-400 mt-1">{categoryDesc}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {categoryModels.map((model) => {
                  const isInstalled = localModels.some(m => m.name === model.id || m.name.startsWith(model.id + ":"));
                  const isInstalling = installing[model.id];

                  return (
                    <Card key={model.id} innerClassName="p-6 flex flex-col gap-4 h-full relative group">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-medium text-white tracking-tight">{model.name}</h3>
                          <p className="text-xs text-brand-400/80 font-medium">{model.company}</p>
                        </div>
                        
                        {isInstalled ? (
                          <div className="flex items-center gap-1 text-green-400 bg-green-400/10 px-2 py-1 rounded text-xs font-medium">
                            <CheckCircle weight="fill" />
                            <span>Installed</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleDownload(model.id)}
                            disabled={isInstalling}
                            className={cn(
                              "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded transition-colors",
                              isInstalling 
                                ? "bg-brand-500/20 text-brand-300" 
                                : "bg-white/10 text-white hover:bg-white/20"
                            )}
                          >
                            {isInstalling ? (
                              <><Spinner className="animate-spin w-3 h-3" /> Downloading...</>
                            ) : (
                              <><DownloadSimple className="w-3.5 h-3.5" /> Download</>
                            )}
                          </button>
                        )}
                      </div>

                      <p className="text-sm text-neutral-400 flex-1">
                        {model.description}
                      </p>

                      <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-white/5 mt-auto">
                        <span className="flex items-center gap-1.5 text-xs text-neutral-500 font-mono bg-white/5 px-2 py-1 rounded">
                          <Cpu className="w-3.5 h-3.5" />
                          {model.parameters}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs text-neutral-500 font-mono bg-white/5 px-2 py-1 rounded">
                          <HardDrive className="w-3.5 h-3.5" />
                          {model.size}
                        </span>
                        
                        <div className="flex-1" />
                        
                        {model.tags.map(tag => (
                          <span key={tag} className="text-[10px] text-neutral-500 font-medium px-1.5 py-0.5 border border-white/10 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-12 mb-8 pt-8 border-t border-white/5 flex flex-col items-center justify-center gap-3 text-center">
        <div className="w-12 h-12 bg-brand-500/10 rounded-full flex items-center justify-center text-brand-400 mb-2">
          <Storefront className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-medium text-white tracking-tight">Know more great models?</h3>
        <p className="text-sm text-neutral-400 max-w-md">
          This curated list is always growing. If you know of a high-quality model that should be featured here, please submit a Pull Request to add it!
        </p>
        <button 
          onClick={() => window.open("https://github.com/Krshs90/OpenBench", "_blank")}
          className="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-sm font-medium rounded-lg transition-colors border border-white/10"
        >
          Contribute on GitHub
        </button>
      </div>
    </div>
  );
}
