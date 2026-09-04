import { useState, useEffect, FormEvent } from 'react';
import { AppSettings, TurnstileStatus } from '../types';
import { formatDateTimeUtcPlus6 } from '../date-utils';
import { ClientAPI } from '../api';
import { Settings, Shield, Bot, Send, Trash2, Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw, HardDrive, Lock, ShieldCheck, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import Skeleton from './Skeleton';
import TurnstileSecurityModal from './TurnstileSecurityModal';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => Promise<void>;
  onResetDatabase: () => Promise<void>;
  onSyncAll?: () => Promise<void>;
  syncing?: boolean;
  loading?: boolean;
}

export default function SettingsView({ settings = { telegramBotToken: '', telegramChatId: '', nextDnsApiKey: '', emailAlertsEnabled: false }, onSaveSettings, onResetDatabase, onSyncAll, syncing, loading = false }: SettingsViewProps) {
  const [apiKey, setApiKey] = useState(settings.nextDnsApiKey || '');
  const [botToken, setBotToken] = useState(settings.telegramBotToken || '');
  const [chatId, setChatId] = useState(settings.telegramChatId || '');

  // Keep form inputs synced when settings load or restore asynchronously
  useEffect(() => {
    if (settings.nextDnsApiKey && !apiKey) setApiKey(settings.nextDnsApiKey);
    if (settings.telegramBotToken && !botToken) setBotToken(settings.telegramBotToken);
    if (settings.telegramChatId && !chatId) setChatId(settings.telegramChatId);
  }, [settings]);

  const [showKey, setShowKey] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [turnstileStatus, setTurnstileStatus] = useState<TurnstileStatus | null>(null);
  const [showTurnstileModal, setShowTurnstileModal] = useState(false);

  useEffect(() => {
    ClientAPI.getTurnstileStatus()
      .then(setTurnstileStatus)
      .catch((err) => console.warn('[Turnstile] Could not load Turnstile status:', err));
  }, []);

  const [registeringWebhook, setRegisteringWebhook] = useState(false);

  const handleRegisterWebhook = async () => {
    if (!botToken) {
      setStatus({ type: 'error', message: 'Please provide a Telegram Bot Token first.' });
      return;
    }
    setRegisteringWebhook(true);
    setStatus(null);
    try {
      const res = await fetch('/api/telegram/setup-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: window.location.origin })
      });
      const data = await res.json();
      if (data.success) {
        setStatus({ type: 'success', message: data.message });
      } else {
        throw new Error(data.message || 'Webhook registration failed');
      }
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to register webhook' });
    } finally {
      setRegisteringWebhook(false);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);

    const updatedSettings: AppSettings = {
      nextDnsApiKey: apiKey.trim(),
      telegramBotToken: botToken.trim(),
      telegramChatId: chatId.trim(),
      emailAlertsEnabled: settings.emailAlertsEnabled
    };

    try {
      await onSaveSettings(updatedSettings);
      setStatus({ type: 'success', message: 'Settings saved and logging listeners restarted successfully!' });
    } catch (err: any) {
      setStatus({ type: 'error', message: err.message || 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!botToken || !chatId) {
      setStatus({ type: 'error', message: 'Please provide both Telegram Bot Token and Chat ID to run a dispatch test.' });
      return;
    }

    setTesting(true);
    setStatus(null);

    try {
      const serverRes = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const json = await serverRes.json();
      if (serverRes.ok && json.success) {
        setStatus({ type: 'success', message: 'Test message dispatched to Telegram! Check your phone.' });
        return;
      }
      // Fallback to direct client call if server test had issues
      const message = `🤖 <b>NextDNS Automation — Test Dispatch</b>\n\n` +
        `✅ Your Telegram notification integration is active and correctly configured!\n` +
        `🌐 <b>Host Container:</b> Cloud Run Sandbox\n` +
        `⏰ <b>Timestamp:</b> ${formatDateTimeUtcPlus6(new Date())} (UTC+06:00)\n\n` +
        `<i>Real-time security alerts will stream to this chat.</i>`;

      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML'
        })
      });

      if (res.ok) {
        setStatus({ type: 'success', message: 'Test message dispatched to Telegram! Check your phone.' });
      } else {
        const text = await res.text();
        throw new Error(`Telegram error response: ${res.status} ${text}`);
      }
    } catch (err: any) {
      console.error(err);
      setStatus({ type: 'error', message: `Telegram Test failed: ${err.message || err}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6" id="settings-view-container">
      {/* Intro Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings size={20} className="text-blue-400" />
            Settings & Integrations
          </h2>
          <p className="text-xs text-slate-400 mt-1">Configure your NextDNS API credentials, Telegram Bot variables, and manage system storage caches.</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-[11px] text-emerald-400 font-mono">
          <HardDrive size={13} className="shrink-0" />
          <span>Auto-Persisted in LocalStorage & Secrets</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Form Panel */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <Skeleton variant="card" count={2} />
          ) : (
            <form onSubmit={handleSave} className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-6">
            
            {/* Status alerts */}
            {status && (
              <div className={`p-4 rounded-xl flex items-start gap-3 border ${
                status.type === 'success' 
                  ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-950/40 border-red-500/20 text-red-400'
              }`}>
                {status.type === 'success' ? <CheckCircle size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                <span className="text-xs leading-relaxed font-semibold">{status.message}</span>
              </div>
            )}

            {/* NextDNS Auth */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                <Shield size={16} className="text-blue-400" />
                <h3 className="font-bold text-white text-sm">NextDNS Credentials</h3>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    NextDNS API Key
                  </label>
                  <span className="text-[10px] text-slate-500">Available on my.nextdns.io/account</span>
                </div>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    placeholder="Enter your NextDNS Profile API Key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-3 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Telegram Bot Auth */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2">
                <Bot size={16} className="text-purple-400" />
                <h3 className="font-bold text-white text-sm">Telegram Bot alerts Notifier</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Telegram Bot Token
                  </label>
                  <div className="relative">
                    <input
                      type={showToken ? 'text' : 'password'}
                      placeholder="e.g. 5928120412:AAH9..."
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-3 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowToken(!showToken)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
                    >
                      {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Telegram Chat ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. -100189340231"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRegisterWebhook}
                  disabled={registeringWebhook || !botToken}
                  className="bg-purple-950/60 hover:bg-purple-900/60 border border-purple-800/60 text-purple-300 hover:text-purple-100 font-bold text-xs py-2 px-3.5 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
                  id="register-webhook-button"
                >
                  <Bot size={12} className={registeringWebhook ? 'animate-spin' : ''} />
                  {registeringWebhook ? 'Registering...' : 'Register Bot Webhook'}
                </button>
                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testing}
                  className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
                  id="test-telegram-button"
                >
                  <Send size={12} className={testing ? 'animate-spin' : ''} />
                  {testing ? 'Sending Test...' : 'Test Telegram Dispatch'}
                </button>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1.5">
                <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Bot size={13} className="text-purple-400" />
                  <span>Interactive Bot Slash Commands:</span>
                </div>
                <div className="font-mono text-[10.5px] text-purple-300/90 leading-relaxed grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 pt-0.5">
                  <span>• /status — Traffic & block summary</span>
                  <span>• /block &lt;domain&gt; — Add to Shared Denylist</span>
                  <span>• /unblock &lt;domain&gt; — Unblock within 24h limit</span>
                  <span>• /watch &lt;domain&gt; — Add to Watchlist Alerts</span>
                  <span>• /unwatch &lt;domain&gt; — Remove from Watchlist</span>
                  <span>• /report — Instant top-domains report</span>
                  <span>• /help — Show slash commands menu</span>
                </div>
              </div>
            </div>

            {/* Save Buttons */}
            <div className="border-t border-slate-800/60 pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-1.5 transition disabled:opacity-50"
                id="save-settings-button"
              >
                <RefreshCw size={13} className={saving ? 'animate-spin' : ''} />
                {saving ? 'Saving changes...' : 'Save Settings & Restart Monitors'}
              </button>
            </div>
          </form>
          )}
        </div>

        {/* Automation & Database Management Column */}
        <div className="space-y-4">
          {/* Cloudflare Turnstile Bot Protection Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4" id="cloudflare-turnstile-settings-card">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Shield className="w-4 h-4 text-orange-400" />
                <span>Cloudflare Turnstile</span>
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Active
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Cloudflare Turnstile delivers privacy-preserving bot detection and site verification without intrusive CAPTCHA puzzles.
            </p>

            <div className="space-y-2 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/50 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Protection Mode:</span>
                <span className="text-cyan-400 font-semibold">Managed Challenge</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Site Key:</span>
                <span className="text-slate-300 font-mono text-[11px]">
                  {turnstileStatus?.maskedSiteKey || '1x0000...00AA'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Validation Mode:</span>
                <span className={turnstileStatus?.isCustomSecretKey ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {turnstileStatus?.isCustomSecretKey ? 'Production Live API' : 'Cloudflare Testing Mode'}
                </span>
              </div>
              {turnstileStatus?.lastVerification && (
                <div className="flex justify-between items-center pt-1 border-t border-slate-800/50">
                  <span className="text-slate-400 font-sans">Last Verified:</span>
                  <span className="text-emerald-400 text-[10.5px]">
                    {formatDateTimeUtcPlus6(new Date(turnstileStatus.lastVerification.timestamp))}
                  </span>
                </div>
              )}
            </div>

            <button
              type="button"
              id="test-turnstile-challenge-btn"
              onClick={() => setShowTurnstileModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition shadow-lg shadow-orange-950/30"
            >
              <ShieldCheck size={14} />
              <span>Test Turnstile Challenge</span>
            </button>
          </div>

          {/* Automation Control Section */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <RefreshCw size={16} className="text-emerald-400" />
              Automation & Multi-User Sync
            </h3>

            <p className="text-xs text-slate-400 leading-relaxed">
              Sync applies your master blocklist plus user-specific denylist configurations to all NextDNS profiles in one unified call.
            </p>

            <div className="space-y-2.5 bg-slate-950/60 p-3.5 rounded-lg border border-slate-800/50 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Sync Mechanism:</span>
                <span className="text-emerald-400 font-semibold">Array PUT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 font-sans">Telegram Alerts:</span>
                <span className={settings.telegramBotToken ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                  {settings.telegramBotToken ? "Active" : "Not Configured"}
                </span>
              </div>
            </div>

            {onSyncAll && (
              <button
                type="button"
                onClick={onSyncAll}
                disabled={syncing}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition disabled:opacity-50"
                id="settings-sync-button"
              >
                <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Syncing Profiles..." : "Force Synced Profiles"}
              </button>
            )}
          </div>

          {/* Database Management Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="font-bold text-red-400 text-sm flex items-center gap-2">
              <Trash2 size={16} />
              Danger Zone
            </h3>

            <p className="text-xs text-slate-400 leading-normal">
              Resetting deletes all settings, blocklists, watchlist rules, threat-feed configurations, and streaming logs. It immediately reinstates pristine default templates for evaluation.
            </p>

            <button
              type="button"
              onClick={onResetDatabase}
              className="w-full flex items-center justify-center gap-2 bg-red-950/40 hover:bg-red-500/10 border border-red-500/20 text-red-400 py-2.5 px-4 rounded-xl font-bold text-xs transition"
              id="reset-db-button"
            >
              <Trash2 size={14} />
              Reset App Data Defaults
            </button>
          </div>
        </div>
      </div>

      <TurnstileSecurityModal
        isOpen={showTurnstileModal}
        onClose={() => setShowTurnstileModal(false)}
        siteKey={turnstileStatus?.siteKey}
        onVerified={() => {
          ClientAPI.getTurnstileStatus().then(setTurnstileStatus).catch(console.error);
        }}
      />
    </div>
  );
}
