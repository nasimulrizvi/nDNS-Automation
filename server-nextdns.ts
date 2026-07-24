import { ServerDB } from './server-db';
import { LogEntry, AlertLogEntry, NextDNSProfile } from './src/types';

// Let's use global fetch (native in Node 18+)

export class NextDNSService {
  private static activeSSEListeners: { [profileId: string]: any } = {};
  private static deviceAnalyticsCache: { data: any[]; timestamp: number } | null = null;
  private static CACHE_TTL_MS = 30000; // 30 seconds cache TTL

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
        let queries = 0;
        let blocks = 0;
        
        try {
          const res = await fetch(`https://api.nextdns.io/profiles/${apiP.id}/analytics/status?from=-7d`, {
            headers: { 'X-Api-Key': settings.nextDnsApiKey },
          });
          if (res.ok) {
            const json = await res.json() as any;
            const dataArr = json.data || (Array.isArray(json) ? json : []);
            let totalQ = 0;
            let totalB = 0;
            for (const item of dataArr) {
              const sCount = typeof item.queries === 'number' ? item.queries : (item.count || item.blocks || 0);
              const sKey = (item.id || item.status || item.name || '').toString().toLowerCase();
              totalQ += sCount;
              if (sKey === 'blocked' || sKey === 'denied' || sKey === 'blacklist' || sKey === 'block') {
                totalB += sCount;
              }
            }
            queries = totalQ;
            blocks = totalB;
          }
        } catch (e) {
          console.error(`Error fetching real analytics for profile ${apiP.id}:`, e);
          queries = 0;
          blocks = 0;
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

        // Devices count from NextDNS API or logs
        let deviceCount = 0;
        try {
          const devRes = await fetch(`https://api.nextdns.io/profiles/${apiP.id}/analytics/devices?from=-7d&limit=100`, {
            headers: { 'X-Api-Key': settings.nextDnsApiKey },
          });
          if (devRes.ok) {
            const devJson = await devRes.json() as any;
            const devArr = devJson.data || [];
            deviceCount = devArr.length;
          }
        } catch (e) {}

        if (deviceCount === 0) {
          const profileLogs = logs.filter(l => l.profileName?.toLowerCase() === apiP.name.toLowerCase() || l.profileName === apiP.id);
          const uniqueDevices = new Set(profileLogs.map(l => l.deviceName));
          deviceCount = uniqueDevices.size;
        }

        const existing = localProfiles.find(p => p.id === apiP.id);
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

      const getDomainStr = (entry: any): string => (typeof entry === 'string' ? entry : entry?.domain || '');
      const generalDomains = blocklists.general.map(getDomainStr).filter(Boolean);
      const perUserDomains = (blocklists.perUser[userKey] || []).map(getDomainStr).filter(Boolean);
      const mergedList = Array.from(new Set([...generalDomains, ...perUserDomains]));

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

  // Fetch denylist from NextDNS API
  static async fetchDenylistFromAPI(profileId: string): Promise<string[]> {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) return [];

    try {
      const res = await fetch(`https://api.nextdns.io/profiles/${profileId}/denylist`, {
        headers: { 'X-Api-Key': settings.nextDnsApiKey },
      });
      if (res.ok) {
        const json = await res.json() as any;
        const list = json.data || (Array.isArray(json) ? json : []);
        return list.map((item: any) => typeof item === 'string' ? item : (item.id || item.domain)).filter(Boolean);
      }
    } catch (e) {
      console.error(`Error fetching denylist for profile ${profileId}:`, e);
    }
    return [];
  }

  // Enable NextDNS Native Threat Intelligence Feeds across all profiles (Primary Source)
  static async syncNativeThreatFeeds(): Promise<{ success: boolean; message: string; profilesUpdated: number }> {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) {
      return { success: false, message: 'NextDNS API Key is missing in Settings.', profilesUpdated: 0 };
    }

    try {
      const profiles = await this.getDynamicProfiles();
      let count = 0;

      for (const profile of profiles) {
        const res = await fetch(`https://api.nextdns.io/profiles/${profile.id}/security`, {
          method: 'PATCH',
          headers: {
            'X-Api-Key': settings.nextDnsApiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            threatIntelligenceFeeds: true,
            aiThreatDetection: true,
            googleSafeBrowsing: true,
            cryptojacking: true,
            dnsRebinding: true
          })
        });

        if (res.ok) {
          count++;
        }
      }

      return {
        success: true,
        message: `Successfully enabled NextDNS Native Threat Intelligence Feeds across ${count} profiles!`,
        profilesUpdated: count
      };
    } catch (e: any) {
      console.error('Failed to sync native NextDNS threat feeds:', e);
      return { success: false, message: `Failed to sync native threat feeds: ${e.message}`, profilesUpdated: 0 };
    }
  }

  // Pull denylists from NextDNS API for all profiles with Last-Write-Wins timestamp conflict resolution
  static async pullDenylistsFromNextDNS(): Promise<{ success: boolean; message: string; blocklists?: any }> {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) {
      return { success: false, message: 'NextDNS API Key is missing. Configure API key in Settings.' };
    }

    try {
      const profiles = await this.getDynamicProfiles();
      const currentBlocklists = await ServerDB.getBlocklists();
      
      const getDomainStr = (e: any): string => (typeof e === 'string' ? e : e?.domain || '').toLowerCase().trim();
      const getAlertEnabled = (e: any): boolean => (typeof e === 'string' ? false : Boolean(e?.alertEnabled));
      const getAddedAt = (e: any): string => (typeof e === 'object' && e?.addedAt ? e.addedAt : '');
      const getUpdatedBy = (e: any): 'native' | 'app' => (typeof e === 'object' && e?.updatedBy ? e.updatedBy : 'app');

      // Map existing known domains to their current details
      const existingMetaMap = new Map<string, { alertEnabled: boolean; addedAt: string; updatedBy: 'native' | 'app' }>();
      (currentBlocklists.general || []).forEach(e => {
        const d = getDomainStr(e);
        if (d) existingMetaMap.set(d, { alertEnabled: getAlertEnabled(e), addedAt: getAddedAt(e), updatedBy: getUpdatedBy(e) });
      });
      Object.values(currentBlocklists.perUser || {}).forEach(list => {
        (list || []).forEach(e => {
          const d = getDomainStr(e);
          if (d) existingMetaMap.set(d, { alertEnabled: getAlertEnabled(e), addedAt: getAddedAt(e), updatedBy: getUpdatedBy(e) });
        });
      });

      const remoteMap: { [userKey: string]: string[] } = {};
      const profileLastSyncedAt: { [key: string]: string } = { ...(currentBlocklists.profileLastSyncedAt || {}) };
      const profileSyncStatus: { [key: string]: any } = { ...(currentBlocklists.profileSyncStatus || {}) };
      const nowIso = new Date().toISOString();
      let totalRemoteDomainsCount = 0;
      let hasPendingAppPushes = false;

      for (const profile of profiles) {
        let userKey = 'others';
        const nameLower = profile.name.toLowerCase();
        if (nameLower.includes('router')) userKey = 'router';
        else if (nameLower.includes('mine')) userKey = 'mine';
        else if (nameLower.includes('ammu')) userKey = 'ammu';
        else if (nameLower.includes('abbu')) userKey = 'abbu';
        else if (nameLower.includes('others')) userKey = 'others';

        const remoteDomains = await this.fetchDenylistFromAPI(profile.id);
        const lowerRemote = remoteDomains.map(d => d.toLowerCase().trim()).filter(Boolean);
        remoteMap[userKey] = Array.from(new Set(lowerRemote));
        totalRemoteDomainsCount += remoteMap[userKey].length;

        const lastSyncedTime = profileLastSyncedAt[userKey] ? new Date(profileLastSyncedAt[userKey]).getTime() : 0;
        
        // Find local domains belonging to this profile
        const localUserDomains = [
          ...(currentBlocklists.general || []),
          ...((currentBlocklists.perUser || {})[userKey] || [])
        ];

        let nativeAdditionsCount = 0;
        let nativeRemovalsCount = 0;

        // Check if there are local app additions that happened AFTER lastSyncedTime (pending push)
        for (const entry of localUserDomains) {
          const d = getDomainStr(entry);
          const meta = existingMetaMap.get(d);
          if (meta && meta.addedAt) {
            const addedTime = new Date(meta.addedAt).getTime();
            if (addedTime > lastSyncedTime && !lowerRemote.includes(d)) {
              hasPendingAppPushes = true;
            }
          }
        }

        // Check native changes
        for (const rDomain of lowerRemote) {
          if (!existingMetaMap.has(rDomain)) {
            nativeAdditionsCount++;
            existingMetaMap.set(rDomain, { alertEnabled: false, addedAt: nowIso, updatedBy: 'native' });
          }
        }

        profileLastSyncedAt[userKey] = nowIso;

        let changeSummary = 'In Sync with NextDNS Native Authority';
        let lastChangedBy: 'native' | 'app' | 'sync' = 'sync';

        if (nativeAdditionsCount > 0 || nativeRemovalsCount > 0) {
          lastChangedBy = 'native';
          changeSummary = `Updated from NextDNS Dashboard (+${nativeAdditionsCount} native rules)`;
        } else if (hasPendingAppPushes) {
          lastChangedBy = 'app';
          changeSummary = `Pending App Write Synced to NextDNS`;
        }

        profileSyncStatus[userKey] = {
          lastSyncedAt: nowIso,
          lastChangedBy,
          lastChangeSummary: changeSummary
        };
      }

      const userKeys = Object.keys(remoteMap);
      const existingGeneralDomains = (currentBlocklists.general || []).map(getDomainStr).filter(Boolean);

      // Domains in general that are present across all remote profile lists remain in general
      const newGeneralDomains: string[] = [];
      if (userKeys.length > 0) {
        existingGeneralDomains.forEach(d => {
          const presentInAll = userKeys.every(k => remoteMap[k].includes(d));
          if (presentInAll) {
            newGeneralDomains.push(d);
          }
        });
      }

      // Add newly pulled native domains if present across all remote profiles
      for (const [d, meta] of existingMetaMap.entries()) {
        if (meta.updatedBy === 'native' && userKeys.length > 0 && userKeys.every(k => remoteMap[k]?.includes(d))) {
          if (!newGeneralDomains.includes(d)) {
            newGeneralDomains.push(d);
          }
        }
      }

      const generalSet = new Set(newGeneralDomains);

      const newGeneralEntries = newGeneralDomains.sort().map(d => {
        const meta = existingMetaMap.get(d);
        return {
          domain: d,
          alertEnabled: meta?.alertEnabled ?? false,
          addedAt: meta?.addedAt || nowIso,
          updatedBy: meta?.updatedBy || 'native'
        };
      });

      const newPerUser: { [key: string]: any[] } = {};
      const defaultUserKeys = ['router', 'mine', 'ammu', 'abbu', 'others'];
      const allUserKeys = Array.from(new Set([...defaultUserKeys, ...userKeys]));

      for (const key of allUserKeys) {
        const remoteList = remoteMap[key] || [];
        const userDomains = remoteList.filter(d => !generalSet.has(d)).sort();
        newPerUser[key] = userDomains.map(d => {
          const meta = existingMetaMap.get(d);
          return {
            domain: d,
            alertEnabled: meta?.alertEnabled ?? false,
            addedAt: meta?.addedAt || nowIso,
            updatedBy: meta?.updatedBy || 'native'
          };
        });
      }

      const updatedBlocklists = {
        general: newGeneralEntries,
        perUser: newPerUser,
        lastSyncedAt: nowIso,
        profileLastSyncedAt,
        profileSyncStatus
      };

      await ServerDB.saveBlocklists(updatedBlocklists);

      // If app had pending local pushes, sync them to NextDNS profiles now
      if (hasPendingAppPushes) {
        console.log('Pushing pending local app additions to NextDNS profiles...');
        await this.syncAllProfiles();
      }

      return {
        success: true,
        message: `Two-way sync complete with NextDNS! Processed ${totalRemoteDomainsCount} active rules across ${profiles.length} profiles.`,
        blocklists: updatedBlocklists
      };
    } catch (e: any) {
      console.error('Error in pullDenylistsFromNextDNS:', e);
      return { success: false, message: `Failed to sync with NextDNS: ${e.message}` };
    }
  }

  // Fetch top domains analytics for a profile
  static async fetchTopDomains(profileId: string, limit = 10): Promise<any[]> {
    const settings = await ServerDB.getSettings();
    if (settings.nextDnsApiKey) {
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
    }

    // Derive top domains from actual recorded DB logs
    const logs = await ServerDB.getLogs();
    const profile = (await ServerDB.getProfiles()).find(p => p.id === profileId);
    const profileLogs = logs.filter(l => l.profileName === profile?.name || l.profileName?.toLowerCase() === profileId.toLowerCase());
    
    const domainCounts: { [dom: string]: { queries: number; blocks: number } } = {};
    for (const log of profileLogs) {
      if (!domainCounts[log.domain]) {
        domainCounts[log.domain] = { queries: 0, blocks: 0 };
      }
      domainCounts[log.domain].queries += 1;
      if (log.status === 'blocked') {
        domainCounts[log.domain].blocks += 1;
      }
    }

    return Object.keys(domainCounts)
      .map(dom => ({
        domain: dom,
        queries: domainCounts[dom].queries,
        blocks: domainCounts[dom].blocks
      }))
      .sort((a, b) => b.queries - a.queries)
      .slice(0, limit);
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

  private static alertCooldowns: { [key: string]: number } = {};

  // Helper to test if a domain matches the Watchlist (supports exact domain & subdomains)
  static isDomainInWatchlist(domain: string, watchlistDomains: any[]): boolean {
    if (!domain || !watchlistDomains || !Array.isArray(watchlistDomains)) return false;
    const dLower = domain.toLowerCase().trim();
    return watchlistDomains.some(w => {
      const wLower = (typeof w === 'string' ? w : (w as any)?.domain || '').toLowerCase().trim();
      if (!wLower) return false;
      return dLower === wLower || dLower.endsWith('.' + wLower);
    });
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
    const blocklists = await ServerDB.getBlocklists();

    // Formatted timestamp in UTC+06:00 (Bangladesh Standard Time / GMT+6): YYYY-MM-DD HH:mm:ss
    const pad = (n: number) => n.toString().padStart(2, '0');
    const now = new Date();
    const utc6 = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const timeFormatted = `${utc6.getUTCFullYear()}-${pad(utc6.getUTCMonth() + 1)}-${pad(utc6.getUTCDate())} ${pad(utc6.getUTCHours())}:${pad(utc6.getUTCMinutes())}:${pad(utc6.getUTCSeconds())}`;

    // Device Display formatting: "Khalamoni", "Laptop (192.168.1.15)", "103.177.55.69"
    let deviceDisplay = deviceName || clientIp || 'Unknown Device';
    if (clientIp && clientIp !== '0.0.0.0' && clientIp !== deviceName) {
      deviceDisplay = `${deviceName} (${clientIp})`;
    }

    let userKey = 'others';
    const nameLower = profileName.toLowerCase();
    if (nameLower.includes('router')) userKey = 'router';
    else if (nameLower.includes('mine')) userKey = 'mine';
    else if (nameLower.includes('ammu')) userKey = 'ammu';
    else if (nameLower.includes('abbu')) userKey = 'abbu';
    else if (nameLower.includes('others')) userKey = 'others';

    // 1. Check if domain (or any subdomain) matches Watchlist
    const isWatchlisted = this.isDomainInWatchlist(domain, watchlist.domains);

    // 2. Check if domain matches any active Denylist entry (general or profile-specific)
    let isDenylisted = false;
    let isDenylistAlertEnabled = false;

    const activeDenylist = [
      ...(blocklists.general || []),
      ...(blocklists.perUser[userKey] || [])
    ];

    for (const b of activeDenylist) {
      const bDomain = (typeof b === 'string' ? b : b?.domain || '').toLowerCase().trim();
      const dLower = domain.toLowerCase().trim();
      if (bDomain && (dLower === bDomain || dLower.endsWith('.' + bDomain))) {
        isDenylisted = true;
        if (typeof b !== 'string' && b.alertEnabled) {
          isDenylistAlertEnabled = true;
        }
      }
    }

    // 3. Always record block log in database history for analytics
    const matchedRuleName = (isWatchlisted && isDenylisted)
      ? 'Denylist & Watchlist Match'
      : isWatchlisted 
        ? 'Watchlist Match & Block' 
        : isDenylisted 
          ? 'Domain Denylist Match' 
          : 'Standard Filtering Block';

    await ServerDB.addLog({
      timestamp: now.toISOString(),
      domain,
      rootDomain: domain,
      deviceName,
      clientIp,
      status: 'blocked',
      matchedRule: matchedRuleName,
      profileName
    });

    // 4. Strict Scoping: If domain is NOT in Watchlist AND NOT in Denylist -> DO NOT SEND TELEGRAM ALERT
    if (!isWatchlisted && !isDenylisted) {
      return;
    }

    let alertMsg = '';
    let alertType: 'watchlist' | 'denylist' | 'new_block' = 'watchlist';

    // PRIORITY ORDER EVALUATION:
    // Watchlist matches are an absolute override — they ALWAYS send a Telegram alert,
    // unconditionally, regardless of whether the domain is muted/disabled in Denylist settings.
    if (isWatchlisted) {
      alertType = 'watchlist';
      if (isDenylisted) {
        // Combined match (Watchlist + Denylist): Always fires combined alert template!
        alertMsg = `🛑 <b>Explicit Denylist Access Attempt</b>\n\n` +
          `• <b>Matched List:</b> Domain Denylist & Watchlist\n` +
          `• <b>Profile:</b> <b>${profileName}</b>\n` +
          `• <b>Domain:</b> <code>${domain}</code>\n` +
          `• <b>Attempted by:</b> <b>${deviceDisplay}</b>\n` +
          `• <b>Time:</b> <b>${timeFormatted}</b>\n\n` +
          `⚠️ <i>Domain is explicitly configured on the profile denylist & Watchlist.</i>`;
      } else {
        // Watchlist match ONLY: Always fires watchlist alert template!
        alertMsg = `🛡️ <b>Watchlist Domain Access Attempt</b>\n\n` +
          `• <b>Profile:</b> <b>${profileName}</b>\n` +
          `• <b>Domain:</b> <code>${domain}</code>\n` +
          `• <b>Device:</b> <b>${deviceDisplay}</b>\n` +
          `• <b>Time:</b> <b>${timeFormatted}</b>\n\n` +
          `🛑 <i>Domain matches the Watchlist.</i>`;
      }
    } else if (isDenylisted) {
      // Denylist match ONLY:
      // Respect per-domain alert setting (alertEnabled flag).
      // If alertEnabled is false for this denylist domain, do NOT send Telegram alert.
      if (!isDenylistAlertEnabled) {
        return; // Muted denylist domain produces no Telegram message
      }

      alertType = 'denylist';
      const cooldownKey = `denylist:${userKey}:${deviceName}:${domain}`;
      const currentTime = Date.now();
      if (this.alertCooldowns[cooldownKey] && currentTime - this.alertCooldowns[cooldownKey] <= 300000) {
        return;
      }
      this.alertCooldowns[cooldownKey] = currentTime;

      alertMsg = `🛡️ <b>Denylist Domain Access Attempt</b>\n\n` +
        `• <b>Matched List:</b> Domain Blocklists\n` +
        `• <b>Profile:</b> <b>${profileName}</b>\n` +
        `• <b>Domain:</b> <code>${domain}</code>\n` +
        `• <b>Attempted by:</b> <b>${deviceDisplay}</b>\n` +
        `• <b>Time:</b> <b>${timeFormatted}</b>`;
    }

    if (alertMsg) {
      const sent = await this.sendTelegramAlert(alertMsg);
      await ServerDB.addAlert({
        timestamp: now.toISOString(),
        user: userKey,
        domain,
        deviceName,
        type: alertType,
        status: sent ? 'sent' : 'failed',
        errorMessage: sent ? undefined : 'Failed to send Telegram payload'
      });
    }
  }

  // Generate per-device analytics breakdown purely from NextDNS API across all profiles
  static async getDeviceAnalytics(): Promise<any[]> {
    const now = Date.now();
    if (this.deviceAnalyticsCache && (now - this.deviceAnalyticsCache.timestamp < this.CACHE_TTL_MS)) {
      return this.deviceAnalyticsCache.data;
    }

    const settings = await ServerDB.getSettings();

    if (settings.nextDnsApiKey) {
      try {
        const profiles = await this.getDynamicProfiles();
        const deviceAnalytics: any[] = [];
        const logs = await ServerDB.getLogs();

        for (const profile of profiles) {
          try {
            // Fetch total devices list for profile
            const res = await fetch(`https://api.nextdns.io/profiles/${profile.id}/analytics/devices?from=-7d&limit=100`, {
              headers: { 'X-Api-Key': settings.nextDnsApiKey },
            });

            if (res.ok) {
              const json = await res.json() as any;
              const rawDevices = json.data || [];

              for (let devIdx = 0; devIdx < rawDevices.length; devIdx++) {
                const item = rawDevices[devIdx];
                const rawName = (item.name || item.deviceName || item.model || '').trim();
                const rawIp = (item.ip || item.clientIp || (typeof item.id === 'string' && item.id.includes('.') ? item.id : '')).trim();

                let deviceName = '';
                if (rawName && rawName !== 'undefined' && rawName !== 'null' && rawName.toLowerCase() !== 'unidentified devices' && rawName.toLowerCase() !== 'unidentified') {
                  deviceName = rawName;
                } else if (rawIp) {
                  deviceName = rawIp;
                } else {
                  deviceName = 'Unidentified devices';
                }

                const clientIp = rawIp || (typeof item.id === 'string' ? item.id : 'N/A');
                const devParam = item.id ? item.id : encodeURIComponent(deviceName);

                const devLogs = logs.filter(l => 
                  (l.profileName === profile.name || l.profileName?.toLowerCase() === profile.id.toLowerCase()) &&
                  (
                    l.deviceName?.toLowerCase() === deviceName.toLowerCase() ||
                    l.clientIp === clientIp ||
                    (clientIp !== 'N/A' && clientIp.includes(l.clientIp))
                  )
                );
                const blockedLogs = devLogs.filter(l => l.status === 'blocked');

                let apiStatusBlockedCount = 0;
                let apiStatusTotalCount = 0;
                let blockedDomainsList: any[] = [];

                try {
                  const [resStatus, devBlockedRes] = await Promise.all([
                    fetch(`https://api.nextdns.io/profiles/${profile.id}/analytics/status?from=-7d&device=${devParam}`, {
                      headers: { 'X-Api-Key': settings.nextDnsApiKey },
                    }),
                    fetch(`https://api.nextdns.io/profiles/${profile.id}/analytics/domains?from=-7d&status=blocked&device=${devParam}&limit=100`, {
                      headers: { 'X-Api-Key': settings.nextDnsApiKey },
                    })
                  ]);

                  if (resStatus.ok) {
                    const jsonStatus = await resStatus.json() as any;
                    const statusArray = Array.isArray(jsonStatus.data) ? jsonStatus.data : (Array.isArray(jsonStatus) ? jsonStatus : []);
                    for (const sItem of statusArray) {
                      const sKey = (sItem.id || sItem.status || sItem.name || '').toString().toLowerCase();
                      const sCount = typeof sItem.queries === 'number' ? sItem.queries : (sItem.count || sItem.blocks || 0);
                      apiStatusTotalCount += sCount;
                      if (sKey === 'blocked' || sKey === 'denied' || sKey === 'blacklist' || sKey === 'block') {
                        apiStatusBlockedCount += sCount;
                      }
                    }
                  }

                  if (devBlockedRes.ok) {
                    const jsonDevDom = await devBlockedRes.json() as any;
                    const rawDevDom = jsonDevDom.data || [];
                    if (Array.isArray(rawDevDom) && rawDevDom.length > 0) {
                      blockedDomainsList = rawDevDom.map((dItem: any) => ({
                        domain: dItem.domain || dItem.name || 'unknown',
                        blocks: typeof dItem.queries === 'number' ? dItem.queries : (dItem.count || dItem.blocks || 1),
                        lastBlockedAt: new Date().toISOString()
                      }));
                    }
                  }
                } catch (e) {
                  console.error(`Error fetching device details for device ${deviceName}:`, e);
                }

                if (blockedDomainsList.length === 0 && blockedLogs.length > 0) {
                  const domainMap: { [dom: string]: { blocks: number; lastBlockedAt: string } } = {};
                  for (const log of blockedLogs) {
                    if (!domainMap[log.domain]) {
                      domainMap[log.domain] = { blocks: 0, lastBlockedAt: log.timestamp };
                    }
                    domainMap[log.domain].blocks += 1;
                    if (new Date(log.timestamp) > new Date(domainMap[log.domain].lastBlockedAt)) {
                      domainMap[log.domain].lastBlockedAt = log.timestamp;
                    }
                  }
                  blockedDomainsList = Object.keys(domainMap).map(dom => ({
                    domain: dom,
                    blocks: domainMap[dom].blocks,
                    lastBlockedAt: domainMap[dom].lastBlockedAt
                  })).sort((a, b) => b.blocks - a.blocks);
                }

                const sumDomainsBlocked = blockedDomainsList.reduce((acc: number, curr: any) => acc + (curr.blocks || 0), 0);

                let blockedQueries = 0;
                if (apiStatusBlockedCount > 0) {
                  blockedQueries = apiStatusBlockedCount;
                } else if (sumDomainsBlocked > 0) {
                  blockedQueries = sumDomainsBlocked;
                } else if (typeof item.blocks === 'number' && item.blocks > 0) {
                  blockedQueries = item.blocks;
                } else if (typeof item.blocked === 'number' && item.blocked > 0) {
                  blockedQueries = item.blocked;
                } else if (blockedLogs.length > 0) {
                  blockedQueries = blockedLogs.length;
                }

                let totalQueries = typeof item.queries === 'number' ? item.queries : (item.count || 0);
                if (apiStatusTotalCount > totalQueries && apiStatusTotalCount > 0) {
                  totalQueries = apiStatusTotalCount;
                }
                if (blockedQueries > totalQueries) {
                  totalQueries = blockedQueries;
                }

                const blockedPercentage = totalQueries > 0 
                  ? parseFloat(((blockedQueries / totalQueries) * 100).toFixed(2)) 
                  : 0;

                const topDomainsList = blockedDomainsList.map(d => ({
                  domain: d.domain,
                  queries: d.blocks,
                  blocks: d.blocks
                }));

                const uniqueDevId = (item.id && item.id !== '__UNIDENTIFIED__' && item.id !== 'unidentified')
                  ? `${profile.id}_${item.id}`
                  : `${profile.id}_${clientIp}_${deviceName}_${devIdx}`;

                deviceAnalytics.push({
                  id: uniqueDevId,
                  deviceName,
                  clientIp,
                  profileName: profile.name,
                  profileId: profile.id,
                  totalQueries,
                  blockedQueries,
                  blockedPercentage,
                  blockedDomains: blockedDomainsList,
                  topDomains: topDomainsList,
                  lastActive: devLogs[0]?.timestamp || new Date().toISOString()
                });
              }
            }
          } catch (e) {
            console.error(`Error fetching device analytics for profile ${profile.id}:`, e);
          }
        }

        if (deviceAnalytics.length > 0) {
          this.deviceAnalyticsCache = { data: deviceAnalytics, timestamp: Date.now() };
          return deviceAnalytics;
        }
      } catch (err) {
        console.error('Error fetching NextDNS device analytics:', err);
      }
    }

    if (this.deviceAnalyticsCache) {
      return this.deviceAnalyticsCache.data;
    }

    // Fallback: If no API key or API returns no devices, check actual DB logs
    const logs = await ServerDB.getLogs();
    if (!logs || logs.length === 0) {
      return [];
    }

    const deviceMap: {
      [key: string]: {
        deviceName: string;
        clientIp: string;
        profileName: string;
        logs: any[];
      }
    } = {};

    for (const log of logs) {
      const devName = log.deviceName || log.clientIp || 'Unidentified devices';
      const ip = log.clientIp || 'N/A';
      const key = `${devName.toLowerCase()}:${ip}`;

      if (!deviceMap[key]) {
        deviceMap[key] = {
          deviceName: devName,
          clientIp: ip,
          profileName: log.profileName || 'Default',
          logs: []
        };
      }
      deviceMap[key].logs.push(log);
    }

    const deviceAnalytics = [];

    for (const key of Object.keys(deviceMap)) {
      const item = deviceMap[key];
      const devLogs = item.logs;
      const blockedLogs = devLogs.filter(l => l.status === 'blocked');
      
      const domainMap: { [dom: string]: { blocks: number; lastBlockedAt: string } } = {};
      for (const log of blockedLogs) {
        if (!domainMap[log.domain]) {
          domainMap[log.domain] = { blocks: 0, lastBlockedAt: log.timestamp };
        }
        domainMap[log.domain].blocks += 1;
        if (new Date(log.timestamp) > new Date(domainMap[log.domain].lastBlockedAt)) {
          domainMap[log.domain].lastBlockedAt = log.timestamp;
        }
      }

      const blockedDomainsList = Object.keys(domainMap).map(dom => ({
        domain: dom,
        blocks: domainMap[dom].blocks,
        lastBlockedAt: domainMap[dom].lastBlockedAt
      })).sort((a, b) => b.blocks - a.blocks);

      const totalQueries = devLogs.length;
      const totalBlocksCount = blockedLogs.length;
      const blockRatePct = totalQueries > 0 
        ? parseFloat(((totalBlocksCount / totalQueries) * 100).toFixed(1)) 
        : 0;

      const topDomainsList = blockedDomainsList.map(d => ({
        domain: d.domain,
        queries: d.blocks,
        blocks: d.blocks
      }));

      const lastActiveTime = devLogs[0]?.timestamp || new Date().toISOString();

      deviceAnalytics.push({
        id: `${item.profileName}_${item.clientIp}_${item.deviceName}`,
        deviceName: item.deviceName,
        clientIp: item.clientIp,
        profileName: item.profileName,
        totalQueries,
        blockedQueries: totalBlocksCount,
        blockedPercentage: blockRatePct,
        blockedDomains: blockedDomainsList,
        topDomains: topDomainsList,
        lastActive: lastActiveTime
      });
    }

    return deviceAnalytics;
  }

  // Live monitor stream loop for a profile (SSE NextDNS API)
  static startLiveMonitor(profileId: string, profileName: string) {
    if (this.activeSSEListeners[profileId]) return;

    const monitorLoop = async () => {
      const settings = await ServerDB.getSettings();
      if (!settings.nextDnsApiKey) {
        console.log(`[Live Monitor] Waiting for NextDNS API Key to connect stream for profile ${profileName}`);
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
                  const domain = log.domain || log.name || '';
                  if (!domain) continue;

                  const watchlist = await ServerDB.getWatchlist();
                  const isWatchlisted = this.isDomainInWatchlist(domain, watchlist.domains);

                  if (isWatchlisted || log.status === 'blocked') {
                    const device = log.device?.name || log.deviceName || 'Unknown Device';
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
                      const domain = log.domain || log.name || '';
                      if (!domain) continue;

                      const watchlist = await ServerDB.getWatchlist();
                      const isWatchlisted = this.isDomainInWatchlist(domain, watchlist.domains);

                      if (isWatchlisted || log.status === 'blocked') {
                        const device = log.device?.name || log.deviceName || 'Unknown Device';
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

      } catch (err: any) {
        if (err?.message?.includes('429')) {
          console.warn(`[Live Monitor] Rate limit 429 on real SSE stream for ${profileName}. Will retry connection in 60s.`);
          setTimeout(() => this.startLiveMonitor(profileId, profileName), 60000);
        } else {
          console.error(`Error connecting real SSE stream for ${profileName}:`, err);
          setTimeout(() => this.startLiveMonitor(profileId, profileName), 30000);
        }
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

  private static processedLogKeys = new Set<string>();
  private static pollerIntervalHandle: any = null;
  private static syncIntervalHandle: any = null;

  static async pollLatestLogsForAllProfiles() {
    const settings = await ServerDB.getSettings();
    if (!settings.nextDnsApiKey) return;

    try {
      const profiles = await ServerDB.getProfiles();
      const watchlist = await ServerDB.getWatchlist();

      for (const profile of profiles) {
        try {
          const res = await fetch(`https://api.nextdns.io/profiles/${profile.id}/logs?limit=40`, {
            headers: { 'X-Api-Key': settings.nextDnsApiKey }
          });

          if (!res.ok) continue;

          const json = await res.json() as any;
          const logsArr = json.data || (Array.isArray(json) ? json : []);

          for (const log of logsArr) {
            const domain = log.domain || log.name || '';
            if (!domain) continue;

            const logTime = log.timestamp || log.time || new Date().toISOString();
            const device = log.device?.name || log.deviceName || log.device?.model || 'Unknown Device';
            const clientIp = log.clientIp || log.ip || '0.0.0.0';
            const status = log.status || 'default';

            const logKey = `${profile.id}:${domain}:${device}:${logTime}`;
            if (this.processedLogKeys.has(logKey)) continue;

            if (this.processedLogKeys.size > 2000) {
              this.processedLogKeys.clear();
            }
            this.processedLogKeys.add(logKey);

            const isWatchlisted = this.isDomainInWatchlist(domain, watchlist.domains);

            if (isWatchlisted || status === 'blocked') {
              await this.processBlockEvent(profile.id, profile.name, domain, device, clientIp);
            }
          }
        } catch (err) {
          console.error(`Error polling logs for profile ${profile.name}:`, err);
        }
      }
    } catch (e) {
      console.error('Error in tight log poller:', e);
    }
  }

  static stopAllMonitors() {
    for (const pid of Object.keys(this.activeSSEListeners)) {
      this.stopLiveMonitor(pid);
    }
    if (this.pollerIntervalHandle) {
      clearInterval(this.pollerIntervalHandle);
      this.pollerIntervalHandle = null;
    }
    if (this.syncIntervalHandle) {
      clearInterval(this.syncIntervalHandle);
      this.syncIntervalHandle = null;
    }
  }

  static async startAllMonitors() {
    try {
      const profiles = await ServerDB.getProfiles();
      profiles.forEach((profile, idx) => {
        setTimeout(() => {
          this.startLiveMonitor(profile.id, profile.name);
        }, idx * 2000);
      });

      // Start tight log polling loop (every 20s) as backup to SSE stream
      if (this.pollerIntervalHandle) {
        clearInterval(this.pollerIntervalHandle);
      }
      this.pollerIntervalHandle = setInterval(() => {
        this.pollLatestLogsForAllProfiles().catch(e => console.error('Poller error:', e));
      }, 20000);

      // Start periodic two-way denylist sync with NextDNS API (every 30s)
      if (this.syncIntervalHandle) {
        clearInterval(this.syncIntervalHandle);
      }
      this.syncIntervalHandle = setInterval(() => {
        this.pullDenylistsFromNextDNS().catch(e => console.error('Periodic denylist sync error:', e));
      }, 30000);

      // Perform initial sync on startup
      this.pullDenylistsFromNextDNS().catch(e => console.error('Initial denylist sync error:', e));
    } catch (e) {
      console.error('Failed to start all live monitors:', e);
    }
  }
}
