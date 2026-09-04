import { ServerDB, createOrPreserveDenylistItem } from './server-db';
import { NextDNSService } from './server-nextdns';
import { ThreatFeed } from './src/types';

export class ThreatFeedService {
  
  // Extract domains from various URL/domain formatting
  private static parseDomain(line: string): string | null {
    let clean = line.trim();
    if (!clean || clean.startsWith('#')) return null;

    // Remove http:// or https:// if present
    if (clean.includes('://')) {
      clean = clean.split('://')[1];
    }

    // Split paths/query parameters
    clean = clean.split('/')[0];

    // Split ports
    clean = clean.split(':')[0];

    // Simple domain regex validation check
    clean = clean.toLowerCase();
    if (clean && clean.includes('.') && !clean.includes(' ') && clean.length > 3) {
      return clean;
    }
    return null;
  }

  // Fetch threat feed
  static async fetchFeed(feed: ThreatFeed): Promise<string[]> {
    try {
      const res = await fetch(feed.url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      const lines = text.split('\n');
      const domains: string[] = [];

      for (const line of lines) {
        const domain = this.parseDomain(line);
        if (domain) {
          domains.push(domain);
        }
      }

      // Return unique, sorted domains (cap at 100 per run to keep things extremely performant and within denylist size envelopes)
      return Array.from(new Set(domains)).slice(0, 100);
    } catch (err: any) {
      console.error(`Failed to fetch threat feed ${feed.name}:`, err);
      throw err;
    }
  }

  // Process and ingest all enabled threat feeds
  static async ingestAllFeeds(): Promise<{ success: boolean; addedCount: number; report: string }> {
    const feeds = await ServerDB.getThreatFeeds();
    const blocklists = await ServerDB.getBlocklists();
    
    let totalAdded = 0;
    const addedDomains: string[] = [];
    const feedResults: string[] = [];
    let updatedFeeds = [...feeds];

    const getDomainStr = (d: any) => (typeof d === 'string' ? d : d?.domain || '').toLowerCase().trim();
    const currentGeneralSet = new Set<string>();
    (blocklists.general || []).forEach(item => {
      const d = getDomainStr(item);
      if (d) currentGeneralSet.add(d);
    });
    if (blocklists.perUser) {
      Object.values(blocklists.perUser).forEach(list => {
        (list || []).forEach(item => {
          const d = getDomainStr(item);
          if (d) currentGeneralSet.add(d);
        });
      });
    }

    for (let i = 0; i < updatedFeeds.length; i++) {
      const feed = updatedFeeds[i];
      if (!feed.enabled) continue;

      if (feed.isPrimaryNative || feed.id === 'nextdns-native-threats') {
        try {
          console.log(`Ingesting Primary Threat Source: NextDNS Native Threat Intelligence Feeds...`);
          const nativeRes = await NextDNSService.syncNativeThreatFeeds();
          updatedFeeds[i] = {
            ...feed,
            lastChecked: new Date().toISOString(),
            status: nativeRes.success ? 'success' : 'failed'
          };
          feedResults.push(`🛡️ ${feed.name} (Primary Source): ${nativeRes.message}`);
        } catch (err: any) {
          updatedFeeds[i] = {
            ...feed,
            lastChecked: new Date().toISOString(),
            status: 'failed'
          };
          feedResults.push(`❌ ${feed.name}: Native security sync failed (${err.message || err})`);
        }
        continue;
      }

      try {
        console.log(`Ingesting secondary threat feed: ${feed.name}...`);
        const domains = await this.fetchFeed(feed);
        
        // Find domains we don't have yet
        const newDomains = domains.filter(d => !currentGeneralSet.has(d));
        
        for (const d of newDomains) {
          currentGeneralSet.add(d);
          addedDomains.push(d);
        }

        updatedFeeds[i] = {
          ...feed,
          lastChecked: new Date().toISOString(),
          domainsAdded: (feed.domainsAdded || 0) + newDomains.length,
          status: 'success'
        };

        feedResults.push(`✅ ${feed.name}: parsed ${domains.length} items, added ${newDomains.length} new blocks.`);
        totalAdded += newDomains.length;
      } catch (err: any) {
        updatedFeeds[i] = {
          ...feed,
          lastChecked: new Date().toISOString(),
          status: 'failed'
        };
        feedResults.push(`❌ ${feed.name}: failed to fetch (${err.message || err})`);
      }
    }

    // Save updated configurations
    await ServerDB.saveThreatFeeds(updatedFeeds);

    if (totalAdded > 0) {
      const oldBlocklists = await ServerDB.getBlocklists();
      const updatedGeneral = [...blocklists.general];
      for (const d of addedDomains) {
        updatedGeneral.push(createOrPreserveDenylistItem(d, oldBlocklists, { alertEnabled: false, updatedBy: 'app' }));
      }
      updatedGeneral.sort((a, b) => getDomainStr(a).localeCompare(getDomainStr(b)));
      blocklists.general = updatedGeneral;
      await ServerDB.saveBlocklists(blocklists);
      await NextDNSService.notifyNewDenylistAdditions(oldBlocklists, blocklists, 'Threat Feed');

      // Trigger automatic NextDNS sync
      const syncResult = await NextDNSService.syncAllProfiles();

      // Telegram report broadcast
      const sampleList = addedDomains.slice(0, 10).map(d => `• <code>${d}</code>`).join('\n');
      const tailMsg = addedDomains.length > 10 ? `\n• ...and ${addedDomains.length - 10} more.` : '';
      const telegramReport = `🛡️ <b>Threat-Feed Auto-Ingest Triggered</b>\n\n` +
        `📥 Added <b>${totalAdded}</b> new malicious domains to global blocklists.\n` +
        `🔄 <b>Profile Sync Status:</b> ${syncResult.success ? 'Success' : 'Failed'}\n\n` +
        `📝 <b>Sample Blocks Added:</b>\n${sampleList}${tailMsg}\n\n` +
        `<i>All active DNS profiles have been refreshed.</i>`;

      await NextDNSService.sendTelegramAlert(telegramReport);
    }

    const report = feedResults.join('\n');
    return {
      success: true,
      addedCount: totalAdded,
      report
    };
  }
}
