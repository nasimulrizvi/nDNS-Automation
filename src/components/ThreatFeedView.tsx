import { useState } from 'react';
import { ThreatFeed } from '../types';
import { formatDateTimeUtcPlus6 } from '../date-utils';
import { Shield, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink, Activity, AlertOctagon } from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from './Skeleton';

interface ThreatFeedViewProps {
  feeds?: ThreatFeed[];
  onIngest?: () => Promise<{ addedCount: number; report: string }>;
  onSaveFeeds?: (newFeeds: ThreatFeed[]) => Promise<void>;
  ingesting?: boolean;
  loading?: boolean;
}

export default function ThreatFeedView({ feeds = [], onIngest, onSaveFeeds, ingesting = false, loading = false }: ThreatFeedViewProps) {
  const [report, setReport] = useState<string>('');
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const feedList = Array.isArray(feeds) ? feeds : [];

  const handleToggleFeed = async (feedId: string) => {
    if (!onSaveFeeds) return;
    setErrorMsg(null);
    const updatedFeeds = feedList.map(feed => {
      if (feed.id === feedId) {
        return { ...feed, enabled: !feed.enabled };
      }
      return feed;
    });

    try {
      await onSaveFeeds(updatedFeeds);
    } catch (e: any) {
      console.error('Error saving feeds config:', e);
      setErrorMsg(e?.message || 'Failed to update threat feed settings.');
    }
  };

  const handleTriggerIngest = async () => {
    if (!onIngest) return;
    setReport('');
    setAddedCount(null);
    setErrorMsg(null);
    try {
      const res = await onIngest();
      if (res) {
        setAddedCount(res.addedCount ?? 0);
        setReport(res.report || 'Ingestion completed successfully.');
        setShowReportModal(true);
      }
    } catch (e: any) {
      console.error('Ingest error:', e);
      setErrorMsg(e?.message || 'Threat-feed ingestion failed.');
    }
  };

  const formatLastChecked = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return formatDateTimeUtcPlus6(dateStr);
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-6" id="threatfeed-view-container">
      {/* Introduction */}
      <div className="bg-gradient-to-r from-red-950/20 to-slate-900/40 border border-red-500/15 rounded-xl p-5">
        <div className="flex gap-4 items-start">
          <div className="p-3 bg-red-500/10 text-red-400 rounded-xl">
            <Activity size={24} />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-white">Threat-Feed Aggregation Engine</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Cybersecurity threats evolve minute by minute. The background aggregator regularly polls trusted threat directories 
              (such as <b>URLhaus Malware Tracker</b>), compiles newly identified active command-and-control (C2) domains, dedupes them 
              against your existing database, and instantly deploys the updated protections to all NextDNS user endpoints.
            </p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-950/30 border border-red-500/30 p-4 rounded-xl flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertOctagon size={16} className="text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button 
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-red-200 font-bold ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Feeds Config */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield size={16} className="text-blue-400" />
              Feed Directories Configuration
            </h3>
            <button
              onClick={handleTriggerIngest}
              disabled={ingesting || !onIngest}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition"
              id="ingest-button"
            >
              <RefreshCw size={12} className={ingesting ? 'animate-spin' : ''} />
              {ingesting ? 'Aggregating...' : 'Ingest Feeds Now'}
            </button>
          </div>

          <div className="space-y-3">
            {loading || (ingesting && feedList.length === 0) ? (
              <Skeleton variant="card" count={3} />
            ) : feedList.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
                No threat feeds configured.
              </div>
            ) : (
              feedList.map(feed => {
                const formattedDate = formatLastChecked(feed?.lastChecked);
                const isEnabled = Boolean(feed?.enabled);

                return (
                  <div 
                    key={feed.id || feed.name}
                    className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row justify-between sm:items-center gap-4 relative overflow-hidden"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-white text-sm">{feed.name || 'Threat Feed'}</h4>
                        {feed.isPrimaryNative && (
                          <span className="text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                            <Shield size={10} className="text-purple-400" />
                            Primary Source (NextDNS Native)
                          </span>
                        )}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          isEnabled ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {isEnabled ? 'Active Monitoring' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-slate-400 flex items-center gap-1 truncate max-w-sm sm:max-w-md">
                        <ExternalLink size={10} />
                        {feed.isPrimaryNative ? 'NextDNS Native Threat Intelligence API' : feed.url || 'No URL specified'}
                      </p>
                      
                      {formattedDate && (
                        <div className="flex gap-4 text-[10px] text-slate-400 pt-1">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            Checked: {formattedDate}
                          </span>
                          <span className="text-slate-300">
                            Added: <strong className="text-emerald-400 font-semibold">{feed.domainsAdded || 0}</strong> targets
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Status Indicator */}
                      {isEnabled && (
                        <div className="flex items-center gap-1.5 text-xs mr-2">
                          {feed.status === 'success' && (
                            <span className="text-emerald-400 flex items-center gap-1 font-semibold font-mono text-[11px]">
                              <CheckCircle size={12} /> Sync OK
                            </span>
                          )}
                          {feed.status === 'failed' && (
                            <span className="text-red-400 flex items-center gap-1 font-semibold font-mono text-[11px]">
                              <XCircle size={12} /> Sync Error
                            </span>
                          )}
                          {(!feed.status || feed.status === 'never') && (
                            <span className="text-slate-500 flex items-center gap-1 font-medium font-mono text-[11px]">
                              Never Checked
                            </span>
                          )}
                        </div>
                      )}

                      {/* Toggle Switch */}
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={isEnabled} 
                          onChange={() => handleToggleFeed(feed.id)}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 peer-checked:after:bg-white peer-checked:after:border-blue-600"></div>
                      </label>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Action Panel */}
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-5 space-y-4">
            <h4 className="font-bold text-slate-100 text-sm">Ingestion Schedule</h4>
            
            <div className="space-y-3 bg-slate-950/60 p-4 rounded-lg border border-slate-800/50 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Trigger Frequency</span>
                <span className="text-blue-400 font-semibold">Daily (03:00 UTC)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sync Pipeline</span>
                <span className="text-emerald-400 font-semibold">Auto-Push Enabled</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Threat Deduping</span>
                <span className="text-purple-400 font-semibold">Active Filter</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-normal">
              When a daily sync is run, the engine checks only for <i>new</i> domains not previously registered, preventing massive denylist growth while blocking the latest threats.
            </p>

            <div className="bg-amber-950/20 border border-amber-500/20 p-3 rounded-lg flex gap-2 text-[11px] text-amber-300">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>To avoid clogging NextDNS profile quotas, the UI manual trigger caps ingestion additions to 100 domain updates per feed.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl"
          >
            <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/40 flex justify-between items-center">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Clock size={16} className="text-emerald-400" />
                Aggregator Ingestion Report
              </h3>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold">
                Completed
              </span>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between bg-slate-950/60 p-4 rounded-lg border border-slate-800/40">
                <span className="text-xs text-slate-400">Domains added to general denylist:</span>
                <strong className="text-lg font-bold text-emerald-400">{addedCount ?? 0}</strong>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Aggregation Logs:</span>
                <pre className="w-full bg-slate-950 p-3.5 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap leading-normal h-40">
                  {report || 'No log details available.'}
                </pre>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/20 flex justify-end">
              <button
                onClick={() => setShowReportModal(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-1.5 rounded-lg text-xs font-bold transition"
              >
                Close Report
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

