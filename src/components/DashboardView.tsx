import { NextDNSProfile, SystemState } from '../types';
import { Shield, Smartphone, RefreshCw, Layers, CheckCircle, AlertTriangle, Play, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface DashboardViewProps {
  state: SystemState;
  onSyncAll: () => Promise<void>;
  syncing: boolean;
  onNavigate: (tab: string) => void;
}

export default function DashboardView({ state, onSyncAll, syncing, onNavigate }: DashboardViewProps) {
  const { profiles, settings, blocklists, watchlist, threatFeeds } = state;

  const isDemoMode = !settings.nextDnsApiKey;
  const totalQueries = profiles.reduce((acc, curr) => acc + curr.queriesLast7Days, 0);
  const totalBlocks = profiles.reduce((acc, curr) => acc + curr.blocksLast7Days, 0);
  const blockRate = totalQueries > 0 ? ((totalBlocks / totalQueries) * 100).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      {/* Demo Mode Banner */}
      {isDemoMode && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3"
          id="demo-banner"
        >
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <h4 className="font-semibold text-amber-300 text-sm">Running in Automation Demo Mode</h4>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              No NextDNS API Key is configured. The system is running high-fidelity background simulations, generating logs, and illustrating real-time alerts. 
              Configure your credentials in the <button onClick={() => onNavigate('settings')} className="underline text-amber-300 font-medium hover:text-amber-100">Settings</button> tab to connect real NextDNS profiles.
            </p>
          </div>
        </motion.div>
      )}

      {/* Grid of Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-grid">
        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-slate-900/60 border border-slate-800 rounded-xl p-5"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Total Profiles</p>
              <h3 className="text-2xl font-bold mt-1 text-white">{profiles.length}</h3>
            </div>
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
              <Layers size={18} />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
            <CheckCircle size={12} className="text-emerald-500" />
            Synchronized with Master
          </p>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-slate-900/60 border border-slate-800 rounded-xl p-5"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Blocked Queries (7d)</p>
              <h3 className="text-2xl font-bold mt-1 text-emerald-400">{totalBlocks.toLocaleString()}</h3>
            </div>
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
              <Shield size={18} />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Avg. <span className="text-emerald-400 font-semibold">{blockRate}%</span> of overall traffic
          </p>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-slate-900/60 border border-slate-800 rounded-xl p-5"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Total Block Rules</p>
              <h3 className="text-2xl font-bold mt-1 text-purple-400">
                {(blocklists.general.length + Object.values(blocklists.perUser).reduce((acc, curr) => acc + curr.length, 0)).toLocaleString()}
              </h3>
            </div>
            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
              <Shield size={18} />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            <span className="text-slate-200 font-semibold">{blocklists.general.length}</span> shared, <span className="text-purple-400 font-semibold">{watchlist.domains.length}</span> watchlist
          </p>
        </motion.div>

        <motion.div 
          whileHover={{ y: -2 }}
          className="bg-slate-900/60 border border-slate-800 rounded-xl p-5"
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Active Threat Feeds</p>
              <h3 className="text-2xl font-bold mt-1 text-red-400">
                {threatFeeds.filter(f => f.enabled).length}
              </h3>
            </div>
            <div className="p-2 bg-red-500/10 text-red-400 rounded-lg">
              <Smartphone size={18} />
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Last pulled: {threatFeeds[0]?.lastChecked ? new Date(threatFeeds[0].lastChecked).toLocaleDateString() : 'Never'}
          </p>
        </motion.div>
      </div>

      {/* Control Center & Core Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers size={18} className="text-blue-400" />
              Connected Profiles
            </h2>
            <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300 font-medium font-mono">
              Status: Live Listening
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map((profile, idx) => {
              let userKey = 'others';
              const nameLower = profile.name.toLowerCase();
              if (nameLower.includes('router')) userKey = 'router';
              else if (nameLower.includes('mine')) userKey = 'mine';
              else if (nameLower.includes('ammu')) userKey = 'ammu';
              else if (nameLower.includes('abbu')) userKey = 'abbu';
              else if (nameLower.includes('others')) userKey = 'others';
              
              const perUserCount = blocklists.perUser[userKey]?.length || 0;
              const totalRules = blocklists.general.length + perUserCount;

              return (
                <motion.div 
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  key={profile.id}
                  className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 relative overflow-hidden"
                  id={`profile-card-${profile.id}`}
                >
                  <div className="absolute top-0 right-0 h-1 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500" />
                  
                  <div className="flex justify-between items-start mt-2">
                    <div>
                      <h3 className="font-bold text-white text-base">{profile.name}</h3>
                      <p className="text-xs font-mono text-slate-500 mt-0.5">Profile ID: {profile.id}</p>
                    </div>
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-slate-800/60 text-xs">
                    <div>
                      <span className="text-slate-400 block">Queries (7d)</span>
                      <span className="text-sm font-bold text-slate-200">{profile.queriesLast7Days.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Blocks (7d)</span>
                      <span className="text-sm font-bold text-emerald-400">{profile.blocksLast7Days.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Total Denylists</span>
                      <span className="text-sm font-bold text-purple-300">{totalRules} domains</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">User-Specific Extra</span>
                      <span className="text-sm font-bold text-blue-300">+{perUserCount} blocks</span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={() => onNavigate('blocklists')}
                      className="text-xs bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-700 font-semibold transition"
                    >
                      Manage Blocks
                    </button>
                    <button 
                      onClick={() => onNavigate('analytics')}
                      className="text-xs bg-slate-800/40 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg hover:bg-blue-500/10 font-semibold transition"
                    >
                      View Logs
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Sync Center */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <RefreshCw size={18} className="text-emerald-400" />
            Automation Control
          </h2>

          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-100 text-sm">Multi-User Sync Center</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sync applies your master blocklist plus user-specific denylist configurations to all NextDNS profiles in one unified call.
              </p>
            </div>

            <div className="space-y-3 bg-slate-950/60 p-4 rounded-lg border border-slate-800/50">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Sync Mechanism</span>
                <span className="text-emerald-400 font-semibold">Array PUT (Atomic Replacement)</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Schedule</span>
                <span className="text-blue-400 font-semibold">On-Demand & Event-Driven</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Telegram Notifier</span>
                <span className={settings.telegramBotToken ? "text-emerald-400" : "text-amber-400"}>
                  {settings.telegramBotToken ? "Enabled" : "Mock (Config Missing)"}
                </span>
              </div>
            </div>

            <button
              onClick={onSyncAll}
              disabled={syncing}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2.5 px-4 rounded-xl font-bold hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50"
              id="sync-button"
            >
              <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing Profiles..." : "Force Synced Profiles"}
            </button>
          </div>

          {/* Quick Help */}
          <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-4 space-y-2">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <HelpCircle size={14} className="text-blue-400" />
              How it works
            </h4>
            <p className="text-xs text-slate-400 leading-normal">
              Each user device is configured with a custom DNS profile endpoint. The backend automatically polls/intercepts blocks and cross-references them against your shared configurations.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
