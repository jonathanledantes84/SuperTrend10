import React, { useState, useEffect, useCallback } from "react";
import { 
  Settings, 
  Play, 
  Square, 
  Activity, 
  History, 
  Terminal, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Cpu,
  ChevronRight
} from "lucide-react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { GoogleGenAI } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BotSettings {
  bybit_api_key: string;
  bybit_api_secret: string;
  symbol: string;
  interval: string;
  multiplier: number;
  period: number;
  trade_amount: number;
  is_running: number;
  testnet: number;
}

interface Log {
  id: number;
  timestamp: string;
  level: string;
  message: string;
}

interface Trade {
  id: number;
  timestamp: string;
  symbol: string;
  side: string;
  price: number;
  amount: number;
  status: string;
}

export default function App() {
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [marketStatus, setMarketStatus] = useState<{ price: number, superTrend: number, direction: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings" | "history" | "logs">("dashboard");
  const [isLoading, setIsLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [settingsRes, logsRes, tradesRes, marketRes] = await Promise.all([
        fetch("/api/settings"),
        fetch("/api/logs"),
        fetch("/api/trades"),
        fetch("/api/market/status")
      ]);
      
      const settingsData = await settingsRes.json();
      const logsData = await logsRes.json();
      const tradesData = await tradesRes.json();
      const marketData = await marketRes.json();
      
      setSettings(settingsData);
      setLogs(logsData);
      setTrades(tradesData);
      if (marketData && !marketData.error) {
        setMarketStatus(marketData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleToggleBot = async () => {
    if (!settings) return;
    const newStatus = settings.is_running === 0 ? 1 : 0;
    try {
      const res = await fetch("/api/bot/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_running: newStatus })
      });
      if (res.ok) {
        setSettings({ ...settings, is_running: newStatus });
      }
    } catch (error) {
      console.error("Error toggling bot:", error);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          multiplier: parseFloat(data.multiplier as string),
          period: parseInt(data.period as string),
          trade_amount: parseFloat(data.trade_amount as string),
          testnet: data.testnet === "on"
        })
      });
      if (res.ok) {
        fetchData();
        setActiveTab("dashboard");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
    }
  };

  const getAiAnalysis = async () => {
    if (!settings) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ parts: [{ text: `Analyze the current market sentiment for ${settings.symbol} on Bybit. The user is using a SuperTrend strategy with period ${settings.period} and multiplier ${settings.multiplier}. Provide a brief, professional outlook and potential risks.` }] }]
      });
      setAiAnalysis(response.text || "No analysis available.");
    } catch (error) {
      console.error("AI Analysis error:", error);
      setAiAnalysis("Failed to get AI analysis. Please check your API key.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-emerald-500 font-mono text-sm animate-pulse">INITIALIZING BYBIT BOT...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-[#111113] border-r border-zinc-800/50 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
            <TrendingUp className="text-black w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">SuperTrend <span className="text-emerald-500">Bot</span></h1>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <TabButton active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} icon={Activity} label="Dashboard" />
          <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")} icon={Settings} label="Configuration" />
          <TabButton active={activeTab === "history"} onClick={() => setActiveTab("history")} icon={History} label="Trade History" />
          <TabButton active={activeTab === "logs"} onClick={() => setActiveTab("logs")} icon={Terminal} label="System Logs" />
        </nav>

        <div className="p-4 border-t border-zinc-800/50">
          <div className={cn(
            "p-4 rounded-xl border transition-all duration-300",
            settings?.is_running ? "bg-emerald-500/5 border-emerald-500/20" : "bg-zinc-900 border-zinc-800"
          )}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Bot Status</span>
              <div className={cn(
                "w-2 h-2 rounded-full animate-pulse",
                settings?.is_running ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-zinc-600"
              )} />
            </div>
            <button 
              onClick={handleToggleBot}
              className={cn(
                "w-full py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95",
                settings?.is_running 
                  ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20" 
                  : "bg-emerald-500 text-black hover:bg-emerald-400"
              )}
            >
              {settings?.is_running ? <><Square size={16} fill="currentColor" /> Stop Bot</> : <><Play size={16} fill="currentColor" /> Start Bot</>}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="ml-64 p-8 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Market Overview</h2>
                  <p className="text-zinc-400 text-sm">Real-time monitoring for {settings?.symbol}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-xs font-mono text-zinc-400">
                    {settings?.testnet ? "TESTNET ENABLED" : "MAINNET ACTIVE"}
                  </div>
                  <button onClick={fetchData} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
                    <RefreshCw size={18} className="text-zinc-400" />
                  </button>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard 
                  label="Current Price" 
                  value={marketStatus?.price ? `$${marketStatus.price.toLocaleString()}` : "---"} 
                  subValue={settings?.symbol || "---"}
                  icon={Activity}
                  color="emerald"
                />
                <StatCard 
                  label="SuperTrend" 
                  value={marketStatus?.superTrend ? `$${marketStatus.superTrend.toLocaleString()}` : "---"} 
                  subValue={marketStatus?.direction === 1 ? "BULLISH" : marketStatus?.direction === -1 ? "BEARISH" : "---"}
                  icon={marketStatus?.direction === 1 ? TrendingUp : TrendingDown}
                  color={marketStatus?.direction === 1 ? "emerald" : "purple"}
                />
                <StatCard 
                  label="Total Trades" 
                  value={trades.length.toString()} 
                  subValue="Lifetime"
                  icon={History}
                  color="blue"
                />
              </div>

              {/* Chart Placeholder */}
              <div className="bg-[#111113] border border-zinc-800/50 rounded-2xl p-6 h-[400px] relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none" />
                <div className="flex items-center justify-between mb-6 relative z-10">
                  <h3 className="font-semibold flex items-center gap-2">
                    <TrendingUp size={18} className="text-emerald-500" />
                    Price Action & Indicators
                  </h3>
                  <div className="flex items-center gap-4 text-xs font-medium text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" /> Price
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-zinc-700" /> SuperTrend
                    </div>
                  </div>
                </div>
                <div className="h-full w-full flex items-center justify-center text-zinc-600 font-mono text-sm">
                  <div className="text-center space-y-2">
                    <Activity className="mx-auto opacity-20" size={48} />
                    <p>Live Chart Data Integration Pending...</p>
                    <p className="text-xs opacity-50">Monitoring {settings?.symbol} on {settings?.interval}m interval</p>
                  </div>
                </div>
              </div>

              {/* AI Analysis Section */}
              <div className="bg-gradient-to-br from-[#111113] to-[#161618] border border-zinc-800/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center">
                      <Cpu className="text-purple-500 w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold">AI Market Insight</h3>
                      <p className="text-zinc-500 text-xs">Powered by Gemini 2.0 Flash</p>
                    </div>
                  </div>
                  <button 
                    onClick={getAiAnalysis}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-semibold hover:bg-purple-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isAnalyzing ? <RefreshCw className="animate-spin" size={16} /> : <Cpu size={16} />}
                    {aiAnalysis ? "Refresh Analysis" : "Analyze Market"}
                  </button>
                </div>
                
                {aiAnalysis ? (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm leading-relaxed text-zinc-300"
                  >
                    {aiAnalysis}
                  </motion.div>
                ) : (
                  <div className="h-24 flex items-center justify-center border border-dashed border-zinc-800 rounded-xl text-zinc-600 text-sm">
                    Click analyze to get AI-powered market sentiment
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="max-w-2xl"
            >
              <div className="mb-8">
                <h2 className="text-2xl font-bold">Configuration</h2>
                <p className="text-zinc-400 text-sm">Manage your Bybit API keys and trading parameters</p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-8">
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">API Credentials</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Bybit API Key</label>
                      <input 
                        name="bybit_api_key" 
                        type="password"
                        defaultValue={settings?.bybit_api_key}
                        className="w-full bg-[#111113] border border-zinc-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                        placeholder="Enter your API key"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Bybit API Secret</label>
                      <input 
                        name="bybit_api_secret" 
                        type="password"
                        defaultValue={settings?.bybit_api_secret}
                        className="w-full bg-[#111113] border border-zinc-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                        placeholder="Enter your API secret"
                      />
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Trading Parameters</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Trading Pair</label>
                      <input 
                        name="symbol" 
                        defaultValue={settings?.symbol}
                        className="w-full bg-[#111113] border border-zinc-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Interval (Minutes)</label>
                      <select 
                        name="interval" 
                        defaultValue={settings?.interval}
                        className="w-full bg-[#111113] border border-zinc-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                      >
                        <option value="1">1m</option>
                        <option value="5">5m</option>
                        <option value="15">15m</option>
                        <option value="60">1h</option>
                        <option value="240">4h</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">SuperTrend Period</label>
                      <input 
                        name="period" 
                        type="number"
                        defaultValue={settings?.period}
                        className="w-full bg-[#111113] border border-zinc-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">SuperTrend Multiplier</label>
                      <input 
                        name="multiplier" 
                        type="number"
                        step="0.1"
                        defaultValue={settings?.multiplier}
                        className="w-full bg-[#111113] border border-zinc-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-zinc-400">Trade Amount (USDT)</label>
                      <input 
                        name="trade_amount" 
                        type="number"
                        step="0.01"
                        defaultValue={settings?.trade_amount}
                        className="w-full bg-[#111113] border border-zinc-800 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-8">
                      <input 
                        name="testnet" 
                        type="checkbox"
                        defaultChecked={settings?.testnet === 1}
                        className="w-5 h-5 rounded border-zinc-800 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/20"
                      />
                      <label className="text-sm font-medium text-zinc-400">Enable Testnet</label>
                    </div>
                  </div>
                </section>

                <button 
                  type="submit"
                  className="w-full py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all active:scale-[0.98]"
                >
                  Save Configuration
                </button>
              </form>
            </motion.div>
          )}

          {activeTab === "history" && (
            <motion.div 
              key="history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Trade History</h2>
                  <p className="text-zinc-400 text-sm">Recent execution logs for {settings?.symbol}</p>
                </div>
              </div>

              <div className="bg-[#111113] border border-zinc-800/50 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-900/50 border-b border-zinc-800/50">
                      <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Timestamp</th>
                      <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Symbol</th>
                      <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Side</th>
                      <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Price</th>
                      <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {trades.length > 0 ? trades.map((trade) => (
                      <tr key={trade.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="px-6 py-4 text-sm text-zinc-400 font-mono">
                          {format(new Date(trade.timestamp), "MMM dd, HH:mm:ss")}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium">{trade.symbol}</td>
                        <td className="px-6 py-4 text-sm">
                          <span className={cn(
                            "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
                            trade.side === "Buy" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {trade.side}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono">${trade.price.toLocaleString()}</td>
                        <td className="px-6 py-4 text-sm font-mono">{trade.amount}</td>
                        <td className="px-6 py-4 text-sm">
                          <div className="flex items-center gap-1.5 text-emerald-500">
                            <CheckCircle2 size={14} />
                            <span className="text-xs font-medium uppercase">{trade.status}</span>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-zinc-600 italic">
                          No trades executed yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "logs" && (
            <motion.div 
              key="logs"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">System Logs</h2>
                  <p className="text-zinc-400 text-sm">Real-time background process events</p>
                </div>
              </div>

              <div className="bg-[#050506] border border-zinc-800 rounded-2xl p-4 font-mono text-xs h-[600px] overflow-y-auto space-y-1 custom-scrollbar">
                {logs.length > 0 ? logs.map((log) => (
                  <div key={log.id} className="flex gap-4 py-1 border-b border-zinc-900/50 last:border-0 group">
                    <span className="text-zinc-600 whitespace-nowrap">[{format(new Date(log.timestamp), "HH:mm:ss")}]</span>
                    <span className={cn(
                      "font-bold uppercase w-12",
                      log.level === "error" ? "text-red-500" : log.level === "info" ? "text-blue-400" : "text-zinc-500"
                    )}>{log.level}</span>
                    <span className="text-zinc-300 group-hover:text-white transition-colors">{log.message}</span>
                  </div>
                )) : (
                  <div className="h-full flex items-center justify-center text-zinc-700 italic">
                    Waiting for system events...
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label }: { active: boolean, onClick: () => void, icon: any, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group",
        active 
          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
          : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
      )}
    >
      <Icon size={18} className={cn("transition-colors", active ? "text-emerald-500" : "text-zinc-500 group-hover:text-zinc-300")} />
      {label}
      {active && <ChevronRight size={14} className="ml-auto opacity-50" />}
    </button>
  );
}

function StatCard({ label, value, subValue, icon: Icon, color }: { label: string, value: string, subValue: string, icon: any, color: "emerald" | "blue" | "purple" }) {
  const colors = {
    emerald: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    blue: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    purple: "text-purple-500 bg-purple-500/10 border-purple-500/20"
  };

  return (
    <div className="bg-[#111113] border border-zinc-800/50 rounded-2xl p-6 hover:border-zinc-700 transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border", colors[color])}>
          <Icon size={20} />
        </div>
        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{subValue}</span>
      </div>
      <p className="text-zinc-500 text-xs font-medium mb-1">{label}</p>
      <h4 className="text-2xl font-bold tracking-tight group-hover:text-emerald-500 transition-colors">{value}</h4>
    </div>
  );
}
