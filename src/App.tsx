import { useState, useEffect } from 'react';
import { ClientAPI } from './api';
import { SystemState, Blocklists, Watchlist, ThreatFeed, AppSettings } from './types';
import { formatTimeUtcPlus6 } from './date-utils';
import DashboardView from './components/DashboardView';
import BlocklistConfigView from './components/BlocklistConfigView';
import WatchlistView from './components/WatchlistView';
import ThreatFeedView from './components/ThreatFeedView';
import AnalyticsView from './components/AnalyticsView';
import SecurityLogsView from './components/SecurityLogsView';
import SettingsView from './components/SettingsView';
import ErrorBoundary from './components/ErrorBoundary';
import { 
  ShieldAlert, 
  Layers, 
  ShieldCheck, 
  Settings, 
  Terminal, 
  BarChart3, 
  Activity, 
  RefreshCw,
  Bell,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type TabType = 'dashboard' | 'blocklists' | 'watchlist' | 'feeds' | 'analytics' | 'logs' | 'settings';

export default function App() {
  const [state, setState] = useState<SystemState | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [refreshingLogs, setRefreshingLogs] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [clockTimeUtc6, setClockTimeUtc6] = useState<string>(() => formatTimeUtcPlus6(new Date()));

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTimeUtc6(formatTimeUtcPlus6(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const LOCAL_STORAGE_SETTINGS_KEY = 'nextdns_auto_credentials_v1';

  // Core state retrieval
  const fetchState = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const updatedState = await ClientAPI.getState();

      // NextDNS Auto Persistence Logic
      if (updatedState && updatedState.settings) {
        const localCacheRaw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
        let localCache: Partial<AppSettings> = {};
        if (localCacheRaw) {
          try {
            localCache = JSON.parse(localCacheRaw);
          } catch (err) {
            console.error('Failed to parse local credentials cache:', err);
          }
        }

        let settingsRestored = false;
        const mergedSettings = { ...updatedState.settings };

        if (!mergedSettings.nextDnsApiKey && localCache.nextDnsApiKey) {
          mergedSettings.nextDnsApiKey = localCache.nextDnsApiKey;
          settingsRestored = true;
        }
        if (!mergedSettings.telegramBotToken && localCache.telegramBotToken) {
          mergedSettings.telegramBotToken = localCache.telegramBotToken;
          settingsRestored = true;
        }
        if (!mergedSettings.telegramChatId && localCache.telegramChatId) {
          mergedSettings.telegramChatId = localCache.telegramChatId;
          settingsRestored = true;
        }

        if (settingsRestored) {
          updatedState.settings = mergedSettings;
          // Restore credentials back to backend server
          ClientAPI.saveSettings(mergedSettings).catch(err => console.error('Error auto-syncing restored credentials to server:', err));
        } else {
          // Keep localStorage synced with current active credentials
          if (mergedSettings.nextDnsApiKey || mergedSettings.telegramBotToken || mergedSettings.telegramChatId) {
            localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify({
              nextDnsApiKey: mergedSettings.nextDnsApiKey,
              telegramBotToken: mergedSettings.telegramBotToken,
              telegramChatId: mergedSettings.telegramChatId,
            }));
          }
        }
      }

      setState(updatedState);
    } catch (e) {
      console.error('Error fetching state:', e);
      showNotification('error', 'Could not sync current state from backend container');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Setup periodic polling for a fully live reactive interface
  useEffect(() => {
    fetchState();
    const interval = setInterval(() => {
      fetchState(true);
    }, 7000); // Poll every 7 seconds
    return () => clearInterval(interval);
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Sync Profiles Control
  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await ClientAPI.triggerSync();
      showNotification('success', res.message);
      await fetchState(true);
    } catch (e: any) {
      showNotification('error', e.message || 'Sync operation failed');
    } finally {
      setSyncing(false);
    }
  };

  // Save Blocklist Control
  const handleSaveBlocklists = async (newBlocklists: Blocklists) => {
    try {
      const res = await ClientAPI.saveBlocklists(newBlocklists);
      setState(prev => prev ? { ...prev, blocklists: newBlocklists } : null);
      if (res?.sync && !res.sync.success) {
        showNotification('error', `Blocklists saved, but NextDNS Sync Notice: ${res.sync.message}`);
      } else {
        showNotification('success', 'Blocklists saved and synchronized to NextDNS.');
      }
    } catch (e: any) {
      showNotification('error', e.message || 'Could not save blocklists');
      throw e;
    }
  };

  // Save Watchlist Control
  const handleSaveWatchlist = async (newWatchlist: Watchlist) => {
    try {
      await ClientAPI.saveWatchlist(newWatchlist);
      setState(prev => prev ? { ...prev, watchlist: newWatchlist } : null);
      showNotification('success', 'Watchlist parameters updated successfully');
    } catch (e: any) {
      showNotification('error', e.message || 'Could not save watchlist');
      throw e;
    }
  };

  // Save Settings Control
  const handleSaveSettings = async (newSettings: AppSettings) => {
    try {
      // Save credentials to browser localStorage for auto-persistence
      localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify({
        nextDnsApiKey: newSettings.nextDnsApiKey,
        telegramBotToken: newSettings.telegramBotToken,
        telegramChatId: newSettings.telegramChatId,
      }));

      await ClientAPI.saveSettings(newSettings);
      setState(prev => prev ? { ...prev, settings: newSettings } : null);
      showNotification('success', 'Configurations saved & persisted in local storage');
    } catch (e: any) {
      showNotification('error', e.message || 'Could not save configurations');
      throw e;
    }
  };

  // Threat Ingestion Trigger
  const handleIngestFeeds = async (): Promise<{ addedCount: number; report: string }> => {
    setIngesting(true);
    try {
      const res = await ClientAPI.triggerThreatFeedIngest();
      showNotification('success', `Threat-feed ingestion successful! Added ${res.addedCount} domains.`);
      await fetchState(true);
      return res;
    } catch (e: any) {
      showNotification('error', e.message || 'Threat-feed ingestion failed');
      throw e;
    } finally {
      setIngesting(false);
    }
  };

  // Save Threat Feed List Control
  const handleSaveThreatFeeds = async (newFeeds: ThreatFeed[]) => {
    try {
      await ClientAPI.saveThreatFeeds(newFeeds);
      setState(prev => prev ? { ...prev, threatFeeds: newFeeds } : null);
      showNotification('success', 'Threat-feed configurations saved successfully');
    } catch (e: any) {
      showNotification('error', e.message || 'Could not save threat feeds config');
      throw e;
    }
  };

  // Clear Logs Controls
  const handleClearLogs = async () => {
    try {
      await ClientAPI.clearLogs();
      setState(prev => prev ? { ...prev, logs: [], alerts: [] } : null);
      showNotification('success', 'Database event logs cleared successfully');
    } catch (e: any) {
      showNotification('error', e.message || 'Failed to purge logs');
    }
  };

  // Database Reset Control
  const handleResetDatabase = async () => {
    if (!window.confirm('Are you absolutely sure you want to reset all configurations to templates? This will wipe your active NextDNS API key.')) {
      return;
    }
    try {
      await ClientAPI.resetDatabase();
      showNotification('success', 'Database state restored to standard mock templates.');
      await fetchState();
    } catch (e: any) {
      showNotification('error', e.message || 'Failed to reset database');
    }
  };

  const currentState: SystemState = state || {
    profiles: [],
    blocklists: { general: [], perUser: { router: [], mine: [], ammu: [], abbu: [], others: [] } },
    watchlist: { domains: [] },
    threatFeeds: [],
    settings: { telegramBotToken: '', telegramChatId: '', nextDnsApiKey: '', autoSyncIntervalMinutes: 30, emailAlertsEnabled: false },
    logs: [],
    alerts: []
  };

  const isInitialLoading = loading || !state;

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col md:flex-row font-sans relative overflow-x-hidden">
      
      {/* Toast Notification Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl flex items-center gap-3.5 shadow-2xl border text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300'
                : 'bg-red-950/90 border-red-500/30 text-red-300'
            }`}
          >
            <Bell size={14} className={notification.type === 'success' ? 'text-emerald-400' : 'text-red-400'} />
            <span>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar navigation */}
      <aside className="w-full md:w-64 bg-[#080c14] border-b md:border-b-0 md:border-r border-slate-900 shrink-0 flex flex-col justify-between">
        <div className="p-5 space-y-6">
          {/* Main Logo & title */}
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl text-white shadow-lg">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h1 className="font-extrabold text-sm tracking-tight text-white leading-none">nDNS Automations</h1>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">Multi-User Console</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1" id="sidebar-nav">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Layers size={14} />
              Dashboard Overview
            </button>

            <button
              onClick={() => setActiveTab('blocklists')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'blocklists'
                  ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <ShieldCheck size={14} />
              Domain Blocklists
            </button>

            <button
              onClick={() => setActiveTab('watchlist')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'watchlist'
                  ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <ShieldAlert size={14} />
              Watchlist Alerts
            </button>

            <button
              onClick={() => setActiveTab('feeds')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'feeds'
                  ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Activity size={14} />
              Threat-Feed Aggregator
            </button>

            <button
              onClick={() => setActiveTab('analytics')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'analytics'
                  ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <BarChart3 size={14} />
              Traffic Analytics
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'logs'
                  ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Terminal size={14} />
              Security Block Logs
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition ${
                activeTab === 'settings'
                  ? 'bg-blue-600/10 text-blue-400 font-extrabold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
              }`}
            >
              <Settings size={14} />
              Settings & Integrations
            </button>
          </nav>
        </div>

        {/* Footer clock and credentials check */}
        <div className="p-5 border-t border-slate-900/80 space-y-3.5 text-[10px] text-slate-500 font-mono">
          <div className="flex justify-between items-center bg-slate-950/40 px-2.5 py-1.5 rounded-lg border border-slate-900">
            <span className="flex items-center gap-1">
              <Clock size={10} className="text-emerald-400" /> UTC+06:00 Clock
            </span>
            <span className="text-emerald-400 font-semibold font-mono">
              {clockTimeUtc6}
            </span>
          </div>
          
          <div className="flex justify-between items-center">
            <span>NextDNS Node:</span>
            <span className={currentState.settings.nextDnsApiKey ? 'text-emerald-400 font-bold' : 'text-amber-500 font-semibold'}>
              {currentState.settings.nextDnsApiKey ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto space-y-6 w-full">
        {/* Main tabs switch render */}
        <div id="main-content-tab">
          <ErrorBoundary key={activeTab}>
            {activeTab === 'dashboard' && (
              <DashboardView 
                state={currentState} 
                onSyncAll={handleSyncAll} 
                syncing={syncing}
                onNavigate={(tab) => setActiveTab(tab as TabType)}
                loading={isInitialLoading}
              />
            )}

            {activeTab === 'blocklists' && (
              <BlocklistConfigView 
                blocklists={currentState.blocklists} 
                profiles={currentState.profiles}
                onSaveBlocklists={handleSaveBlocklists}
                onSync={handleSyncAll}
                syncing={syncing}
                loading={isInitialLoading}
              />
            )}

            {activeTab === 'watchlist' && (
              <WatchlistView 
                watchlist={currentState.watchlist} 
                onSaveWatchlist={handleSaveWatchlist}
                loading={isInitialLoading}
              />
            )}

            {activeTab === 'feeds' && (
              <ThreatFeedView 
                feeds={currentState.threatFeeds} 
                onIngest={handleIngestFeeds} 
                onSaveFeeds={handleSaveThreatFeeds}
                ingesting={ingesting}
                loading={isInitialLoading}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsView 
                hasApiKey={Boolean(currentState.settings?.nextDnsApiKey)} 
                onNavigate={(tab) => setActiveTab(tab)}
              />
            )}

            {activeTab === 'logs' && (
              <SecurityLogsView 
                logs={currentState.logs} 
                alerts={currentState.alerts} 
                onClearLogs={handleClearLogs}
                onRefresh={async () => {
                  setRefreshingLogs(true);
                  await fetchState(true);
                  setRefreshingLogs(false);
                }}
                refreshing={refreshingLogs}
                loading={isInitialLoading}
                hasApiKey={Boolean(currentState.settings?.nextDnsApiKey)}
              />
            )}

            {activeTab === 'settings' && (
              <SettingsView 
                settings={currentState.settings} 
                onSaveSettings={handleSaveSettings} 
                onResetDatabase={handleResetDatabase}
                onSyncAll={handleSyncAll}
                syncing={syncing}
                loading={isInitialLoading}
              />
            )}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
