import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LocalModel, RunningModel } from "../types";

interface GlobalCacheContextType {
  models: LocalModel[];
  runningModels: RunningModel[];
  loadingModels: boolean;
  ollamaVersion: string;
  latestOllama: string;
  refreshModels: (force?: boolean) => Promise<void>;
  refreshRunningModels: () => Promise<void>;
}

const GlobalCacheContext = createContext<GlobalCacheContextType | undefined>(undefined);

export function GlobalCacheProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [runningModels, setRunningModels] = useState<RunningModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [ollamaVersion, setOllamaVersion] = useState<string>("");
  const [latestOllama, setLatestOllama] = useState<string>("");
  const [lastFetched, setLastFetched] = useState<number>(0);

  const CACHE_DURATION = 60000; // 60 seconds

  const refreshModels = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetched < CACHE_DURATION && models.length > 0) {
      // Use cached data
      setLoadingModels(false);
      return;
    }

    setLoadingModels(true);
    try {
      const result = await invoke<LocalModel[]>("get_local_models");
      setModels(result);
      setLastFetched(Date.now());
      
      const localVersion = await invoke<string>("get_ollama_version");
      setOllamaVersion(localVersion.replace("v", ""));
      
      try {
        const ghRes = await fetch("https://api.github.com/repos/ollama/ollama/releases/latest");
        const ghData = await ghRes.json();
        if (ghData && ghData.tag_name) {
          setLatestOllama(ghData.tag_name.replace("v", ""));
        }
      } catch (err) {
        console.warn("Failed to fetch latest Ollama release", err);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingModels(false);
    }
  }, [lastFetched, models.length]);

  const refreshRunningModels = useCallback(async () => {
    try {
      const res = await invoke<RunningModel[]>("get_running_models");
      setRunningModels(res);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    refreshModels();
    refreshRunningModels();

    // Setup polling for running models
    const interval = setInterval(refreshRunningModels, 3000);
    return () => clearInterval(interval);
  }, [refreshModels, refreshRunningModels]);

  return (
    <GlobalCacheContext.Provider value={{
      models,
      runningModels,
      loadingModels,
      ollamaVersion,
      latestOllama,
      refreshModels,
      refreshRunningModels
    }}>
      {children}
    </GlobalCacheContext.Provider>
  );
}

export function useGlobalCache() {
  const context = useContext(GlobalCacheContext);
  if (context === undefined) {
    throw new Error("useGlobalCache must be used within a GlobalCacheProvider");
  }
  return context;
}
