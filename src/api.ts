import { SystemState, UserAnalytics, DeviceAnalytics, AppSettings, Blocklists, Watchlist, ThreatFeed } from './types';

export class ClientAPI {
  private static async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const json = await res.json() as any;
    if (!res.ok || !json.success) {
      throw new Error(json.message || `Request failed with status ${res.status}`);
    }
    return json;
  }

  static async getState(): Promise<SystemState> {
    const res = await this.request<{ state: SystemState }>('/api/state');
    return res.state;
  }

  static async getAnalytics(): Promise<UserAnalytics[]> {
    const res = await this.request<{ analytics: UserAnalytics[] }>('/api/analytics');
    return res.analytics;
  }

  static async getDeviceAnalytics(): Promise<DeviceAnalytics[]> {
    const res = await this.request<{ devices: DeviceAnalytics[] }>('/api/analytics/devices');
    return res.devices;
  }

  static async saveSettings(settings: AppSettings): Promise<void> {
    await this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ settings }),
    });
  }

  static async saveBlocklists(blocklists: Blocklists): Promise<{ success: boolean; message: string; sync?: { success: boolean; syncedCount: number; message: string } }> {
    return await this.request<{ success: boolean; message: string; sync?: { success: boolean; syncedCount: number; message: string } }>('/api/blocklists', {
      method: 'POST',
      body: JSON.stringify({ blocklists }),
    });
  }

  static async pullDenylists(): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/blocklists/pull', {
      method: 'POST',
    });
  }

  static async saveWatchlist(watchlist: Watchlist): Promise<void> {
    await this.request('/api/watchlist', {
      method: 'POST',
      body: JSON.stringify({ watchlist }),
    });
  }

  static async testWatchlistAlert(): Promise<{ message: string }> {
    return await this.request<{ message: string }>('/api/watchlist/test-alert', {
      method: 'POST',
    });
  }

  static async triggerSync(): Promise<{ syncedCount: number; message: string }> {
    return await this.request<{ syncedCount: number; message: string }>('/api/sync', {
      method: 'POST',
    });
  }

  static async triggerThreatFeedIngest(): Promise<{ addedCount: number; report: string }> {
    return await this.request<{ addedCount: number; report: string }>('/api/threat-feeds/ingest', {
      method: 'POST',
    });
  }

  static async saveThreatFeeds(feeds: ThreatFeed[]): Promise<void> {
    await this.request('/api/threat-feeds/config', {
      method: 'POST',
      body: JSON.stringify({ feeds }),
    });
  }

  static async clearLogs(): Promise<void> {
    await this.request('/api/logs/clear', { method: 'POST' });
  }

  static async resetDatabase(): Promise<void> {
    await this.request('/api/db/reset', { method: 'POST' });
  }
}
