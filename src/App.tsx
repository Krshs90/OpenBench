import { HashRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Cpu, HardDrives, Speedometer, ChartLineUp, Database, Scales, Gear, TerminalWindow, Storefront } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "framer-motion";

import { Home } from "./pages/Home";
import { Models } from "./pages/Models";
import { Benchmark } from "./pages/Benchmark";
import { Results } from "./pages/Results";
import { Compare } from "./pages/Compare";
import { Settings } from "./pages/Settings";
import { Playground } from "./pages/Playground";
import { Marketplace } from "./pages/Marketplace";
import { BenchmarkProvider, useBenchmark } from "./context/BenchmarkContext";
import { GlobalCacheProvider } from "./context/GlobalCacheContext";
import { invoke } from "@tauri-apps/api/core";

function Sidebar() {
  const { status, streams, resetBenchmark } = useBenchmark();
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    invoke<any>("get_settings").then((settings) => {
      if (settings.auto_update) {
        invoke<boolean>("check_app_updates").then(setUpdateAvailable).catch(console.error);
      }
    }).catch(console.error);

    // Auto-load Ollama if it's not running
    invoke("start_engine", { engine: "Ollama" }).catch(() => {});
  }, []);
  
  const handleCancel = async () => {
    try {
      await invoke("cancel_benchmark");
    } catch (e) {
      console.error(e);
    }
    resetBenchmark();
  };

  const streamValues = Object.values(streams);
  const avgProgress = streamValues.length > 0 
    ? streamValues.reduce((acc, curr) => acc + curr.progress_pct, 0) / streamValues.length
    : 0;
  const currentAction = streamValues.length > 0 ? streamValues[0].status : "Initializing...";

  return (
    <div className="w-64 h-full border-r border-white/5 bg-black/20 flex flex-col p-6 gap-8">
      <div className="flex items-center gap-3">
        <span className="font-semibold tracking-tight text-xl"><span className="text-brand-500 text-2xl font-bold">Open</span>Bench</span>
      </div>
      
      <nav className="flex flex-col gap-2 flex-1">
        <SidebarLink to="/" icon={<HardDrives />} label="Dashboard" />
        <SidebarLink to="/models" icon={<Database />} label="Model Library" />
        <SidebarLink to="/marketplace" icon={<Storefront />} label="Marketplace" />
        <SidebarLink 
          to="/benchmark" 
          icon={<Cpu />} 
          label="Benchmark" 
        />
        <SidebarLink to="/playground" icon={<TerminalWindow />} label="Playground" />
        <SidebarLink to="/results" icon={<ChartLineUp />} label="Results" />
        <SidebarLink to="/compare" icon={<Scales />} label="Compare" />
        
        <div className="flex-1" />

        {status === "running" && (
          <div className="flex flex-col gap-3 p-4 bg-white/5 border border-white/10 rounded-xl mb-2 relative overflow-hidden">
            <div 
              className="absolute top-0 left-0 bottom-0 bg-brand-500/10 transition-transform duration-300 ease-out w-full origin-left" 
              style={{ transform: `scaleX(${avgProgress / 100})` }} 
            />
            
            <div className="relative z-10 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold  text-brand-400 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                  Running
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">{avgProgress.toFixed(0)}%</span>
              </div>
              <span className="text-xs text-neutral-300 truncate" title={currentAction}>{currentAction}</span>
              
              <button 
                onClick={handleCancel}
                aria-label="Cancel benchmark"
                className="mt-2 py-1.5 px-3 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 text-xs font-medium rounded-lg transition-colors w-full text-center border border-red-500/20"
              >
                Cancel Benchmark
              </button>
            </div>
          </div>
        )}

        <SidebarLink to="/settings" icon={<Gear />} label="Settings" badge={updateAvailable ? "Update" : undefined} />
      </nav>
    </div>
  );
}

function SidebarLink({ to, icon, label, badge }: { to: string; icon: React.ReactNode; label: string; badge?: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link 
      to={to} 
      className={`flex items-center justify-between px-4 py-3 rounded-xl transition-colors relative ${isActive ? 'bg-brand-500/10 text-brand-400 font-medium before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:bg-brand-500 before:rounded-r' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
    >
      <div className="flex items-center gap-3">
        <div className="w-5 h-5">{icon}</div>
        <span className="font-medium text-sm">{label}</span>
      </div>
      {badge && (
        <span className="text-[9px]  font-semibold bg-brand-500/20 text-brand-400 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
          {badge}
        </span>
      )}
    </Link>
  );
}

function AnimatedRoutes() {
  const location = useLocation();
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="h-full"
      >
        <Routes location={location}>
          <Route path="/" element={<Home />} />
          <Route path="/models" element={<Models />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/results" element={<Results />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}



function App() {
  return (
    <GlobalCacheProvider>
      <BenchmarkProvider>
        <Router>
          <div className="flex w-full h-screen overflow-hidden bg-background text-foreground selection:bg-brand-500/30">
            <Sidebar />
            <main className="flex-1 relative overflow-y-auto">
              <AnimatedRoutes />
            </main>
          </div>
        </Router>
      </BenchmarkProvider>
    </GlobalCacheProvider>
  );
}

export default App;
