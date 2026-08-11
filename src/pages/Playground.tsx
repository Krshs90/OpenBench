import React, { useState, useEffect, useRef } from "react";
import { Card, cn } from "../components/Card";
import { Button } from "../components/Button";
import { Dropdown } from "../components/Dropdown";
import { PaperPlaneRight, Spinner, CaretDown, CaretUp, ChatTeardropText, Lightning, Clock, Cpu, Trash } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { LocalModel } from "../types";

interface ChatResponse {
  content: string;
  duration_secs: number;
  tokens: number;
  tokens_per_sec: number;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  telemetry?: Omit<ChatResponse, "content">;
}

export function Playground() {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [showParams, setShowParams] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const responseEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<LocalModel[]>("get_local_models").then(m => {
      setModels(m);
      if (m && m.length > 0) setSelectedModel(m[0].name);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const setupListener = async () => {
      return await listen<{ content: string }>("playground-token", (event) => {
        setStreamingContent(prev => prev + event.payload.content);
      });
    };
    
    let unlistenFn: () => void;
    setupListener().then(f => unlistenFn = f);
    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || !selectedModel) return;
    
    const userPrompt = input;
    setInput("");
    
    const newMessages = [...messages, { role: "user", content: userPrompt } as Message];
    setMessages(newMessages);
    setLoading(true);
    
    const modelInfo = models.find(m => m.name === selectedModel);
    const endpoint = modelInfo && modelInfo.engine !== "Ollama" ? modelInfo.path : null;

    let chatMessages = [...newMessages];
    if (systemPrompt.trim()) {
      chatMessages = [{ role: "system", content: systemPrompt }, ...chatMessages];
    }
    
    const backendMessages = chatMessages.map(m => ({ role: m.role, content: m.content }));
    
    try {
      const res = await invoke<ChatResponse>("chat_ollama", { 
        model: selectedModel, 
        messages: backendMessages,
        endpoint
      });
      
      setMessages(prev => [
        ...prev, 
        { 
          role: "assistant", 
          content: res.content,
          telemetry: {
            duration_secs: res.duration_secs,
            tokens: res.tokens,
            tokens_per_sec: res.tokens_per_sec
          }
        }
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev, 
        { 
          role: "assistant", 
          content: `Error: ${err.toString()}` 
        }
      ]);
    } finally {
      setStreamingContent("");
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto flex flex-col gap-6 h-full">
      <header className="flex items-center justify-between border-b border-white/5 pb-6">
        <div>
          <h1 className="text-2xl font-medium text-white tracking-tight">Prompt Playground</h1>
          <p className="text-sm text-neutral-400 mt-1">Chat directly with models to test generation throughput.</p>
        </div>
        
        <div className="flex items-center gap-4 relative z-50">
          <div className="relative w-64 z-50">
            <Dropdown 
              value={selectedModel}
              onChange={setSelectedModel}
              placeholder="Select Model..."
              options={models.map(m => ({ value: m.name, label: m.name }))}
            />
          </div>
          <button 
            onClick={() => setMessages([])}
            disabled={messages.length === 0 || loading}
            title="Clear Conversation"
            aria-label="Clear conversation"
            className="p-2.5 bg-white/5 border border-white/10 rounded-lg text-neutral-400 hover:text-red-400 hover:border-red-400/30 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <Trash className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Parameters Panel */}
      <Card innerClassName="flex flex-col">
        <button 
          onClick={() => setShowParams(!showParams)}
          className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors text-sm text-neutral-300 font-medium"
        >
          <span>Generation Parameters</span>
          {showParams ? <CaretUp /> : <CaretDown />}
        </button>
        {showParams && (
          <div className="p-4 pt-0 border-t border-white/5 mt-2">
            <div className="flex flex-col gap-2 mt-4">
              <label className="text-xs  text-neutral-500 font-medium">System Prompt</label>
              <textarea 
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful AI assistant..."
                className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-brand-500 transition-colors resize-y h-24"
              />
            </div>
          </div>
        )}
      </Card>

      <Card innerClassName="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 pb-20">
          {messages.length === 0 && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-neutral-500 gap-4">
              <ChatTeardropText size={48} className="opacity-50" />
              <p>Type a prompt below to start generating tokens.</p>
            </div>
          )}
          
          {messages.map((msg, i) => (
            <MessageItem key={i} msg={msg} />
          ))}
          
          {streamingContent && (
            <MessageItem msg={{ role: "assistant", content: streamingContent }} />
          )}
          
          {loading && !streamingContent && (
            <div className="self-start p-4 text-neutral-400 flex items-center gap-3">
              <Spinner className="animate-spin w-5 h-5 text-brand-400" />
              <span className="text-sm">Model is computing...</span>
            </div>
          )}
          
          <div ref={responseEndRef} />
        </div>
        
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/5 bg-[#0a0a0a]">
          <div className="flex items-end gap-3 relative">
            <textarea 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Message local model... (Shift+Enter for new line)"
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-white/30 transition-colors resize-none overflow-hidden h-[54px] min-h-[54px] max-h-32"
              rows={1}
              style={{
                height: input ? `${Math.min(128, Math.max(54, input.split('\n').length * 24 + 30))}px` : '54px'
              }}
            />
            <Button 
              variant="primary" 
              className="h-[54px] px-6" 
              onClick={handleSend}
              disabled={loading || !input.trim() || !selectedModel}
              icon={loading ? <Spinner className="animate-spin" /> : <PaperPlaneRight weight="fill" />}
            >
              {loading ? "" : "Send"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

const MessageItem = React.memo(({ msg }: { msg: Message }) => {
  return (
    <div className={cn(
      "flex flex-col gap-2 max-w-[85%]",
      msg.role === "user" ? "self-end" : "self-start"
    )}>
      <div className={cn(
        "p-4 rounded-xl border text-sm whitespace-pre-wrap leading-relaxed",
        msg.role === "user" 
          ? "bg-white/5 border-white/5 rounded-br-sm text-white" 
          : "bg-brand-500/10 border-brand-500/20 rounded-bl-sm text-neutral-200"
      )}>
        {msg.content}
      </div>
      
      {msg.role === "assistant" && msg.telemetry && (
        <div className="flex items-center gap-4 text-[10px] font-semibold text-neutral-500 px-1">
          <span className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-brand-400" /> {msg.telemetry.duration_secs.toFixed(1)}s</span>
          <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3 text-brand-400" /> {msg.telemetry.tokens} tok</span>
          <span className="flex items-center gap-1.5 text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-sm"><Lightning className="w-3 h-3" weight="fill" /> {msg.telemetry.tokens_per_sec.toFixed(1)} TPS</span>
        </div>
      )}
    </div>
  );
});
