import { useState } from 'react';
import { LogEntry, AlertLogEntry } from '../types';
import { formatTimeUtcPlus6, formatDateTimeUtcPlus6 } from '../date-utils';
import { Terminal, ShieldAlert, ShieldCheck, AlertOctagon, Trash2, Clock, Smartphone, RefreshCw, Send } from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from './Skeleton';

interface SecurityLogsViewProps {
  logs: LogEntry[];
  alerts: AlertLogEntry[];
  onClearLogs: () => Promise<void>;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  loading?: boolean;
  hasApiKey?: boolean;
}

export default function SecurityLogsView({ logs, alerts, onClearLogs, onRefresh, refreshing, loading = false, hasApiKey = true }: SecurityLogsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'dns' | 'dispatch'>('dns');

  return (
    <div className="space-y-6" id="security-logs-container">
      {/* Tab select header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveSubTab('dns')}
            className={`px-4 py-2 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition ${
              activeSubTab === 'dns'
                ? 'bg-blue-600/10 text-blue-400 border border-blue-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal size={14} />
            Live Block logs
          </button>
          
          <button
            onClick={() => setActiveSubTab('dispatch')}
            className={`px-4 py-2 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition ${
              activeSubTab === 'dispatch'
                ? 'bg-purple-600/10 text-purple-400 border border-purple-500/25'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send size={14} />
            Alert Dispatch Audits ({alerts.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition shrink-0"
            title="Refresh logs"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={onClearLogs}
            className="flex items-center gap-1.5 bg-red-950/40 hover:bg-red-500/15 border border-red-500/20 text-red-400 px-3 py-2 rounded-xl text-xs font-semibold transition"
          >
            <Trash2 size={13} />
            Clear logs
          </button>
        </div>
      </div>

      {activeSubTab === 'dns' ? (
        // 1. Live DNS Logs Tab
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal size={14} className="text-blue-400" />
              NextDNS Traffic Monitor Stream
            </h3>
            <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded font-mono">
              Auto-Polling active
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-900 rounded-xl overflow-hidden shadow-inner">
            {loading ? (
              <Skeleton variant="table-row" count={8} />
            ) : !hasApiKey ? (
              <div className="p-12 text-center space-y-2">
                <Terminal className="mx-auto text-amber-500/80" size={32} />
                <p className="text-sm font-semibold text-amber-300">NextDNS Account Disconnected</p>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">Please enter your NextDNS API key in Settings to stream real-time block and query logs.</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-1">
                <Terminal className="mx-auto text-slate-700" size={32} />
                <p className="text-sm font-semibold">No active logs yet</p>
                <p className="text-xs">Queries blocked or analyzed by NextDNS will stream here in real-time.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-900 max-h-[500px] overflow-y-auto">
                {logs.map((log, idx) => {
                  const isBlocked = log.status === 'blocked';
                  const isWatchlist = log.matchedRule?.toLowerCase().includes('watchlist');

                  return (
                    <motion.div
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                      key={log.id}
                      className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition ${
                        isWatchlist 
                          ? 'bg-amber-950/10 hover:bg-amber-950/20 border-l-2 border-amber-500' 
                          : isBlocked 
                            ? 'hover:bg-slate-900/40 border-l-2 border-red-500/60' 
                            : 'hover:bg-slate-900/20 border-l-2 border-emerald-500/60'
                      }`}
                    >
                      {/* Left: Indicator, Domain, Subtext */}
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {isWatchlist ? (
                            <div className="p-1.5 bg-amber-500/10 text-amber-500 rounded-lg animate-pulse">
                              <AlertOctagon size={14} />
                            </div>
                          ) : isBlocked ? (
                            <div className="p-1.5 bg-red-500/10 text-red-400 rounded-lg">
                              <ShieldAlert size={14} />
                            </div>
                          ) : (
                            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                              <ShieldCheck size={14} />
                            </div>
                          )}
                        </div>

                        <div className="space-y-0.5">
                          <span className="text-xs font-semibold font-mono text-slate-100 select-all block break-all">
                            {log.domain}
                          </span>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-slate-500">
                            <span className="font-semibold text-slate-400">{log.profileName}</span>
                            <span>•</span>
                            <span className="flex items-center gap-0.5 font-mono">
                              <Smartphone size={9} />
                              {log.deviceName}
                            </span>
                            <span>•</span>
                            <span className="font-mono">{log.clientIp}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Badge, Timestamp */}
                      <div className="flex md:flex-col items-baseline md:items-end justify-between md:justify-center gap-1 shrink-0 text-right">
                        {isWatchlist ? (
                          <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                            WATCHLIST VIOLATION
                          </span>
                        ) : isBlocked ? (
                          <span className="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-semibold">
                            Blocked
                          </span>
                        ) : (
                          <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold font-mono">
                            Allowed
                          </span>
                        )}

                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                          <Clock size={10} />
                          {formatTimeUtcPlus6(log.timestamp)}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
            <div className="bg-slate-950 px-4 py-2 border-t border-slate-900 text-[10px] text-slate-500 font-mono">
              Total Stream Cache: {logs.length} logs
            </div>
          </div>
        </div>
      ) : (
        // 2. Alert Dispatch Audits Tab
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Send size={14} className="text-purple-400" />
              Telegram Dispatch History
            </h3>
            <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-800 px-2 py-0.5 rounded font-mono">
              Alerts audits Log
            </span>
          </div>

          <div className="bg-slate-950/80 border border-slate-900 rounded-xl overflow-hidden">
            {loading ? (
              <Skeleton variant="table-row" count={5} />
            ) : alerts.length === 0 ? (
              <div className="p-12 text-center text-slate-500 space-y-1">
                <Send className="mx-auto text-slate-700" size={32} />
                <p className="text-sm font-semibold">No alerts dispatched yet</p>
                <p className="text-xs">Notifications triggered by Watchlist blocks or new blocks will be logged here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-900">
                {alerts.map((alert, idx) => (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                    key={alert.id}
                    className="p-4 flex justify-between items-center gap-4 hover:bg-slate-900/20"
                  >
                    <div className="space-y-1">
                      <span className="text-xs font-mono text-slate-200 block select-all">
                        Alert dispatched for <code>{alert.domain}</code> ({alert.deviceName})
                      </span>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                        <span className="text-purple-400 font-semibold uppercase">{alert.type} Alert</span>
                        <span>•</span>
                        <span>Recipient: {alert.user}</span>
                        <span>•</span>
                        <span>Time: {formatDateTimeUtcPlus6(alert.timestamp)}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      {alert.status === 'sent' ? (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded font-semibold font-mono">
                          SENT OK
                        </span>
                      ) : (
                        <div className="space-y-0.5">
                          <span className="text-[10px] bg-red-500/15 text-red-400 border border-red-500/25 px-2 py-0.5 rounded font-semibold font-mono block">
                            FAILED
                          </span>
                          <span className="text-[8px] font-mono text-red-400/80 block max-w-xs truncate">{alert.errorMessage}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            <div className="bg-slate-950 px-4 py-2 border-t border-slate-900 text-[10px] text-slate-500 font-mono">
              Total Alerts Sent: {alerts.length} dispatches
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
