import { useState } from 'react';
import { Shield, ShieldCheck, AlertCircle, RefreshCw, X, CheckCircle, ExternalLink, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import TurnstileWidget from './TurnstileWidget';
import { ClientAPI } from '../api';
import { TurnstileVerificationResponse } from '../types';

interface TurnstileSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified?: (res: TurnstileVerificationResponse) => void;
  siteKey?: string;
  title?: string;
  description?: string;
}

export default function TurnstileSecurityModal({
  isOpen,
  onClose,
  onVerified,
  siteKey,
  title = 'Cloudflare Turnstile Security Verification',
  description = 'Complete the Cloudflare challenge below to verify your browser session against automated bots.'
}: TurnstileSecurityModalProps) {
  const [verifyingWithServer, setVerifyingWithServer] = useState(false);
  const [serverResult, setServerResult] = useState<TurnstileVerificationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleTokenSuccess = async (token: string) => {
    setVerifyingWithServer(true);
    setErrorMessage(null);

    try {
      const res = await ClientAPI.verifyTurnstileToken(token);
      setServerResult(res);

      if (res.success) {
        // Store verification timestamp in session
        try {
          sessionStorage.setItem('ndns_turnstile_verified', Date.now().toString());
        } catch (e) {}

        onVerified?.(res);
      } else {
        setErrorMessage(res.message || 'Server verification failed.');
      }
    } catch (err: any) {
      console.error('[Turnstile] Server verify error:', err);
      setErrorMessage(err.message || 'Failed to verify token with server.');
    } finally {
      setVerifyingWithServer(false);
    }
  };

  const handleReset = () => {
    setServerResult(null);
    setErrorMessage(null);
    setVerifyingWithServer(false);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/60">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-100 flex items-center gap-1.5">
                  <span>Cloudflare Turnstile</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    Bot Protection
                  </span>
                </h3>
                <p className="text-xs text-neutral-400">Challenge & Siteverify Verification</p>
              </div>
            </div>
            <button
              type="button"
              id="close-turnstile-modal-btn"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            <p className="text-xs text-neutral-300 leading-relaxed text-center">
              {description}
            </p>

            {/* Widget Box */}
            <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-xl flex flex-col items-center justify-center min-h-[110px]">
              <TurnstileWidget
                siteKey={siteKey}
                onSuccess={handleTokenSuccess}
                onError={(err) => setErrorMessage(err ? `Challenge error: ${err}` : 'Verification failed')}
                onExpire={() => {
                  setServerResult(null);
                  setErrorMessage('Verification token expired. Please retry.');
                }}
              />

              {verifyingWithServer && (
                <div className="flex items-center gap-2 text-xs text-cyan-400 mt-3">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating token with Cloudflare API...</span>
                </div>
              )}
            </div>

            {/* Verification Result Feedback */}
            {serverResult && serverResult.success && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-lg text-xs space-y-1"
              >
                <div className="flex items-center gap-2 font-medium text-emerald-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Server-Side Verification Succeeded!</span>
                </div>
                <div className="text-[11px] text-emerald-400/80 pl-6 space-y-0.5">
                  <p>• Token verified against <code>challenges.cloudflare.com/turnstile</code></p>
                  {serverResult.result?.hostname && (
                    <p>• Hostname: <code>{serverResult.result.hostname}</code></p>
                  )}
                  {serverResult.result?.isTestMode && (
                    <p className="text-amber-400">• Note: Running in Cloudflare Test Key mode. Real credentials take effect once added to environment variables.</p>
                  )}
                </div>
              </motion.div>
            )}

            {errorMessage && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs flex items-start gap-2 text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-medium">Verification Issue</p>
                  <p className="text-[11px] text-rose-400/80">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Info / Explanation */}
            <div className="p-3 bg-neutral-950/50 border border-neutral-800/70 rounded-lg text-[11px] text-neutral-400 space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-neutral-300">
                <Lock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Privacy-First Bot Detection</span>
              </div>
              <p>
                Turnstile never uses cookies or tracks visitors across sites. It verifies non-interactive browser telemetry to block spam bots, credential stuffers, and unauthorized crawlers.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Reset Widget
            </button>
            <button
              type="button"
              id="confirm-turnstile-modal-btn"
              onClick={onClose}
              className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 rounded-lg text-xs font-medium transition-colors border border-neutral-700"
            >
              {serverResult?.success ? 'Done' : 'Close'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
