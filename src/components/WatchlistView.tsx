import { useState, FormEvent } from 'react';
import { Watchlist } from '../types';
import { ShieldAlert, Plus, Trash2, Search, AlertCircle, Terminal } from 'lucide-react';
import { motion } from 'motion/react';

interface WatchlistViewProps {
  watchlist: Watchlist;
  onSaveWatchlist: (newWatchlist: Watchlist) => Promise<void>;
}

export default function WatchlistView({ watchlist, onSaveWatchlist }: WatchlistViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState('');

  const handleAddDomain = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    if (!domain.includes('.') || domain.length < 4 || domain.includes(' ')) {
      setError('Invalid domain format. Example: freefiremobile.com');
      return;
    }

    if (watchlist.domains.includes(domain)) {
      setError('This domain is already on the watchlist.');
      return;
    }

    const updatedWatchlist = {
      domains: [...watchlist.domains, domain].sort()
    };

    try {
      await onSaveWatchlist(updatedWatchlist);
      setNewDomain('');
    } catch (err: any) {
      setError(err.message || 'Failed to save watchlist.');
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    setError('');
    const updatedWatchlist = {
      domains: watchlist.domains.filter(d => d !== domain)
    };

    try {
      await onSaveWatchlist(updatedWatchlist);
    } catch (err: any) {
      setError(err.message || 'Failed to delete domain.');
    }
  };

  const filteredDomains = watchlist.domains.filter(domain =>
    domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6" id="watchlist-view-container">
      {/* Intro Header Card */}
      <div className="bg-gradient-to-r from-red-950/30 to-slate-900/40 border border-red-500/20 rounded-xl p-5" id="watchlist-intro">
        <div className="flex gap-4 items-start">
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl">
            <ShieldAlert size={24} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-white">Watchlist Real-Time Alerts</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Standard block rules are silent, but domains on your <b>Watchlist</b> trigger immediate, high-priority notifications!
              When any device queries a watchlisted domain, NextDNS intercepts the request and the backend dispatches an instant Telegram payload containing the profile name, device brand, client LAN IP, and timestamps.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Domain List Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Terminal size={16} className="text-red-400" />
                Active Alerts Watchlist
              </h3>
              <p className="text-xs text-slate-400">These domains trigger unconditional instant alerts across all profiles.</p>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Filter watchlist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50"
              />
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl overflow-hidden">
            {filteredDomains.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-1">
                <p className="text-sm font-semibold">Watchlist is empty</p>
                <p className="text-xs">Add high-sensitivity target domains using the controller on the right.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {filteredDomains.map((domain, idx) => (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                    key={domain}
                    className="flex justify-between items-center px-4 py-3 hover:bg-slate-800/20 transition group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-xs font-mono text-slate-200 select-all">
                        {domain}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteDomain(domain)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                      title="Remove watchlist target"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
            <div className="bg-slate-950/40 px-4 py-2 border-t border-slate-800/60 text-[10px] text-slate-500 font-mono flex justify-between">
              <span>Alert List Volume: {filteredDomains.length} domains</span>
              <span>Zero Deduplication Alerts</span>
            </div>
          </div>
        </div>

        {/* Form Panel */}
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <div className="space-y-1">
              <h4 className="font-bold text-slate-100 text-sm">Monitor Target Domain</h4>
              <p className="text-xs text-slate-400">Add a critical game site, distraction, or suspicious domain to listen for.</p>
            </div>

            <form onSubmit={handleAddDomain} className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Target Domain name
                </label>
                <input
                  type="text"
                  placeholder="e.g. freefiremobile.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/50 font-mono"
                />
              </div>

              {error && (
                <div className="bg-red-950/40 border border-red-500/30 p-2.5 rounded-lg flex items-center gap-2 text-[11px] text-red-400">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white py-2 px-4 rounded-xl font-bold text-xs transition"
              >
                <Plus size={14} />
                Watch Domain
              </button>
            </form>

            <div className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 leading-normal space-y-2">
              <span className="font-semibold text-slate-300 block">Typical Use-Cases:</span>
              <p>📍 <b>Children Safeguarding</b>: Add parental control targets (like <code>freefiremobile.com</code> or <code>tiktok.com</code>) to see exactly when and which device accesses them.</p>
              <p>📍 <b>Intrusion Monitoring</b>: Watch suspicious threat-feed targets to catch malware beaconing on your network instantly.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
