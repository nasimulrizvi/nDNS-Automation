import { ServerDB } from './server-db';
import { LogEntry, AlertLogEntry, NextDNSProfile } from './src/types';

// Let's use global fetch (native in Node 18+)

export class NextDNSService {
  private static activeSSEListeners: { [profileId: string]: any } = {};

  // Dynamically aggregate and fetch profile data from NextDNS or mock dynamically
  static async getDynamicProfiles(): Promise<NextDNSProfile[]> {
    const settings = await ServerDB.getSettings();
    const localProfiles = await ServerDB.getProfiles();
    const blocklists = await ServerDB.getBlocklists();
    const logs = await ServerDB.getLogs();

    if (!settings.nextDnsApiKey) {
      // Demo Mode: Simulate realistic changes (random fluctuations over time)
      return localProfiles.map(profile => {
        // Vary the count slightly so it doesn't look static
        const hourFactor = new Date().getHours() + new Date().getMinutes() / 60;
        const seed = profile.id.charCodeAt(0) + (profile.id.charCodeAt(1) || 0);
        const cycle = Math.sin(hourFactor / 4 + seed) * 0.12; // +/- 12% fluctuation
        
        const queries = Math.round(profile.queriesLast7Days * (1 + cycle));
        const blocks = Math.round(profile.blocksLast7Days * (1 + cycle * 0.8));

        // Dynamically calculate active rules count
        let userKey = 'others';
        const nameLower = profile.name.toLowerCase();
        if (nameLower.includes('router')) userKey = 'router';
        else if (nameLower.includes('mine')) userKey = 'mine';
        else if (nameLower.includes('ammu')) userKey = 'ammu';
        else if (nameLower.includes('abbu')) userKey = 'abbu';
        else if (nameLower.includes('others')) userKey = 'others';

        const perUserCount = blocklists.perUser[userKey]?.length || 0;
        const activeRulesCount = blocklists.general.length + perUserCount;

        // Count unique devices from actual logs for this profile
        const profileLogs = logs.filter(l => l.profileName?.toLowerCase() === profile.name.toLowerCase());
        const uniqueDevices = new Set(profileLogs.map(l => l.deviceName));
        const deviceCount = uniqueDevices.size || profile.deviceCount || 3;

        return {
          ...profile,
          queriesLast7Days: queries,
          blocksLast7Days: blocks,
          activeRulesCount,
          deviceCount
        };
      });
    }

    try {
      // Real NextDNS Mode: Fetch profile names and IDs from NextDNS
      const apiProfiles = await this.fetchProfilesFromAPI();
      if (!apiProfiles || apiProfiles.length === 0) {
        return localProfiles;
      }

      const mergedProfiles: NextDNSProfile[] = [];

      for (const apiP of apiProfiles) {
        let queries = 120;
        let blocks = 15;
        
        try {
          const res = await fetch(`https://api.nextdns.io/profiles/${apiP.id}/analytics/status?from=-7d`, {
            headers: { 'X-Api-Key': settings.nextDnsApiKey },
          });
          if (res.ok) {
            const json = await res.json() as any;
            const dataArr = json.data || [];
            let totalQ = 0;
            let totalB = 0;
            for (const item of dataArr) {
              totalQ += item.queries || 0;
              if (item.status === 'blocked') {
                totalB += item.queries || 0;
              }
            }
            // Use fallback if status returns zero
            queries = totalQ || 120;
            blocks = totalB || 15;
          }
        } catch (e) {
          console.error(`Error fetching real analytics for profile ${apiP.id}:`, e);
          const match = localProfiles.find(p => p.id === apiP.id);
          queries = match ? match.queriesLast7Days : 120;
          blocks = match ? match.blocksLast7Days : 15;
        }

        // Dynamically calculate active rules count based on blocklists.json
        let userKey = 'others';
        const nameLower = apiP.name.toLowerCase();
        if (nameLower.includes('router')) userKey = 'router';
        else if (nameLower.includes('mine')) userKey = 'mine';
        else if (nameLower.includes('ammu')) userKey = 'ammu';
        else if (nameLower.includes('abbu')) userKey = 'abbu';
        else if (nameLower.includes('others')) userKey = 'others';

        const perUserCount = blocklists.perUser[userKey]?.length || 0;
        const activeRulesCount = blocklists.general.length + perUserCount;

        // Devices count from logs, fallback to historical value
        const existing = localProfiles.find(p => p.id === apiP.id);
        const profileLogs = logs.filter(l => l.profileName?.toLowerCase() === apiP.name.toLowerCase() || l.profileName === apiP.id);
        const uniqueDevices = new Set(profileLogs.map(l => l.deviceName));
        const deviceCount = uniqueDevices.size || (existing ? existing.deviceCount : 3);
        const status = existing ? existing.status : 'active';

        mergedProfiles.push({
          id: apiP.id,
          name: apiP.name,
          deviceCount,
          activeRulesCount,
          queriesLast7Days: queries,
          blocksLast7Days: blocks,
          status
        });
      }

      // Save to server database so the cache is stored
      await ServerDB.saveProfiles(mergedProfiles);
      return mergedProfiles;
    } catch (e) {
      console.error('Error fetching/merging dynamic profiles:', e);
      return localProfiles;
    }
  }

  // Check if API credentials are valid
  static async verifyCredentials(): Promise<boolean> {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) return false;

    try {
      const res = await fetch('https://api.nextdns.io/profiles', {
        headers: { 'X-Api-Key': settings.nextDnsApiKey },
      });
      return res.status === 200;
    } catch {
      return false;
    }
  }

  // Fetch real profiles from NextDNS or return current config
  static async fetchProfilesFromAPI(): Promise<any[]> {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) return [];

    try {
      const res = await fetch('https://api.nextdns.io/profiles', {
        headers: { 'X-Api-Key': settings.nextDnsApiKey },
      });
      if (res.ok) {
        const json = await res.json() as any;
        return json.data || [];
      }
    } catch (e) {
      console.error('Error fetching profiles from NextDNS:', e);
    }
    return [];
  }

  // Synchronize master + per-user denylists to a profile
  static async syncProfile(profileId: string, domains: string[]): Promise<boolean> {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) {
      console.log(`[Sync Mock] Simulating sync of ${domains.length} domains to profile ${profileId}`);
      return true;
    }

    try {
      const payload = domains.map(d => ({ id: d, active: true }));
      const url = `https://api.nextdns.io/profiles/${profileId}/denylist`;
      
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'X-Api-Key': settings.nextDnsApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`NextDNS Sync failed: ${res.status} ${text}`);
      }
      return true;
    } catch (error) {
      console.error(`Error syncing profile ${profileId}:`, error);
      return false;
    }
  }

  // Trigger global synchronization of all profiles
  static async syncAllProfiles(): Promise<{ success: boolean; syncedCount: number; message: string }> {
    const blocklists = await ServerDB.getBlocklists();
    const profiles = await ServerDB.getProfiles();
    let syncedCount = 0;
    let failedProfiles: string[] = [];

    const generalList = blocklists.general;

    for (const profile of profiles) {
      // Find user-specific extras. Map names to keys dynamically
      let userKey = 'others';
      const nameLower = profile.name.toLowerCase();
      if (nameLower.includes('router')) userKey = 'router';
      else if (nameLower.includes('mine')) userKey = 'mine';
      else if (nameLower.includes('ammu')) userKey = 'ammu';
      else if (nameLower.includes('abbu')) userKey = 'abbu';
      else if (nameLower.includes('others')) userKey = 'others';

      const perUserList = blocklists.perUser[userKey] || [];
      const mergedList = Array.from(new Set([...generalList, ...perUserList]));

      const ok = await this.syncProfile(profile.id, mergedList);
      if (ok) {
        syncedCount++;
      } else {
        failedProfiles.push(profile.name);
      }
    }

    const settings = await ServerDB.getSettings();
    const prefix = settings.nextDnsApiKey ? 'Real NextDNS' : 'Simulated';

    if (failedProfiles.length === 0) {
      return {
        success: true,
        syncedCount,
        message: `Successfully synchronized all ${syncedCount} profiles in ${prefix} mode!`
      };
    } else {
      return {
        success: false,
        syncedCount,
        message: `Synced ${syncedCount} profiles. Failed: ${failedProfiles.join(', ')}`
      };
    }
  }

  // Fetch top domains analytics for a profile
  static async fetchTopDomains(profileId: string, limit = 10): Promise<any[]> {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) {
      // Return high-fidelity mockup data for dashboard
      return this.getMockTopDomains(profileId, limit);
    }

    try {
      const res = await fetch(`https://api.nextdns.io/profiles/${profileId}/analytics/domains?limit=${limit}&from=-7d`, {
        headers: { 'X-Api-Key': settings.nextDnsApiKey },
      });
      if (res.ok) {
        const json = await res.json() as any;
        const rawList = json.data || [];
        return rawList.map((item: any) => ({
          domain: item.domain || item.name || 'unknown.domain',
          queries: typeof item.queries === 'number' ? item.queries : (item.count || 0),
          blocks: typeof item.blocks === 'number' ? item.blocks : 0
        }));
      }
    } catch (e) {
      console.error(`Error fetching analytics for profile ${profileId}:`, e);
    }
    return this.getMockTopDomains(profileId, limit);
  }

  // Mock domain analytics mapping
  private static getMockTopDomains(profileId: string, limit: number): any[] {
    const mockRouter = [
      { domain: 'doubleclick.net', queries: 4500, blocks: 4500 },
      { domain: 'google.com', queries: 8200, blocks: 0 },
      { domain: 'netflix.com', queries: 6200, blocks: 0 },
      { domain: 'facebook.com', queries: 3100, blocks: 0 },
      { domain: 'ads-server-xyz.com', queries: 390, blocks: 390 }
    ];

    const mockMine = [
      { domain: 'github.com', queries: 4500, blocks: 0 },
      { domain: 'google.com', queries: 3200, blocks: 0 },
      { domain: 'doubleclick.net', queries: 2200, blocks: 2200 },
      { domain: 'stackoverflow.com', queries: 1950, blocks: 0 },
      { domain: 'hackernews-time-waster.org', queries: 630, blocks: 630 },
      { domain: 'youtube.com', queries: 810, blocks: 0 },
      { domain: 'distraction-reddit.com', queries: 570, blocks: 570 }
    ];

    const mockAmmu = [
      { domain: 'instagram.com', queries: 3100, blocks: 350 },
      { domain: 'tiktok.com', queries: 2500, blocks: 2500 },
      { domain: 'whatsapp.net', queries: 1200, blocks: 0 },
      { domain: 'pinterest.com', queries: 420, blocks: 0 }
    ];

    const mockAbbu = [
      { domain: 'tiktok.com', queries: 1800, blocks: 1800 },
      { domain: 'freefiremobile.com', queries: 1450, blocks: 1450 },
      { domain: 'news.google.com', queries: 920, blocks: 0 },
      { domain: 'facebook.com', queries: 850, blocks: 0 }
    ];

    const mockOthers = [
      { domain: 'roblox-unblocked.org', queries: 2200, blocks: 2200 },
      { domain: 'gaming-portal-distraction.net', queries: 950, blocks: 950 },
      { domain: 'youtube.com', queries: 1200, blocks: 0 }
    ];

    if (profileId === '3e1c94') return mockRouter.slice(0, limit);
    if (profileId === 'd76372') return mockMine.slice(0, limit);
    if (profileId === 'c9e833') return mockAmmu.slice(0, limit);
    if (profileId === '92b815') return mockAbbu.slice(0, limit);
    return mockOthers.slice(0, limit);
  }

  // Telegram alerts sending engine
  static async sendTelegramAlert(message: string): Promise<boolean> {
    const settings = await ServerDB.getSettings();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      console.log(`[Telegram Mock] Sending Telegram Alert (Bot Token & Chat ID missing):\n${message}`);
      return true;
    }

    try {
      const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: settings.telegramChatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Telegram Send failed: ${res.status} ${errText}`);
      }
      return true;
    } catch (error: any) {
      console.error('Error dispatching Telegram alert:', error);
      return false;
    }
  }

  // Central block log processing + alert trigger
  static async processBlockEvent(
    profileId: string, 
    profileName: string, 
    domain: string, 
    deviceName: string, 
    clientIp: string
  ) {
    const watchlist = await ServerDB.getWatchlist();
    const seenDomains = await ServerDB.getSeenDomains();
    const todayStr = new Date().toISOString().split('T')[0];

    // Check if domain matches any watchlisted target (root match support)
    const isWatchlisted = watchlist.domains.some(w => {
      const wLower = w.toLowerCase().trim();
      const dLower = domain.toLowerCase().trim();
      return dLower === wLower || dLower.endsWith('.' + wLower);
    });

    let userKey = 'others';
    const nameLower = profileName.toLowerCase();
    if (nameLower.includes('router')) userKey = 'router';
    else if (nameLower.includes('mine')) userKey = 'mine';
    else if (nameLower.includes('ammu')) userKey = 'ammu';
    else if (nameLower.includes('abbu')) userKey = 'abbu';
    else if (nameLower.includes('others')) userKey = 'others';

    // 1. Log block in our history database
    const newLog = await ServerDB.addLog({
      timestamp: new Date().toISOString(),
      domain,
      rootDomain: domain,
      deviceName,
      clientIp,
      status: 'blocked',
      matchedRule: isWatchlisted ? 'Watchlist Match & Block' : 'Automation Denylist Match',
      profileName
    });

    // 2. Watchlist alert — instant send with zero deduplication
    if (isWatchlisted) {
      const alertMsg = `🚨 <b>Watchlist Access Violation Triggered!</b>\n\n` +
        `👤 <b>User Profile:</b> ${profileName} (${userKey})\n` +
        `🌐 <b>Blocked Domain:</b> <code>${domain}</code>\n` +
        `📱 <b>Device:</b> ${deviceName}\n` +
        `🔌 <b>Client IP:</b> ${clientIp}\n` +
        `⏰ <b>Timestamp:</b> ${new Date().toLocaleString()}\n\n` +
        `⚠️ <i>Immediate review is recommended.</i>`;

      const sent = await this.sendTelegramAlert(alertMsg);
      await ServerDB.addAlert({
        timestamp: new Date().toISOString(),
        user: userKey,
        domain,
        deviceName,
        type: 'watchlist',
        status: sent ? 'sent' : 'failed',
        errorMessage: sent ? undefined : 'Failed to send Telegram payload'
      });
      return;
    }

    // 3. New domain block alert — deduplicated per user-domain combination per day
    const seenKey = `${userKey}:${domain}`;
    if (seenDomains[seenKey] !== todayStr) {
      seenDomains[seenKey] = todayStr;
      await ServerDB.saveSeenDomains(seenDomains);

      const alertMsg = `🛡️ <b>New Domain Blocked</b>\n\n` +
        `👤 <b>Profile:</b> ${profileName}\n` +
        `🌐 <b>Domain:</b> <code>${domain}</code>\n` +
        `📱 <b>Device:</b> ${deviceName}\n` +
        `⏰ <b>Time:</b> ${new Date().toLocaleTimeString()}`;

      const sent = await this.sendTelegramAlert(alertMsg);
      await ServerDB.addAlert({
        timestamp: new Date().toISOString(),
        user: userKey,
        domain,
        deviceName,
        type: 'new_block',
        status: sent ? 'sent' : 'failed',
        errorMessage: sent ? undefined : 'Failed to send Telegram payload'
      });
    }
  }

  // Live monitor stream loop for a profile (SSE NextDNS API)
  static startLiveMonitor(profileId: string, profileName: string) {
    if (this.activeSSEListeners[profileId]) return;

    // We keep a simple placeholder interval for background loop so we can simulate if API Key is missing.
    // If API Key is configured, we will connect to NextDNS's log stream.
    
    const monitorLoop = async () => {
      const settings = await ServerDB.getSettings();
      if (!settings.nextDnsApiKey) {
        // Mock periodic generation of events every 30-60 seconds for active demonstration!
        const interval = setInterval(async () => {
          const rand = Math.random();
          if (rand > 0.4) return; // 40% chance every check

          // Pick random domain, device, status
          const blocklists = await ServerDB.getBlocklists();
          const watchlist = await ServerDB.getWatchlist();
          const allBlocked = Array.from(new Set([...blocklists.general, ...watchlist.domains]));
          
          const domain = allBlocked[Math.floor(Math.random() * allBlocked.length)];
          let devices = ['Guest-Laptop', 'Smart-TV', 'Home-IoT'];
          if (profileId === '3e1c94') devices = ['Home-Router', 'Wifi-Extender', 'Smart-TV'];
          else if (profileId === 'd76372') devices = ['MINE-Macbook', 'MINE-iPhone', 'MINE-iPad'];
          else if (profileId === 'c9e833') devices = ['AMMU-Phone', 'AMMU-Tablet'];
          else if (profileId === '92b815') devices = ['ABBU-Phone', 'ABBU-Laptop'];
          else if (profileId === '38db7e') devices = ['Guest-Device', 'IoT-Thermostat'];
          const device = devices[Math.floor(Math.random() * devices.length)];
          const clientIp = `192.168.1.${Math.floor(Math.random() * 50) + 10}`;

          await this.processBlockEvent(profileId, profileName, domain, device, clientIp);
        }, 15000); // Check every 15 seconds

        this.activeSSEListeners[profileId] = {
          type: 'mock',
          handle: interval
        };
        console.log(`Started SIMULATED live background SSE log monitor for ${profileName}`);
        return;
      }

      // REAL NextDNS SSE LOG STREAM
      try {
        console.log(`Connecting to REAL NextDNS SSE stream for ${profileName} (${profileId})...`);
        const url = `https://api.nextdns.io/profiles/${profileId}/logs/stream`;
        const controller = new AbortController();
        
        const res = await fetch(url, {
          headers: { 'X-Api-Key': settings.nextDnsApiKey },
          signal: controller.signal
        });

        if (!res.ok) {
          throw new Error(`SSE Connection failed: ${res.status}`);
        }

        // We can parse the stream manually in a simple line-reader way
        const reader = res.body;
        if (!reader) throw new Error('No body stream on SSE response');

        this.activeSSEListeners[profileId] = {
          type: 'real',
          handle: controller,
          stream: reader
        };

        // If it's a Node stream with .on (from node-fetch, just in case):
        if (typeof (reader as any).on === 'function') {
          (reader as any).on('data', async (chunk: any) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const dataStr = line.slice(6).trim();
                  if (!dataStr) continue;
                  const log = JSON.parse(dataStr);
                  if (log.status === 'blocked') {
                    const domain = log.domain || '';
                    const device = log.device?.name || 'Unknown Device';
                    const clientIp = log.clientIp || '0.0.0.0';
                    await this.processBlockEvent(profileId, profileName, domain, device, clientIp);
                  }
                } catch (e) {}
              }
            }
          });

          (reader as any).on('error', (err: any) => {
            console.error(`SSE stream error on ${profileName}:`, err);
            this.stopLiveMonitor(profileId);
            setTimeout(() => this.startLiveMonitor(profileId, profileName), 10000);
          });
        } else {
          // Standard Web/WHATWG ReadableStream
          const webReader = (reader as any).getReader();
          const decoder = new TextDecoder();
          (async () => {
            try {
              let buffer = '';
              while (true) {
                const { done, value } = await webReader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const dataStr = line.slice(6).trim();
                      if (!dataStr) continue;
                      const log = JSON.parse(dataStr);
                      if (log.status === 'blocked') {
                        const domain = log.domain || '';
                        const device = log.device?.name || 'Unknown Device';
                        const clientIp = log.clientIp || '0.0.0.0';
                        await this.processBlockEvent(profileId, profileName, domain, device, clientIp);
                      }
                    } catch (e) {}
                  }
                }
              }
            } catch (err: any) {
              if (err?.name === 'AbortError') {
                console.log(`SSE stream aborted for ${profileName}`);
              } else {
                console.error(`SSE stream read error on ${profileName}:`, err);
                this.stopLiveMonitor(profileId);
                setTimeout(() => this.startLiveMonitor(profileId, profileName), 10000);
              }
            }
          })();
        }

      } catch (err) {
        console.error(`Error connecting real SSE stream for ${profileName}:`, err);
        // Retry in 30 seconds
        setTimeout(() => this.startLiveMonitor(profileId, profileName), 30000);
      }
    };

    monitorLoop();
  }

  static stopLiveMonitor(profileId: string) {
    const listener = this.activeSSEListeners[profileId];
    if (!listener) return;

    if (listener.type === 'mock') {
      clearInterval(listener.handle);
    } else if (listener.type === 'real') {
      try {
        listener.handle.abort();
      } catch (e) {}
    }

    delete this.activeSSEListeners[profileId];
    console.log(`Stopped log monitor stream for profile ${profileId}`);
  }

  static stopAllMonitors() {
    for (const pid of Object.keys(this.activeSSEListeners)) {
      this.stopLiveMonitor(pid);
    }
  }

  static async startAllMonitors() {
    try {
      const profiles = await ServerDB.getProfiles();
      for (const profile of profiles) {
        this.startLiveMonitor(profile.id, profile.name);
      }
    } catch (e) {
      console.error('Failed to start all live monitors:', e);
    }
  }
}
