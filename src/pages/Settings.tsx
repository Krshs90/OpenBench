import { useState, useEffect } from "react";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { FloppyDisk, Trash, ShieldCheck, Database, GitBranch } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "../components/Card";
import { SectionHeader } from "../components/SectionHeader";

interface AppSettings {
  auto_update: boolean;
  preload_models: boolean;
  custom_endpoints: string[];
}

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>({
    auto_update: true,
    preload_models: false,
    custom_endpoints: [],
  });
  
  const [loaded, setLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    invoke<AppSettings>("get_settings").then((res) => {
      setSettings(res);
      setLoaded(true);
      if (res.auto_update) {
        invoke<boolean>("check_app_updates").then(setUpdateAvailable).catch(console.error);
      }
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (loaded) {
      invoke("save_settings", { settings }).catch(console.error);
    }
  }, [settings, loaded]);

  const handleClearHistory = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000); // Reset after 3s
      return;
    }
    
    setClearing(true);
    setConfirmClear(false);
    try {
      await invoke("delete_all_results");
      setTimeout(() => setClearing(false), 500);
    } catch (e) {
      console.error(e);
      setClearing(false);
    }
  };

  return (
    <div className="p-8 pb-24 max-w-4xl mx-auto flex flex-col gap-8 h-full overflow-y-auto">
      <header className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-medium text-white tracking-tight">System Settings</h1>
          <p className="text-sm text-neutral-400 mt-1">Configure application behavior and data management. Settings are saved automatically.</p>
        </div>
      </header>

      {updateAvailable && (
        <div className="bg-brand-500/10 border border-brand-500/20 text-brand-300 p-4 rounded-xl flex items-center justify-between shadow-xl">
          <div className="flex flex-col gap-1">
            <span className="font-bold text-sm text-brand-400">OpenBench Update Available</span>
            <span className="text-xs opacity-90 leading-relaxed">A new version of OpenBench has been released! Update now for the latest features, bug fixes, and performance improvements.</span>
          </div>
          <a 
            href="https://github.com/Krshs90/OpenBench/releases/latest" 
            target="_blank" 
            rel="noopener noreferrer"
            className="px-4 py-2 bg-brand-500 text-black font-bold text-xs rounded-lg hover:bg-brand-400 transition-colors whitespace-nowrap ml-4"
          >
            Download Update
          </a>
        </div>
      )}

      <div className="grid gap-6">
        {/* Core Behavior */}
        <Card innerClassName="p-6 flex flex-col gap-6">
          <SectionHeader icon={<GitBranch className="text-neutral-400 w-5 h-5" />} title="Core Behavior" />
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-neutral-200 font-medium">Auto-Check for Updates</span>
              <span className="text-xs text-neutral-500">Automatically check GitHub for new OpenBench releases on boot.</span>
            </div>
            <Toggle 
              checked={settings.auto_update} 
              onChange={(v) => setSettings({ ...settings, auto_update: v })} 
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-neutral-200 font-medium">Preload Model Library</span>
              <span className="text-xs text-neutral-500">Aggressively scan filesystem on boot to make the Model Library page load instantly.</span>
            </div>
            <Toggle 
              checked={settings.preload_models} 
              onChange={(v) => setSettings({ ...settings, preload_models: v })} 
            />
          </div>
        </Card>

        {/* Engines & Providers */}
        <Card innerClassName="p-6 flex flex-col gap-6">
          <SectionHeader icon={<Database className="text-brand-400 w-5 h-5" />} title="Engines & Providers" />
          
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <span className="text-neutral-200 font-medium">Custom OpenAI-Compatible Endpoints</span>
              <span className="text-xs text-neutral-500 mb-2">Connect to local LM Studio, vLLM, or llama.cpp servers (e.g. `http://localhost:1234/v1`). Models will appear automatically in your Library.</span>
            </div>
            
            {settings.custom_endpoints.map((ep, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input 
                  type="text"
                  value={ep}
                  onChange={(e) => {
                    const newEndpoints = [...settings.custom_endpoints];
                    newEndpoints[idx] = e.target.value;
                    setSettings({ ...settings, custom_endpoints: newEndpoints });
                  }}
                  placeholder="http://localhost:1234/v1"
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white focus:border-brand-500 transition-colors"
                />
                <button 
                  onClick={() => {
                    const newEndpoints = settings.custom_endpoints.filter((_, i) => i !== idx);
                    setSettings({ ...settings, custom_endpoints: newEndpoints });
                  }}
                  aria-label="Remove endpoint"
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <Trash size={16} />
                </button>
              </div>
            ))}
            
            <button 
              onClick={() => setSettings({ ...settings, custom_endpoints: [...settings.custom_endpoints, ""] })}
              className="text-xs text-brand-400 hover:text-brand-300 self-start transition-colors"
            >
              + Add Custom Endpoint
            </button>
          </div>
        </Card>

        {/* Security */}
        <Card innerClassName="p-6 flex flex-col gap-6">
          <SectionHeader icon={<ShieldCheck className="text-green-500 w-5 h-5" />} title="Security Engine" />
          
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-200 font-medium">Malware Protection (Active)</span>
              <div className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px]  font-semibold rounded">Running</div>
            </div>
            <p className="text-xs text-neutral-500 leading-relaxed max-w-[65ch]">
              OpenBench automatically scans local filesystem models. Legacy formats (like `.ckpt` and `.pt`) which can execute arbitrary python payloads are flagged, while `.safetensors` and `.gguf` architectures are verified as safe.
            </p>
          </div>
        </Card>

        {/* Data Management */}
        <Card innerClassName="p-6 flex flex-col gap-6">
          <SectionHeader icon={<Database className="text-red-400 w-5 h-5" />} title="Data Management" />
          
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-neutral-200 font-medium text-red-400">Clear Benchmark History</span>
              <span className="text-xs text-neutral-500">Wipes all internal benchmark results and telemetry data permanently.</span>
            </div>
            <Button 
              variant={confirmClear ? "danger" : "secondary"} 
              icon={<Trash />} 
              onClick={handleClearHistory} 
              disabled={clearing}
            >
              {clearing ? "Cleared!" : confirmClear ? "Are you sure? Click again." : "Clear History"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) {
  return (
    <button 
      role="switch"
      aria-checked={checked ? "true" : "false"}
      onClick={() => onChange(!checked)}
      className={cn(
        "w-10 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative flex items-center",
        checked ? "bg-white" : "bg-neutral-700"
      )}
    >
      <div 
        className={cn(
          "w-4 h-4 rounded-full transition-transform duration-200 ease-in-out shadow-sm",
          checked ? "translate-x-5 bg-black" : "translate-x-0 bg-neutral-400"
        )}
      />
    </button>
  );
}
