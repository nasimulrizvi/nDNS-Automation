import { useState, FormEvent } from 'react';
import { Blocklists, DenylistEntry, DenylistItem, NextDNSProfile } from '../types';
import { Shield, Plus, Trash2, Search, AlertCircle, RefreshCw, Globe, Wifi, User, Heart, ShieldCheck, Users, Info, Lock, Bell, BellOff, VolumeX } from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from './Skeleton';

interface BlocklistConfigViewProps {
  blocklists: Blocklists;
  profiles?: NextDNSProfile[];
  onSaveBlocklists: (newBlocklists: Blocklists) => Promise<void>;
  onSync: () => Promise<void>;
  syncing: boolean;
  loading?: boolean;
}

function getProfileKey(profile: { id?: string; name?: string }): string {
  if (!profile) return 'others';
  const name = profile.name || '';
  if (!name) return profile.id || 'others';
  const clean = name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
  return clean || profile.id || 'others';
}

interface NormalizedDomain {
  domain: string;
  alertEnabled: boolean;
  addedAt?: string;
  isLocked: boolean;
  remainingHours?: number;
  originalEntry: DenylistEntry;
}

export default function BlocklistConfigView({ blocklists, profiles = [], onSaveBlocklists, onSync, syncing, loading = false }: BlocklistConfigViewProps) {
  const [activeTab, setActiveTab] = useState<string>('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [error, setError] = useState('');
  const [unsyncedChanges, setUnsyncedChanges] = useState(false);

  // Default profiles fallback if profiles list is empty
  const defaultFallbackProfiles: NextDNSProfile[] = [
    { id: '3e1c94', name: 'Primary', deviceCount: 0, activeRulesCount: 0, queriesLast7Days: 0, blocksLast7Days: 0, status: 'active' },
    { id: '151eaf', name: 'Router', deviceCount: 0, activeRulesCount: 0, queriesLast7Days: 0, blocksLast7Days: 0, status: 'active' },
    { id: 'd76372', name: 'MINE', deviceCount: 0, activeRulesCount: 0, queriesLast7Days: 0, blocksLast7Days: 0, status: 'active' },
    { id: 'c9e833', name: 'AMMU', deviceCount: 0, activeRulesCount: 0, queriesLast7Days: 0, blocksLast7Days: 0, status: 'active' },
    { id: '92b815', name: 'ABBU', deviceCount: 0, activeRulesCount: 0, queriesLast7Days: 0, blocksLast7Days: 0, status: 'active' },
    { id: '38db7e', name: 'Others', deviceCount: 0, activeRulesCount: 0, queriesLast7Days: 0, blocksLast7Days: 0, status: 'active' },
  ];

  const profilesList = profiles && profiles.length > 0 ? profiles : defaultFallbackProfiles;

  const normalize = (entry: DenylistEntry): NormalizedDomain => {
    let domain = '';
    let alertEnabled = false;
    let addedAt: string | undefined = undefined;

    if (typeof entry === 'string') {
      domain = entry.trim();
    } else if (entry) {
      domain = (entry.domain || '').trim();
      alertEnabled = Boolean(entry.alertEnabled);
      addedAt = entry.addedAt;
    }

    let isLocked = true;
    let remainingHours: number | undefined = undefined;

    if (addedAt) {
      const addedMs = new Date(addedAt).getTime();
      if (!isNaN(addedMs)) {
        const elapsedMs = Date.now() - addedMs;
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
        if (elapsedMs <= TWENTY_FOUR_HOURS_MS) {
          isLocked = false;
          remainingHours = Math.max(1, Math.ceil((TWENTY_FOUR_HOURS_MS - elapsedMs) / (60 * 60 * 1000)));
        }
      }
    }

    return {
      domain,
      alertEnabled,
      addedAt,
      isLocked,
      remainingHours,
      originalEntry: entry
    };
  };

  // Map tabs to active domains
  const getActiveEntries = (): DenylistEntry[] => {
    if (activeTab === 'general') {
      return blocklists.general || [];
    }
    return (blocklists.perUser && blocklists.perUser[activeTab]) || [];
  };

  const getActiveItems = (): NormalizedDomain[] => {
    return getActiveEntries().map(normalize);
  };

  const handleAddDomain = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;

    if (!domain.includes('.') || domain.length < 4 || domain.includes(' ')) {
      setError('Invalid domain format. Example: badwebsite.com');
      return;
    }

    const currentItems = getActiveItems();
    if (currentItems.some(item => item.domain.toLowerCase() === domain)) {
      setError('This domain is already in the list.');
      return;
    }

    // Default state for newly added Denylist domain: alerts OFF + 24h timer initialized
    const newEntry: DenylistItem = { domain, alertEnabled: false, addedAt: new Date().toISOString() };
    const updatedBlocklists = { ...blocklists };

    const sortFn = (a: DenylistEntry, b: DenylistEntry) =>
      normalize(a).domain.localeCompare(normalize(b).domain);

    if (activeTab === 'general') {
      const list = [...(blocklists.general || []), newEntry];
      list.sort(sortFn);
      updatedBlocklists.general = list;
    } else {
      const list = [...(blocklists.perUser[activeTab] || []), newEntry];
      list.sort(sortFn);
      updatedBlocklists.perUser = {
        ...blocklists.perUser,
        [activeTab]: list
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

    const targetItem = getActiveItems().find(i => i.domain.toLowerCase() === domain.toLowerCase());
    if (targetItem && targetItem.isLocked) {
      setError('Locked — This domain can no longer be removed via nDNS Automations.');
      return;
    }

    const updatedBlocklists = { ...blocklists };

    const filterOut = (list: DenylistEntry[]) =>
      list.filter(item => normalize(item).domain.toLowerCase() !== domain.toLowerCase());

    if (activeTab === 'general') {
      updatedBlocklists.general = filterOut(blocklists.general || []);
    } else {
      updatedBlocklists.perUser = {
        ...blocklists.perUser,
        [activeTab]: filterOut(blocklists.perUser[activeTab] || [])
      };
    }

    try {
      await onSaveBlocklists(updatedBlocklists);
      setUnsyncedChanges(true);
    } catch (err: any) {
      setError(err.message || 'Failed to delete domain.');
    }
  };

  const handleToggleAlert = async (domain: string) => {
    setError('');
    const updatedBlocklists = { ...blocklists };

    const toggleInList = (list: DenylistEntry[]) =>
      list.map(entry => {
        const norm = normalize(entry);
        if (norm.domain.toLowerCase() === domain.toLowerCase()) {
          return {
            domain: norm.domain,
            alertEnabled: !norm.alertEnabled,
            addedAt: norm.addedAt,
            updatedBy: (norm.originalEntry && typeof norm.originalEntry === 'object' && (norm.originalEntry as any).updatedBy) || 'app'
          };
        }
        return entry;
      });

    if (activeTab === 'general') {
      updatedBlocklists.general = toggleInList(blocklists.general || []);
    } else {
      updatedBlocklists.perUser = {
        ...blocklists.perUser,
        [activeTab]: toggleInList((blocklists.perUser && blocklists.perUser[activeTab]) || [])
      };
    }

    try {
      await onSaveBlocklists(updatedBlocklists);
      setUnsyncedChanges(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update alert setting.');
    }
  };

  const handleBulkAlertToggle = async (enable: boolean, applyGlobally = false) => {
    setError('');
    const updatedBlocklists = { ...blocklists };

    const setInList = (list: DenylistEntry[]) =>
      (list || []).map(entry => {
        const norm = normalize(entry);
        return {
          domain: norm.domain,
          alertEnabled: enable,
          addedAt: norm.addedAt,
          updatedBy: (norm.originalEntry && typeof norm.originalEntry === 'object' && (norm.originalEntry as any).updatedBy) || 'app'
        };
      });

    if (applyGlobally) {
      updatedBlocklists.general = setInList(blocklists.general);
      const newPerUser = { ...blocklists.perUser };
      for (const key of Object.keys(newPerUser)) {
        newPerUser[key] = setInList(newPerUser[key] || []);
      }
      updatedBlocklists.perUser = newPerUser;
    } else {
      if (activeTab === 'general') {
        updatedBlocklists.general = setInList(blocklists.general);
      } else {
        updatedBlocklists.perUser = {
          ...blocklists.perUser,
          [activeTab]: setInList((blocklists.perUser && blocklists.perUser[activeTab]) || [])
        };
      }
    }

    try {
      await onSaveBlocklists(updatedBlocklists);
      setUnsyncedChanges(true);
    } catch (err: any) {
      setError(err.message || 'Failed to update bulk alerts.');
    }
  };

  const activeItems = getActiveItems();
  const filteredItems = activeItems.filter(item =>
    item.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const alertingCount = activeItems.filter(i => i.alertEnabled).length;
  const mutedCount = activeItems.length - alertingCount;

  const renderTabIcon = (tabKey: string, tabName?: string) => {
    if (tabKey === 'general') return <Globe size={15} className="shrink-0 text-blue-400" />;
    const nameLower = (tabName || tabKey).toLowerCase();
    if (nameLower.includes('router')) return <Wifi size={15} className="shrink-0 text-cyan-400" />;
    if (nameLower.includes('primary')) return <Shield size={15} className="shrink-0 text-blue-400" />;
    if (nameLower.includes('mine')) return <User size={15} className="shrink-0 text-emerald-400" />;
    if (nameLower.includes('ammu')) return <Heart size={15} className="shrink-0 text-pink-400" />;
    if (nameLower.includes('abbu')) return <ShieldCheck size={15} className="shrink-0 text-indigo-400" />;
    return <Users size={15} className="shrink-0 text-amber-400" />;
  };

  const getTabLabel = (tabKey: string): string => {
    if (tabKey === 'general') return 'Shared General';
    const matchedProfile = profilesList.find(p => getProfileKey(p) === tabKey || p.id === tabKey);
    return matchedProfile ? matchedProfile.name : tabKey.toUpperCase();
  };

  const allTabs = [
    { key: 'general', label: 'Shared General' },
    ...profilesList.map(p => ({ key: getProfileKey(p), label: p.name }))
  ];

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
        {allTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setSearchQuery('');
              setError('');
            }}
            className={`px-4 py-2.5 font-semibold text-xs sm:text-sm rounded-t-lg transition border-b-2 -mb-px flex items-center gap-2 ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            {renderTabIcon(tab.key, tab.label)}
            <span>{tab.label}</span>
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

            {/* Controls: Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-56">
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
          </div>

          {/* Bulk Notification Controls Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-300 font-medium">
              <Bell size={14} className="text-amber-400 shrink-0" />
              <span>Telegram Alert Controls:</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleBulkAlertToggle(true)}
                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 transition"
                title={`Enable Telegram alerts for all ${activeItems.length} domains in ${getTabLabel(activeTab)}`}
              >
                <Bell size={12} />
                Enable All ({getTabLabel(activeTab)})
              </button>

              <button
                type="button"
                onClick={() => handleBulkAlertToggle(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 px-2.5 py-1 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 transition"
                title={`Disable Telegram alerts for all ${activeItems.length} domains in ${getTabLabel(activeTab)}`}
              >
                <BellOff size={12} />
                Disable All ({getTabLabel(activeTab)})
              </button>

              <button
                type="button"
                onClick={() => handleBulkAlertToggle(false, true)}
                className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 px-2.5 py-1 rounded-lg font-medium text-[11px] flex items-center gap-1 transition"
                title="Mute all denylist alerts across ALL profiles globally"
              >
                <VolumeX size={12} />
                Mute All Global
              </button>
            </div>
          </div>

          {/* List display */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-4">
                <Skeleton variant="list-item" count={6} />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-slate-500 space-y-1">
                <p className="text-sm font-semibold">No domains found</p>
                <p className="text-xs">
                  {searchQuery ? 'Try adjusting your search criteria.' : 'Add your first domain block rule in the panel on the right.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
                {filteredItems.map((item, idx) => (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.2) }}
                    key={item.domain}
                    className="flex justify-between items-center px-4 py-3 hover:bg-slate-800/30 transition group"
                  >
                    <span className="text-xs font-mono text-slate-200 bg-slate-950/40 px-2.5 py-1 rounded border border-slate-800/30 select-all">
                      {item.domain}
                    </span>

                    <div className="flex items-center gap-2">
                      {/* Per-Domain Telegram Alert Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleAlert(item.domain)}
                        className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] flex items-center gap-1.5 transition border ${
                          item.alertEnabled
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                            : 'bg-slate-950/50 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                        }`}
                        title={
                          item.alertEnabled
                            ? 'Telegram alert ENABLED for access attempts. Click to MUTE.'
                            : 'Telegram alert MUTED for access attempts. Click to ENABLE.'
                        }
                      >
                        {item.alertEnabled ? (
                          <>
                            <Bell size={12} className="shrink-0 text-amber-400 fill-amber-400/20" />
                            <span>Alert ON</span>
                          </>
                        ) : (
                          <>
                            <BellOff size={12} className="shrink-0 text-slate-500" />
                            <span>Muted</span>
                          </>
                        )}
                      </button>

                      {item.isLocked ? (
                        <div
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-800 text-[10.5px] text-slate-500 cursor-not-allowed select-none"
                          title="Locked — This domain can no longer be removed via nDNS Automations."
                        >
                          <Lock size={12} className="text-amber-500/80 shrink-0" />
                          <span className="font-semibold text-slate-400">Locked (24h)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span 
                            className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded"
                            title={`Added within 24 hours. Grace period expires in ${item.remainingHours}h.`}
                          >
                            {item.remainingHours}h left
                          </span>
                          <button
                            onClick={() => handleDeleteDomain(item.domain)}
                            className="text-slate-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 transition"
                            title="Remove domain block rule (Within 24h grace period)"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
            <div className="bg-slate-950/40 px-4 py-2 border-t border-slate-800/60 flex justify-between text-[10px] text-slate-500 font-mono">
              <span>Showing {filteredItems.length} of {activeItems.length} domains</span>
              <span>{alertingCount} Alerting • {mutedCount} Muted</span>
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

            <div className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 leading-normal space-y-2">
              <div className="flex items-start gap-1.5 text-amber-300/90 font-medium bg-amber-500/5 border border-amber-500/20 p-2.5 rounded-lg">
                <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
                <p>
                  <b>Notification Noise Control:</b> Newly added denylist domains default to muted alerts. Toggle the bell icon on sensitive domains to receive instant Telegram notifications. Watchlist matches always alert unconditionally.
                </p>
              </div>

              <div className="space-y-1 pt-1">
                <span className="font-semibold text-slate-300 block">Syntax Rules:</span>
                <p>• Domain matches are implicit sub-domain blocks. Adding <code>badsite.com</code> blocks all paths, plus <code>www.badsite.com</code>, <code>api.badsite.com</code>, etc.</p>
                <p>• Avoid leading protocol strings (do not use <code>https://</code>).</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
