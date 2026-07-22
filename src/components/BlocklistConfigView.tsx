import { useState, FormEvent } from 'react';
import { Blocklists } from '../types';
import { Shield, Plus, Trash2, Search, AlertCircle, RefreshCw, Globe, Wifi, User, Heart, ShieldCheck, Users } from 'lucide-react';
import { motion } from 'motion/react';

interface BlocklistConfigViewProps {
  blocklists: Blocklists;
  onSaveBlocklists: (newBlocklists: Blocklists) => Promise<void>;
  onSync: () => Promise<void>;
  syncing: boolean;
}

type ListType = 'general' | 'router' | 'mine' | 'ammu' | 'abbu' | 'others';

export default function BlocklistConfigView({ blocklists, onSaveBlocklists, onSync, syncing }: BlocklistConfigViewProps) {
  const [activeTab, setActiveTab] = useState<ListType>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState('');
  const [unsyncedChanges, setUnsyncedChanges] = useState(false);

  // Map tabs to active domains
  const getActiveDomains = (): string[] => {
    if (activeTab === 'general') {
      return blocklists.general;
    }
    return blocklists.perUser[activeTab] || [];
  };

  const handleAddDomain = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    // Basic domain validation
    if (!domain.includes('.') || domain.length < 4 || domain.includes(' ')) {
      setError('Invalid domain format. Example: badwebsite.com');
      return;
    }

    const currentList = getActiveDomains();
    if (currentList.includes(domain)) {
      setError('This domain is already in the list.');
      return;
    }

    const updatedBlocklists = { ...blocklists };
    if (activeTab === 'general') {
      updatedBlocklists.general = [...blocklists.general, domain].sort();
    } else {
      updatedBlocklists.perUser = {
        ...blocklists.perUser,
        [activeTab]: [...(blocklists.perUser[activeTab] || []), domain].sort()
      };
    }

    try {
      await onSaveBlocklists(updatedBlocklists);
      setNewDomain('');
      setUnsyncedChanges(true);
    } catch (err: any) {
      setError(err.message || 'Failed to save blocklists.');
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    setError('');
    const updatedBlocklists = { ...blocklists };

    if (activeTab === 'general') {
      updatedBlocklists.general = blocklists.general.filter(d => d !== domain);
    } else {
      updatedBlocklists.perUser = {
        ...blocklists.perUser,
        [activeTab]: (blocklists.perUser[activeTab] || []).filter(d => d !== domain)
      };
    }

    try {
      await onSaveBlocklists(updatedBlocklists);
      setUnsyncedChanges(true);
    } catch (err: any) {
      setError(err.message || 'Failed to delete domain.');
    }
  };

  const filteredDomains = getActiveDomains().filter(domain =>
    domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderTabIcon = (tab: ListType) => {
    switch (tab) {
      case 'general': return <Globe size={15} className="shrink-0 text-blue-400" />;
      case 'router': return <Wifi size={15} className="shrink-0 text-cyan-400" />;
      case 'mine': return <User size={15} className="shrink-0 text-emerald-400" />;
      case 'ammu': return <Heart size={15} className="shrink-0 text-pink-400" />;
      case 'abbu': return <ShieldCheck size={15} className="shrink-0 text-indigo-400" />;
      case 'others': return <Users size={15} className="shrink-0 text-amber-400" />;
    }
  };

  const getTabLabel = (tab: ListType): string => {
    switch (tab) {
      case 'general': return 'Shared General';
      case 'router': return 'Router';
      case 'mine': return 'MINE';
      case 'ammu': return 'AMMU';
      case 'abbu': return 'ABBU';
      case 'others': return 'Others';
    }
  };

  return (
    <div className="space-y-6" id="blocklist-config-container">
      {/* Synchronization Alert Banner */}
      {unsyncedChanges && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-emerald-950/40 border border-emerald-500/30 p-4 rounded-xl flex items-center justify-between gap-4"
          id="unsynced-banner"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="text-emerald-400 shrink-0" size={18} />
            <div>
              <h4 className="font-semibold text-emerald-300 text-sm">Unsynced Blocklist Changes Pending</h4>
              <p className="text-xs text-emerald-200/80 mt-0.5">Your modifications are saved locally. Force-synchronize NextDNS to deploy them to your devices.</p>
            </div>
          </div>
          <button
            onClick={async () => {
              await onSync();
              setUnsyncedChanges(false);
            }}
            disabled={syncing}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 shrink-0 transition"
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            Push Now
          </button>
        </motion.div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-px" id="blocklist-tabs">
        {(['general', 'router', 'mine', 'ammu', 'abbu', 'others'] as ListType[]).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSearchQuery('');
              setError('');
            }}
            className={`px-4 py-2.5 font-semibold text-xs sm:text-sm rounded-t-lg transition border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            {renderTabIcon(tab)}
            <span>{getTabLabel(tab)}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core Domains Panel */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {renderTabIcon(activeTab)}
                <span>{getTabLabel(activeTab)} Denylist</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {activeTab === 'general' 
                  ? 'These domains are blocked globally for ALL users and profiles.' 
                  : `These domains are blocked specifically for the ${activeTab} profile (on top of general blocks).`}
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search domains..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/60 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* List display */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl overflow-hidden">
            {filteredDomains.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-1">
                <p className="text-sm font-semibold">No domains found</p>
                <p className="text-xs">
                  {searchQuery ? 'Try adjusting your search criteria.' : 'Add your first domain block rule in the panel on the right.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
                {filteredDomains.map((domain, idx) => (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                    key={domain}
                    className="flex justify-between items-center px-4 py-3 hover:bg-slate-800/30 transition group"
                  >
                    <span className="text-xs font-mono text-slate-200 bg-slate-950/40 px-2.5 py-1 rounded border border-slate-800/30 select-all">
                      {domain}
                    </span>
                    <button
                      onClick={() => handleDeleteDomain(domain)}
                      className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
                      title="Remove domain block"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
            <div className="bg-slate-950/40 px-4 py-2 border-t border-slate-800/60 flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Showing {filteredDomains.length} of {getActiveDomains().length} domains</span>
              <span>Idempotent Replacement</span>
            </div>
          </div>
        </div>

        {/* Action Panel */}
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <div className="space-y-1">
              <h4 className="font-bold text-slate-100 text-sm">Add New Domain Block</h4>
              <p className="text-xs text-slate-400">Pushes a new custom block rule directly into the selected denylist profile array.</p>
            </div>

            <form onSubmit={handleAddDomain} className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Target Domain
                </label>
                <input
                  type="text"
                  placeholder="e.g. doubleclick.net"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-mono"
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
                className="w-full flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-xl font-bold text-xs transition"
              >
                <Plus size={14} />
                Add Domain
              </button>
            </form>

            <div className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 leading-normal space-y-1.5">
              <span className="font-semibold text-slate-300 block">Syntax Rules:</span>
              <p>• Domain matches are implicit sub-domain blocks. Adding <code>badsite.com</code> blocks all paths, plus <code>www.badsite.com</code>, <code>api.badsite.com</code>, etc.</p>
              <p>• Avoid leading protocol strings (do not use <code>https://</code>).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
