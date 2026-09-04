/**
 * Cloudflare Turnstile Server-Side Validation Service
 * 
 * Verifies Turnstile challenge tokens against Cloudflare's siteverify API:
 * https://challenges.cloudflare.com/turnstile/v0/siteverify
 */

export interface TurnstileVerificationResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
  action?: string;
  cdata?: string;
  message?: string;
  isTestMode?: boolean;
}

// Cloudflare official dummy test keys
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
export const CLOUDFLARE_TEST_SITE_KEY = '1x00000000000000000000AA';
export const CLOUDFLARE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

export class TurnstileService {
  private static lastVerification: {
    success: boolean;
    timestamp: string;
    hostname?: string;
    errorCodes?: string[];
  } | null = null;

  /**
   * Get the active Turnstile secret key.
   * Prefers environment variable, falls back to Cloudflare test key for local/dev.
   */
  static getSecretKey(): { key: string; isCustom: boolean } {
    const envSecret = (process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY || '').trim();
    if (envSecret) {
      return { key: envSecret, isCustom: true };
    }
    return { key: CLOUDFLARE_TEST_SECRET_KEY, isCustom: false };
  }

  /**
   * Get the active Turnstile site key.
   * Prefers environment variable, falls back to Cloudflare test key.
   */
  static getSiteKey(): { key: string; isCustom: boolean } {
    const envSite = (
      process.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY ||
      process.env.CLOUDFLARE_TURNSTILE_SITE_KEY ||
      process.env.TURNSTILE_SITE_KEY ||
      ''
    ).trim();

    if (envSite) {
      return { key: envSite, isCustom: true };
    }
    return { key: CLOUDFLARE_TEST_SITE_KEY, isCustom: false };
  }

  /**
   * Verifies the Turnstile token with Cloudflare siteverify endpoint.
   */
  static async verifyToken(token: string, remoteip?: string): Promise<TurnstileVerificationResult> {
    if (!token || typeof token !== 'string') {
      return {
        success: false,
        message: 'Missing or invalid Turnstile token.',
        'error-codes': ['missing-input-response']
      };
    }

    const { key: secretKey, isCustom } = this.getSecretKey();

    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey);
      formData.append('response', token);
      if (remoteip) {
        // Strip port if IPv6/IPv4 has it
        const cleanIp = remoteip.replace(/:\d+$/, '').replace(/^::ffff:/, '');
        formData.append('remoteip', cleanIp);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString(),
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Turnstile] Cloudflare siteverify HTTP error (${response.status}):`, errorText);
        return {
          success: false,
          message: `Cloudflare verification server error (${response.status})`,
          'error-codes': ['internal-http-error']
        };
      }

      const outcome = (await response.json()) as TurnstileVerificationResult;

      this.lastVerification = {
        success: outcome.success,
        timestamp: new Date().toISOString(),
        hostname: outcome.hostname,
        errorCodes: outcome['error-codes']
      };

      return {
        ...outcome,
        isTestMode: !isCustom,
        message: outcome.success 
          ? 'Cloudflare Turnstile token verified successfully.' 
          : `Verification failed: ${(outcome['error-codes'] || []).join(', ')}`
      };
    } catch (err: any) {
      console.error('[Turnstile] Error calling Cloudflare siteverify:', err);
      return {
        success: false,
        message: err.name === 'AbortError' ? 'Verification request timed out' : (err.message || 'Verification failed'),
        'error-codes': ['network-error']
      };
    }
  }

  /**
   * Return current Turnstile operational status for the UI.
   */
  static getStatus() {
    const siteKeyInfo = this.getSiteKey();
    const secretKeyInfo = this.getSecretKey();

    return {
      enabled: true,
      siteKey: siteKeyInfo.key,
      isCustomSiteKey: siteKeyInfo.isCustom,
      isCustomSecretKey: secretKeyInfo.isCustom,
      maskedSiteKey: siteKeyInfo.key.length > 8 
        ? `${siteKeyInfo.key.slice(0, 6)}...${siteKeyInfo.key.slice(-4)}`
        : siteKeyInfo.key,
      lastVerification: this.lastVerification
    };
  }
}
