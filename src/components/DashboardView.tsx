import { useState, useEffect, useRef } from 'react';
import { NextDNSProfile, SystemState, DeviceAnalytics } from '../types';
import { ClientAPI } from '../api';
import { formatTimeUtcPlus6, formatDateTimeUtcPlus6 } from '../date-utils';
import { Shield, Smartphone, RefreshCw, Layers, CheckCircle, Search, Laptop, User, Wifi, Eye, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Skeleton from './Skeleton';

interface DashboardViewProps {
  state: SystemState;
  onSyncAll: () => Promise<void>;
  syncing: boolean;
  onNavigate: (tab: string) => void;
  loading?: boolean;
}

export default function DashboardView({ state, onSyncAll, syncing, onNavigate, loading = false }: DashboardViewProps) {
  const { profiles = [], settings, blocklists = { general: [], perUser: { router: [], mine: [], ammu: [], abbu: [], others: [] } }, watchlist = { domains: [] } } = state;

  const [activeTab, setActiveTab] = useState<'profiles' | 'devices'>('profiles');
  const [deviceAnalytics, setDeviceAnalytics] = useState<DeviceAnalytics[]>([]);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(false);
  const [isFetchingDevices, setIsFetchingDevices] = useState<boolean>(false);
  const [hasLoadedDevicesOnce, setHasLoadedDevicesOnce] = useState<boolean>(false);
  const hasLoadedDevicesOnceRef = useRef<boolean>(false);
  const [deviceSearch, setDeviceSearch] = useState<string>('');
  const [selectedDeviceModal, setSelectedDeviceModal] = useState<DeviceAnalytics | null>(null);

  const totalQueries = profiles.reduce((acc, curr) => acc + curr.queriesLast7Days, 0);
  const totalBlocks = profiles.reduce((acc, curr) => acc + curr.blocksLast7Days, 0);
  const blockRate = totalQueries > 0 ? ((totalBlocks / totalQueries) * 100).toFixed(1) : '0.0';

  const loadDeviceData = async () => {
    setIsFetchingDevices(true);
    // Only show skeleton on initial load before data is first retrieved
    if (!hasLoadedDevicesOnceRef.current) {
      setLoadingDevices(true);
    }
    try {
      const data = await ClientAPI.getDeviceAnalytics();
      setDeviceAnalytics(data || []);
      hasLoadedDevicesOnceRef.current = true;
      setHasLoadedDevicesOnce(true);

      setSelectedDeviceModal(prevModal => {
        if (!prevModal) return null;
        const updatedDev = (data || []).find(
          d => d.deviceName === prevModal.deviceName && d.clientIp === prevModal.clientIp
        );
        return updatedDev || prevModal;
      });
    } catch (e) {
      console.error('Failed to load device analytics:', e);
    } finally {
      setLoadingDevices(false);
      setIsFetchingDevices(false);
    }
  };

  useEffect(() => {
    loadDeviceData();
    const interval = setInterval(() => {
      loadDeviceData();
    }, 5000);
    return () => clearInterval(interval);
  }, [state.logs]);

  const filteredDevices = deviceAnalytics.filter(dev => 
    dev.deviceName.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    dev.clientIp.toLowerCase().includes(deviceSearch.toLowerCase()) ||
    dev.profileName.toLowerCase().includes(deviceSearch.toLowerCase())
  );

  const getDeviceIcon = (deviceName: string) => {
    const lower = deviceName.toLowerCase();
    if (lower.includes('router') || lower.includes('103.')) return <Wifi size={16} className="text-cyan-400 shrink-0" />;
    if (lower.includes('laptop') || lower.includes('macbook')) return <Laptop size={16} className="text-blue-400 shrink-0" />;
    return <Smartphone size={16} className="text-cyan-400 shrink-0" />;
  };

  return (
    <div className="space-y-6">
      {/* Overview Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Shield size={22} className="text-blue-400" />
            NextDNS Overview
          </h2>
          <p className="text-xs text-slate-400 mt-1">Real-time profile metrics, device activity monitoring, and security telemetry.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onSyncAll}
            disabled={syncing}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/10 disabled:opacity-50"
            id="header-sync-button"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Profiles"}
          </button>
        </div>
      </div>

      {/* Grid of Key Metrics */}
      {loading ? (
        <Skeleton variant="stat" count={4} />
      ) : (
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
                <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Tracked Devices / IPs</p>
                <h3 className="text-2xl font-bold mt-1 text-cyan-400">
                  {deviceAnalytics.length}
                </h3>
              </div>
              <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg">
                <Smartphone size={18} />
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">
              <span className="text-cyan-400 font-semibold">Realtime</span> device-level monitoring
            </p>
          </motion.div>
        </div>
      )}

      {/* Main View Switcher Bar */}
      <div className="bg-slate-900/70 p-1.5 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row justify-between items-center gap-3">
        <div className="flex gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('profiles')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition ${
              activeTab === 'profiles'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Layers size={16} />
            <span>Profile-Level Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition ${
              activeTab === 'devices'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Smartphone size={16} />
            <span>Device-Specific Analytics</span>
            <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full font-mono">
              REALTIME
            </span>
          </button>
        </div>

        {activeTab === 'devices' && (
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search Device or IP..."
              value={deviceSearch}
              onChange={e => setDeviceSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
        )}
      </div>

      {/* Main Content View (Full Width) */}
      <div className="w-full space-y-4">
        {activeTab === 'profiles' ? (
          /* --- Profile-Level Overview Tab --- */
          <>
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers size={18} className="text-blue-400" />
                Connected NextDNS Profiles
              </h2>
              <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-full text-slate-300 font-medium font-mono">
                Status: Active
              </span>
            </div>

            {loading || profiles.length === 0 ? (
              <Skeleton variant="profile-card" count={6} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                      transition={{ delay: idx * 0.08 }}
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
                          View Analytics
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* --- Device-Specific Analytics Section --- */
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Smartphone size={18} className="text-cyan-400" />
                  Device-Specific Analytics
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Real-time device query counts, blocked query metrics, and specific blocked domain breakdown.</p>
              </div>

              <button 
                onClick={loadDeviceData}
                className="p-2 bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition"
                title="Refresh device telemetry"
              >
                <RefreshCw size={14} className={isFetchingDevices ? 'animate-spin' : ''} />
              </button>
            </div>

            {(!hasLoadedDevicesOnce && (loadingDevices || loading)) ? (
              <Skeleton variant="card" count={6} />
            ) : filteredDevices.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-12 text-center space-y-3">
                <Smartphone size={32} className="mx-auto text-slate-600" />
                <h3 className="text-slate-300 font-bold text-sm">No Data Found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  {deviceSearch 
                    ? `No device matched search criteria "${deviceSearch}".` 
                    : "No device data found for the connected NextDNS profiles. Devices will appear here in real time as DNS queries or activity are recorded."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDevices.map((dev, idx) => (
                  <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={`${dev.deviceName}-${dev.clientIp}`}
                    className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 relative space-y-4 hover:border-cyan-500/30 transition"
                  >
                    {/* Device Card Header */}
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-slate-800 border border-slate-700/60 rounded-xl">
                          {getDeviceIcon(dev.deviceName)}
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base">
                            {dev.deviceName}
                          </h3>
                          <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-0.5">
                            <span>{dev.clientIp}</span>
                            <span>•</span>
                            <span className="text-cyan-400 font-sans font-semibold">{dev.profileName}</span>
                          </div>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        Active
                      </span>
                    </div>

                    {/* Device Metrics */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 text-center">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Queries</span>
                        <span className="text-sm font-bold text-slate-100">{dev.totalQueries.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Blocked</span>
                        <span className="text-sm font-bold text-emerald-400">{dev.blockedQueries.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-semibold block">Rate</span>
                        <span className="text-sm font-bold text-cyan-300">{dev.blockedPercentage}%</span>
                      </div>
                    </div>

                    {/* Blocked Domains List */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-slate-300 flex items-center gap-1.5">
                          <Shield size={12} className="text-red-400" />
                          Blocked Domains ({dev.blockedDomains.length})
                        </span>
                      </div>

                      {dev.blockedDomains.length === 0 ? (
                        <p className="text-[11px] text-slate-500 italic py-1">No domains blocked for this device yet.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                          {dev.blockedDomains.slice(0, 3).map((bd, i) => (
                            <div 
                              key={i} 
                              className="flex items-center justify-between text-xs bg-slate-950/80 border border-slate-800/80 px-2.5 py-1.5 rounded-lg font-mono"
                            >
                              <span className="text-slate-200 truncate max-w-[160px]" title={bd.domain}>
                                {bd.domain}
                              </span>
                              <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">
                                {bd.blocks} blocks
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {dev.blockedDomains.length > 3 && (
                        <button
                          onClick={() => setSelectedDeviceModal(dev)}
                          className="w-full text-center text-xs text-cyan-400 hover:text-cyan-300 font-semibold py-1 bg-cyan-950/20 border border-cyan-500/20 rounded-lg transition flex items-center justify-center gap-1"
                        >
                          <Eye size={12} />
                          View All {dev.blockedDomains.length} Blocked Domains
                        </button>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 flex justify-between items-center text-[10px] text-slate-500">
                      <span>Last Active: {formatTimeUtcPlus6(dev.lastActive)}</span>
                      <button
                        onClick={() => onNavigate('logs')}
                        className="text-slate-400 hover:text-slate-200 font-semibold underline"
                      >
                        View Security Logs
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal for Device Blocked Domains */}
      <AnimatePresence>
        {selectedDeviceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl relative"
            >
              <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-slate-800 rounded-xl">
                    {getDeviceIcon(selectedDeviceModal.deviceName)}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {selectedDeviceModal.deviceName} — Blocked Domains
                    </h3>
                    <p className="text-xs text-slate-400 font-mono">
                      IP: {selectedDeviceModal.clientIp} • Profile: {selectedDeviceModal.profileName}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedDeviceModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {selectedDeviceModal.blockedDomains.map((bd, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-slate-950 border border-slate-800/80 rounded-xl">
                    <div className="space-y-0.5">
                      <span className="font-mono text-xs text-white font-bold block">{bd.domain}</span>
                      <span className="text-[10px] text-slate-500">
                        Last Blocked: {formatDateTimeUtcPlus6(bd.lastBlockedAt)}
                      </span>
                    </div>

                    <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-lg font-bold">
                      {bd.blocks} blocks
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setSelectedDeviceModal(null);
                    onNavigate('logs');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition"
                >
                  View Security Logs
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
