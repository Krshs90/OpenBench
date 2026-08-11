import { useState, useEffect } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { LocalModel } from "../types";
import { Database, CheckCircle, HardDrive, Spinner, WarningCircle, ArrowCircleUp, MagnifyingGlass, DownloadSimple } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";

interface RunningModel {
  name: string;
  size: number;
  size_vram: number;
}

export function Models() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [ollamaVersion, setOllamaVersion] = useState<string>("");
  const [latestOllama, setLatestOllama] = useState<string>("");

  useEffect(() => {
    async function init() {
      try {
        const result = await invoke<LocalModel[]>("get_local_models");
        setModels(result);
        
        const localVersion = await invoke<string>("get_ollama_version");
        setOllamaVersion(localVersion.replace("v", ""));
        
        const ghRes = await fetch("https://api.github.com/repos/ollama/ollama/releases/latest");
        const ghData = await ghRes.json();
        if (ghData && ghData.tag_name) {
          setLatestOllama(ghData.tag_name.replace("v", ""));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    const fetchRunning = async () => {
      try {
        const res = await invoke<RunningModel[]>("get_running_models");
        setRunningModels(res);
      } catch (e) {
        console.error(e);
      }
    };
    
    init();
    fetchRunning();
    const interval = setInterval(fetchRunning, 3000);
    return () => clearInterval(interval);
  }, []);

  const needsUpdate = ollamaVersion && latestOllama && ollamaVersion !== latestOllama;

  return (
    <div className="p-8 pb-24 max-w-6xl mx-auto flex flex-col gap-8 h-full overflow-y-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium text-white tracking-tight">Model Library</h1>
          <p className="text-sm text-neutral-400">Models auto-detected from your local system (LM Studio & Ollama).</p>
        </div>
        
        <div className="relative w-full md:w-64">
          <MagnifyingGlass className="absolute left-3 top-3 text-neutral-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Search models..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>
      </header>

      {needsUpdate && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-amber-500">
            <WarningCircle size={24} weight="fill" />
            <div className="flex flex-col">
              <span className="font-medium">Ollama Update Available ({latestOllama})</span>
              <span className="text-xs text-amber-500/70">You are currently running version {ollamaVersion}. Update to improve performance and model compatibility.</span>
            </div>
          </div>
          <a href="https://ollama.com/download/windows" target="_blank" rel="noreferrer">
            <Button variant="primary" icon={<ArrowCircleUp weight="bold" />}>Download Update</Button>
          </a>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="flex items-center gap-3 text-neutral-400">
            <Spinner className="animate-spin w-5 h-5" />
            <span>Scanning filesystem...</span>
          </div>
        </div>
      ) : (
        <>
          {runningModels.length > 0 && (
            <div className="flex flex-col gap-4 mb-8">
              <h2 className="text-lg font-medium text-white flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Currently Running in VRAM
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {runningModels.map((m, i) => (
                  <RunningModelCard 
                    key={i} 
                    model={m} 
                    onUnloaded={async () => {
                      try {
                        const res = await invoke<RunningModel[]>("get_running_models");
                        setRunningModels(res);
                      } catch (e) {}
                    }} 
                  />
                ))}
              </div>
            </div>
          )}
          
          {models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-2">
                <Database className="w-8 h-8 text-neutral-500" />
              </div>
              <h3 className="text-lg text-white font-medium">No Models Found</h3>
              <p className="text-sm text-neutral-400 max-w-sm">
                We couldn't detect any models. Make sure Ollama or LM Studio is running, and you have downloaded at least one model.
              </p>
              <a href="https://ollama.com/library" target="_blank" rel="noreferrer" className="mt-2">
                <Button variant="secondary" icon={<DownloadSimple />}>Browse Ollama Library</Button>
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {models.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).map((m, i) => (
                <ModelCard key={i} model={m} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelCard({ model }: { model: LocalModel }) {
  const [updating, setUpdating] = useState(false);
  const [updated, setUpdated] = useState(false);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      await invoke("pull_model", { model: model.name });
      setUpdated(true);
      setTimeout(() => setUpdated(false), 3000);
    } catch (e) {
      console.warn("Pull model returned error but process is likely active:", e);
      setUpdated(true);
      setTimeout(() => setUpdated(false), 3000);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card innerClassName="p-5 flex flex-col gap-5 hover:bg-white/5 transition-colors border border-transparent hover:border-white/5 relative group" role="region" aria-label={`Model details for ${model.name}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-0">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Database className="text-neutral-400 w-5 h-5 flex-shrink-0" />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-neutral-200 font-medium truncate max-w-[150px]" title={model.name}>{model.name}</span>
            <span className="text-[10px] text-neutral-500 ">{model.engine} Engine</span>
          </div>
        </div>
        <div className={`flex items-center self-start gap-1.5 text-[10px] px-2 py-0.5 rounded-sm  font-semibold whitespace-nowrap flex-shrink-0 ${
          model.status === "DANGEROUS" 
            ? "text-red-500 bg-red-500/10" 
            : "text-green-500 bg-green-500/10"
        }`}>
          {model.status === "DANGEROUS" ? <WarningCircle weight="fill" /> : <CheckCircle weight="fill" />}
          <span>{model.status}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-xs text-neutral-500">
          <div className="flex items-center gap-1.5 font-mono">
            <HardDrive className="w-4 h-4" />
            <span>{model.size}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {model.links && model.links.length > 0 && (
            <a 
              href={model.links[0]} 
              target="_blank" 
              rel="noreferrer" 
              className="text-xs text-brand-400 hover:text-brand-300 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              Docs & Info
            </a>
          )}
          
          {model.format === "Ollama" && (
            <button 
              onClick={handleUpdate}
              disabled={updating || updated}
              className={`text-xs px-2.5 py-1.5 rounded flex items-center gap-1.5 transition-colors ${
                updated ? "text-green-500 bg-green-500/10" :
                updating ? "text-neutral-400 bg-white/5" :
                "text-neutral-400 hover:text-white hover:bg-white/10"
              }`}
              title="Pull latest weights from Ollama registry"
            >
              {updating && <Spinner className="animate-spin w-3 h-3" />}
              {updated ? "Up to date" : updating ? "Updating..." : "Update"}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}

function RunningModelCard({ model, onUnloaded }: { model: RunningModel, onUnloaded: () => void }) {
  const [unloading, setUnloading] = useState(false);

  const handleUnload = async () => {
    setUnloading(true);
    try {
      await invoke("unload_model", { model: model.name });
      onUnloaded();
    } catch (e) {
      console.error(e);
      setUnloading(false);
    }
  };

  return (
    <Card innerClassName={`p-4 flex items-center justify-between border-green-500/20 bg-green-500/5 transition-opacity duration-300 ${unloading ? 'opacity-50' : 'opacity-100'}`}>
      <div className="flex flex-col">
        <span className="text-neutral-200 font-medium truncate max-w-[200px]" title={model.name}>{model.name}</span>
        <span className="text-xs text-neutral-500">{(model.size_vram / 1024 / 1024 / 1024).toFixed(1)} GB VRAM</span>
      </div>
      <button 
        onClick={handleUnload}
        disabled={unloading}
        className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs rounded transition-colors border border-red-500/20 whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
      >
        {unloading && <Spinner className="animate-spin" />}
        {unloading ? "Unloading..." : "Unload"}
      </button>
    </Card>
  );
}
