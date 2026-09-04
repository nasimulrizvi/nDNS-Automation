import { useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle, CheckCircle, ShieldCheck } from 'lucide-react';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          'error-callback'?: (errorCode?: string) => void;
          'expired-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'compact';
          action?: string;
          retry?: 'auto' | 'never';
          'retry-interval'?: number;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
      getResponse: (widgetId: string) => string | undefined;
    };
  }
}

interface TurnstileWidgetProps {
  siteKey?: string;
  onSuccess: (token: string) => void;
  onError?: (error?: string) => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  action?: string;
  className?: string;
}

export const CLOUDFLARE_DEFAULT_SITE_KEY = '1x00000000000000000000AA';

export default function TurnstileWidget({
  siteKey,
  onSuccess,
  onError,
  onExpire,
  theme = 'dark',
  size = 'normal',
  action = 'console_access',
  className = ''
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  // Resolved site key: prop -> VITE env -> Cloudflare official dummy test sitekey
  const activeSiteKey =
    siteKey ||
    ((import.meta as any).env?.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ||
    CLOUDFLARE_DEFAULT_SITE_KEY;

  useEffect(() => {
    let checkInterval: any = null;
    let isCancelled = false;

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || isCancelled) return false;

      // Clean up existing widget if any
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {}
        widgetIdRef.current = null;
      }

      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: activeSiteKey,
          theme,
          size,
          action,
          callback: (token: string) => {
            if (isCancelled) return;
            setVerified(true);
            setHasError(false);
            setErrorMessage(null);
            onSuccess(token);
          },
          'error-callback': (code?: string) => {
            if (isCancelled) return;
            console.warn('[Turnstile] Challenge error callback:', code);
            setHasError(true);
            setErrorMessage(code ? `Challenge failed (Code: ${code})` : 'Verification challenge failed.');
            onError?.(code);
          },
          'expired-callback': () => {
            if (isCancelled) return;
            setVerified(false);
            onExpire?.();
          }
        });

        widgetIdRef.current = id;
        setIsReady(true);
        return true;
      } catch (err: any) {
        console.error('[Turnstile] Error rendering widget:', err);
        setHasError(true);
        setErrorMessage(err.message || 'Failed to initialize Turnstile widget.');
        return false;
      }
    };

    // If script is already loaded
    if (window.turnstile) {
      renderWidget();
    } else {
      // Poll for script load
      let attempts = 0;
      checkInterval = setInterval(() => {
        attempts++;
        if (window.turnstile) {
          clearInterval(checkInterval);
          renderWidget();
        } else if (attempts > 50) {
          clearInterval(checkInterval);
          if (!isCancelled) {
            setHasError(true);
            setErrorMessage('Turnstile challenge script took too long to load.');
          }
        }
      }, 100);
    }

    return () => {
      isCancelled = true;
      if (checkInterval) clearInterval(checkInterval);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {}
        widgetIdRef.current = null;
      }
    };
  }, [activeSiteKey, theme, size, action]);

  const handleManualReset = () => {
    setVerified(false);
    setHasError(false);
    setErrorMessage(null);
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch (e) {}
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Widget container */}
      <div 
        ref={containerRef} 
        id="cf-turnstile-container"
        className="min-h-[65px] flex items-center justify-center"
      />

      {/* Loading state indicator */}
      {!isReady && !hasError && (
        <div className="flex items-center gap-2 text-xs text-neutral-400 mt-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
          <span>Initializing Cloudflare Turnstile...</span>
        </div>
      )}

      {/* Verified feedback */}
      {verified && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 mt-2 font-medium">
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Verification passed via Cloudflare Turnstile</span>
        </div>
      )}

      {/* Error / Retry display */}
      {hasError && (
        <div className="flex flex-col items-center gap-2 mt-2 text-center">
          <div className="flex items-center gap-1.5 text-xs text-rose-400">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{errorMessage || 'Verification challenge failed.'}</span>
          </div>
          <button
            type="button"
            id="turnstile-retry-btn"
            onClick={handleManualReset}
            className="flex items-center gap-1.5 px-3 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded text-xs text-neutral-200 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry Challenge</span>
          </button>
        </div>
      )}
    </div>
  );
}
