import { useState, useEffect } from "react";
import { Card, cn } from "../components/Card";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend
} from "recharts";
import { invoke } from "@tauri-apps/api/core";
import { Spinner, CaretDown, DownloadSimple, Info } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";

interface SavedResult {
  id: string;
  model: string;
  speed: number;
  vram: number;
  temp: number;
  score: number;
  timestamp: number;
  workload?: string;
  benchmark_type?: string;
  difficulty?: string;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

export function Compare() {
  const [allResults, setAllResults] = useState<SavedResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chartType, setChartType] = useState<"radar" | "bar">("bar");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<SavedResult[]>("get_saved_results")
      .then(res => {
        setAllResults(res);
        if (res.length > 0) {
          setSelectedIds(res.slice(0, 3).map(r => r.id));
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center h-[60vh]">
        <Spinner className="animate-spin text-neutral-500 w-8 h-8" />
      </div>
    );
  }

  if (allResults.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center gap-6 h-[60vh]">
        <div className="text-neutral-500 text-center">
          <p>You need to run at least one benchmark to compare models.</p>
        </div>
        <Link to="/benchmark">
          <Button variant="primary">Run a Benchmark</Button>
        </Link>
      </div>
    );
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(i => i !== id);
      }
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  };

  const selectedResults = allResults.filter(r => selectedIds.includes(r.id));
  const activeBenchmarkType = selectedResults.length > 0 ? selectedResults[0].benchmark_type : null;
  const availableResults = activeBenchmarkType 
    ? allResults.filter(r => r.benchmark_type === activeBenchmarkType)
    : allResults;
  
  const maxSpeed = Math.max(...selectedResults.map(r => r.speed), 1);
  const maxVram = Math.max(...selectedResults.map(r => r.vram), 1);
  const maxScore = Math.max(...selectedResults.map(r => r.score), 1);

  const radarData = [
    { subject: 'Speed (t/s)', fullMark: 100 },
    { subject: 'VRAM Efficiency', fullMark: 100 },
    { subject: 'Thermal Profile', fullMark: 100 },
    { subject: 'Overall Score', fullMark: 100 },
  ];

  const standardData = selectedResults.map(r => ({
    name: r.model,
    Speed: r.speed,
    VRAM: r.vram,
    Score: r.score,
    Temp: r.temp
  }));

  selectedResults.forEach((model) => {
    (radarData[0] as any)[model.model] = Math.round((model.speed / maxSpeed) * 100);
    let vramEff = 100 - ((model.vram / Math.max(maxVram, 24)) * 100);
    (radarData[1] as any)[model.model] = Math.max(vramEff, 10);
    let tempEff = 100 - (((model.temp - 30) / 70) * 100);
    (radarData[2] as any)[model.model] = Math.max(tempEff, 10);
    (radarData[3] as any)[model.model] = Math.round((model.score / maxScore) * 100);
  });

  const exportImage = () => {
    const svg = document.querySelector('.recharts-wrapper svg');
    if (!svg) return;
    
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    
    const texts = clonedSvg.querySelectorAll("text");
    texts.forEach(t => {
      t.style.fontFamily = "Inter, sans-serif";
      t.style.fill = "#a3a3a3";
    });

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const DOMURL = window.URL || window.webkitURL || window;
    const url = DOMURL.createObjectURL(svgBlob);

    img.onload = () => {
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      if (ctx) {
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0);
      }
      const a = document.createElement("a");
      a.download = "openbench-comparison.jpg";
      a.href = canvas.toDataURL("image/jpeg", 1.0);
      a.click();
      DOMURL.revokeObjectURL(url);
    };
    img.src = url;
  };

  return (
    <div className="p-8 max-w-7xl mx-auto flex flex-col gap-8 h-full">
      <header className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-medium text-white tracking-tight flex items-center gap-2">
            Analytics Engine
            <div className="relative group cursor-help mt-1">
              <Info weight="fill" className="text-neutral-500 w-4 h-4 hover:text-white transition-colors" />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-neutral-900 border border-white/10 rounded-lg shadow-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-left font-sans">
                <p className="text-xs text-neutral-300 font-medium mb-1">Score Normalization</p>
                <p className="text-[10px] text-neutral-500 leading-relaxed">
                  Raw scores are calculated via <code className="text-brand-400 font-mono bg-black/50 px-1 rounded">(TPS * 10) + (100 - Temp) - (VRAM * 5)</code>. In this chart, they are normalized from 0-100 against the best model in the selection.
                </p>
              </div>
            </div>
          </h1>
          <p className="text-sm text-neutral-400 mt-1">Cross-examine your benchmark history.</p>
        </div>
        <Button variant="secondary" icon={<DownloadSimple />} onClick={exportImage} disabled={selectedResults.length === 0}>
          Export Chart (JPG)
        </Button>
      </header>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-6 z-10">
        <div className="flex flex-col gap-2 relative w-full md:w-96">
          <label htmlFor="compare-runs" className="text-xs  text-neutral-500 font-medium">Select Runs to Compare ({selectedIds.length}/8)</label>
          <div className="relative z-40 w-full">
            <Dropdown 
              value=""
              onChange={toggleSelection}
              placeholder="Select Runs to add..."
              options={availableResults.map(r => ({
                value: r.id,
                label: `${r.model} (${r.score} pts) ${r.benchmark_type ? `[${r.benchmark_type}]` : ''}`,
                description: `${r.workload || "Standard"} • ${new Date(r.timestamp * 1000).toLocaleDateString()}`
              }))}
            />
          </div>
          
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {selectedIds.map(id => {
                const r = allResults.find(a => a.id === id);
                return r ? (
                  <div key={id} className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-neutral-300 flex items-center gap-2">
                    {r.model} ({r.score} pts)
                    <button onClick={() => toggleSelection(id)} className="hover:text-white">&times;</button>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-1">
          <label className="text-xs  text-neutral-500 font-medium">Visualization Type</label>
          <div className="flex gap-2">
            {(["bar", "radar"] as const).map(type => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                className={cn(
                  "px-6 py-2.5 text-sm rounded-lg transition-colors border capitalize",
                  chartType === type 
                    ? "bg-white text-black border-white font-medium"
                    : "bg-white/5 text-neutral-400 border-white/10 hover:border-white/30"
                )}
              >
                {type} Chart
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <Card innerClassName="flex-1 min-h-[500px] flex flex-col p-8">
        {selectedResults.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-neutral-500">
            Select at least one benchmark to visualize.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chartType === "radar" ? (
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.05)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 500 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}
                  itemStyle={{ fontWeight: 500 }}
                />
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
                {selectedResults.map((r, index) => (
                  <Radar 
                    key={r.id}
                    name={r.model}
                    dataKey={r.model} 
                    stroke={COLORS[index % COLORS.length]} 
                    fill={COLORS[index % COLORS.length]} 
                    fillOpacity={0.2} 
                  />
                ))}
              </RadarChart>
            ) : (
              <BarChart data={standardData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                />
                <Legend wrapperStyle={{ paddingTop: "20px" }} />
                <Bar dataKey="Speed" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Score" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
