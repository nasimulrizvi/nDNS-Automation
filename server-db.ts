import fs from 'fs/promises';
import path from 'path';
import { 
  AppSettings, 
  Blocklists, 
  Watchlist, 
  ThreatFeed, 
  LogEntry, 
  AlertLogEntry,
  NextDNSProfile,
  SystemState,
  DenylistEntry,
  DenylistItem
} from './src/types';

const DATA_DIR = path.join(process.cwd(), 'data');

// File paths
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const BLOCKLISTS_FILE = path.join(DATA_DIR, 'blocklists.json');
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
const THREAT_FEEDS_FILE = path.join(DATA_DIR, 'threat_feeds.json');
const LOGS_FILE = path.join(DATA_DIR, 'logs.json');
const ALERTS_FILE = path.join(DATA_DIR, 'alerts.json');
const SEEN_DOMAINS_FILE = path.join(DATA_DIR, 'seen_domains.json');

export const INITIAL_SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

// Helper to ensure file exists with default content
async function ensureFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
    return defaultValue;
  }
}

class Mutex {
  private mutex = Promise.resolve();

  async lock(): Promise<() => void> {
    let begin: () => void = () => {};
    const next = new Promise<void>(resolve => {
      begin = resolve;
    });
    const current = this.mutex;
    this.mutex = current.then(() => next);
    await current;
    return begin;
  }
}

export class ServerDB {
  private static initialized = false;
  private static initPromise: Promise<void> | null = null;
  private static dbMutex = new Mutex();

  static async initialize() {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {

    // Create data directory if it doesn't exist
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Initialize Settings
    const defaultSettings: AppSettings = {
      nextDnsApiKey: '',
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      emailAlertsEnabled: false,
    };
    await ensureFile<AppSettings>(SETTINGS_FILE, defaultSettings);

    // Initialize Profiles
    const defaultProfiles: NextDNSProfile[] = [
      {
        id: '3e1c94',
        name: 'Primary',
        deviceCount: 4,
        activeRulesCount: 152,
        queriesLast7Days: 28400,
        blocksLast7Days: 3200,
        status: 'active'
      },
      {
        id: '151eaf',
        name: 'Router',
        deviceCount: 5,
        activeRulesCount: 152,
        queriesLast7Days: 34500,
        blocksLast7Days: 4890,
        status: 'active'
      },
      {
        id: 'd76372',
        name: 'MINE',
        deviceCount: 3,
        activeRulesCount: 164,
        queriesLast7Days: 15450,
        blocksLast7Days: 1200,
        status: 'active'
      },
      {
        id: 'c9e833',
        name: 'AMMU',
        deviceCount: 2,
        activeRulesCount: 142,
        queriesLast7Days: 6120,
        blocksLast7Days: 850,
        status: 'active'
      },
      {
        id: '92b815',
        name: 'ABBU',
        deviceCount: 2,
        activeRulesCount: 145,
        queriesLast7Days: 7890,
        blocksLast7Days: 920,
        status: 'active'
      },
      {
        id: '38db7e',
        name: 'Others',
        deviceCount: 4,
        activeRulesCount: 130,
        queriesLast7Days: 11400,
        blocksLast7Days: 1650,
        status: 'active'
      }
    ];
    await ensureFile<NextDNSProfile[]>(PROFILES_FILE, defaultProfiles);

    // Initialize Blocklists with fixed historical timestamps so initial seeds remain permanently locked
    const defaultBlocklists: Blocklists = {
      general: [
        { domain: 'pornhub.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
        { domain: 'badwebsite.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
        { domain: 'doubleclick.net', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
        { domain: 'trackers-r-us.org', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
        { domain: 'coin-miner.ru', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
        { domain: 'malware-distribution-node.info', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
        { domain: 'ads-server-xyz.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
        { domain: 'phishing-portal-scam.net', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' }
      ],
      perUser: {
        'primary': [
          { domain: 'dl-sg-production.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' },
          { domain: 'dl.castle.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' },
          { domain: 'dl.dir.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' },
          { domain: 'gin.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' },
          { domain: 'freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
          { domain: 'craffactory.us.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' },
          { domain: 'creditappeal.ind.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' },
          { domain: 'creditappeal.sea.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' },
          { domain: 'gamesecurity.sea.freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'native' }
        ],
        'router': [
          { domain: 'ads-server-xyz.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' }
        ],
        'mine': [
          { domain: 'distraction-reddit.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
          { domain: 'hackernews-time-waster.org', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' }
        ],
        'ammu': [
          { domain: 'tiktok.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
          { domain: 'instagram.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' }
        ],
        'abbu': [
          { domain: 'tiktok.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
          { domain: 'freefiremobile.com', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' }
        ],
        'others': [
          { domain: 'gaming-portal-distraction.net', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' },
          { domain: 'roblox-unblocked.org', alertEnabled: false, addedAt: INITIAL_SEED_TIMESTAMP, updatedBy: 'app' }
        ]
      }
    };
    await ensureFile<Blocklists>(BLOCKLISTS_FILE, defaultBlocklists);

    // Initialize Watchlist
    const defaultWatchlist: Watchlist = {
      domains: [
        'freefiremobile.com',
        'super-secret-intel.net',
        'badwebsite.com'
      ]
    };
    await ensureFile<Watchlist>(WATCHLIST_FILE, defaultWatchlist);

    // Initialize Threat Feeds
    const defaultThreatFeeds: ThreatFeed[] = [
      {
        id: 'nextdns-native-threats',
        name: 'NextDNS Native Threat Intelligence Feeds',
        url: 'https://api.nextdns.io/profiles/*/security',
        enabled: true,
        isPrimaryNative: true,
        lastChecked: new Date().toISOString(),
        domainsAdded: 0,
        status: 'success'
      },
      {
        id: 'urlhaus',
        name: 'URLhaus Malware List',
        url: 'https://urlhaus.abuse.ch/downloads/text/',
        enabled: true,
        lastChecked: '2026-07-20T18:30:00Z',
        domainsAdded: 142,
        status: 'success'
      },
      {
        id: 'openphish',
        name: 'OpenPhish Core Feed',
        url: 'https://openphish.com/feed.txt',
        enabled: false,
        status: 'never'
      }
    ];
    await ensureFile<ThreatFeed[]>(THREAT_FEEDS_FILE, defaultThreatFeeds);

    // Initialize Logs
    const defaultLogs: LogEntry[] = [];
    await ensureFile<LogEntry[]>(LOGS_FILE, defaultLogs);

    // Initialize Alert logs
    const defaultAlerts: AlertLogEntry[] = [];
    await ensureFile<AlertLogEntry[]>(ALERTS_FILE, defaultAlerts);

    // Initialize Seen Domains (for deduplication and preventing repeat Telegram alerts across restarts)
    const defaultSeen: { [key: string]: string } = {};
    const seedDomains = [
      'pornhub.com', 'badwebsite.com', 'doubleclick.net', 'trackers-r-us.org',
      'coin-miner.ru', 'malware-distribution-node.info', 'ads-server-xyz.com', 'phishing-portal-scam.net',
      'dl-sg-production.freefiremobile.com', 'dl.castle.freefiremobile.com', 'dl.dir.freefiremobile.com',
      'gin.freefiremobile.com', 'freefiremobile.com', 'craffactory.us.freefiremobile.com',
      'creditappeal.ind.freefiremobile.com', 'creditappeal.sea.freefiremobile.com', 'gamesecurity.sea.freefiremobile.com',
      'distraction-reddit.com', 'hackernews-time-waster.org', 'tiktok.com', 'instagram.com',
      'gaming-portal-distraction.net', 'roblox-unblocked.org'
    ];
    for (const d of seedDomains) {
      defaultSeen[d] = INITIAL_SEED_TIMESTAMP;
      defaultSeen[`primary:${d}`] = INITIAL_SEED_TIMESTAMP;
      defaultSeen[`general:${d}`] = INITIAL_SEED_TIMESTAMP;
    }
    await ensureFile<{ [key: string]: string }>(SEEN_DOMAINS_FILE, defaultSeen);

    this.initialized = true;
    })();

    return this.initPromise;
  }

  // Settings
  static async getSettings(): Promise<AppSettings> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      const raw = await fs.readFile(SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(raw) as AppSettings;

      if (!settings.telegramBotToken && process.env.TELEGRAM_BOT_TOKEN) {
        settings.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN.trim();
      }
      if (!settings.telegramChatId && process.env.TELEGRAM_CHAT_ID) {
        settings.telegramChatId = process.env.TELEGRAM_CHAT_ID.trim();
      }

      return settings;
    } finally {
      release();
    }
  }

  static async saveSettings(settings: AppSettings): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  // Profiles
  static async getProfiles(): Promise<NextDNSProfile[]> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      return JSON.parse(await fs.readFile(PROFILES_FILE, 'utf-8'));
    } finally {
      release();
    }
  }

  static async saveProfiles(profiles: NextDNSProfile[]): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  // Blocklists
  static async getBlocklists(): Promise<Blocklists> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      return JSON.parse(await fs.readFile(BLOCKLISTS_FILE, 'utf-8'));
    } finally {
      release();
    }
  }

  static async saveBlocklists(blocklists: Blocklists): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(BLOCKLISTS_FILE, JSON.stringify(blocklists, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  // Watchlist
  static async getWatchlist(): Promise<Watchlist> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      return JSON.parse(await fs.readFile(WATCHLIST_FILE, 'utf-8'));
    } finally {
      release();
    }
  }

  static async saveWatchlist(watchlist: Watchlist): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(WATCHLIST_FILE, JSON.stringify(watchlist, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  // Threat Feeds
  static async getThreatFeeds(): Promise<ThreatFeed[]> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      const feeds = JSON.parse(await fs.readFile(THREAT_FEEDS_FILE, 'utf-8')) as ThreatFeed[];
      if (!feeds.some(f => f.id === 'nextdns-native-threats')) {
        feeds.unshift({
          id: 'nextdns-native-threats',
          name: 'NextDNS Native Threat Intelligence Feeds',
          url: 'https://api.nextdns.io/profiles/*/security',
          enabled: true,
          isPrimaryNative: true,
          lastChecked: new Date().toISOString(),
          domainsAdded: 0,
          status: 'success'
        });
      }
      return feeds;
    } finally {
      release();
    }
  }

  static async saveThreatFeeds(feeds: ThreatFeed[]): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(THREAT_FEEDS_FILE, JSON.stringify(feeds, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  // Logs
  static async getLogs(): Promise<LogEntry[]> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      return JSON.parse(await fs.readFile(LOGS_FILE, 'utf-8'));
    } finally {
      release();
    }
  }

  static async saveLogs(logs: LogEntry[]): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  static async addLog(log: Omit<LogEntry, 'id'>): Promise<LogEntry> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      const logs: LogEntry[] = JSON.parse(await fs.readFile(LOGS_FILE, 'utf-8'));
      const newLog: LogEntry = {
        ...log,
        id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      };
      logs.unshift(newLog);
      // Keep last 200 logs
      if (logs.length > 200) {
        logs.splice(200);
      }
      await fs.writeFile(LOGS_FILE, JSON.stringify(logs, null, 2), 'utf-8');
      return newLog;
    } finally {
      release();
    }
  }

  // Alerts
  static async getAlerts(): Promise<AlertLogEntry[]> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      return JSON.parse(await fs.readFile(ALERTS_FILE, 'utf-8'));
    } finally {
      release();
    }
  }

  static async saveAlerts(alerts: AlertLogEntry[]): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  static async addAlert(alert: Omit<AlertLogEntry, 'id'>): Promise<AlertLogEntry> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      const alerts: AlertLogEntry[] = JSON.parse(await fs.readFile(ALERTS_FILE, 'utf-8'));
      const newAlert: AlertLogEntry = {
        ...alert,
        id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      };
      alerts.unshift(newAlert);
      if (alerts.length > 100) {
        alerts.splice(100);
      }
      await fs.writeFile(ALERTS_FILE, JSON.stringify(alerts, null, 2), 'utf-8');
      return newAlert;
    } finally {
      release();
    }
  }

  // Seen Domains
  static async getSeenDomains(): Promise<{ [key: string]: string }> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      let seen: { [key: string]: string } = {};
      try {
        const raw = await fs.readFile(SEEN_DOMAINS_FILE, 'utf-8');
        seen = JSON.parse(raw);
      } catch {
        seen = {};
      }

      let dirty = false;
      try {
        const blRaw = await fs.readFile(BLOCKLISTS_FILE, 'utf-8');
        const bl = JSON.parse(blRaw);
        const getDomainStr = (e: any) => (typeof e === 'string' ? e : e?.domain || '').toLowerCase().trim();
        const processItem = (e: any, scopePrefix: string) => {
          const d = getDomainStr(e);
          if (d) {
            const timeVal = (typeof e === 'object' && e?.addedAt) ? e.addedAt : INITIAL_SEED_TIMESTAMP;
            if (!seen[d]) {
              seen[d] = timeVal;
              dirty = true;
            }
            if (!seen[`${scopePrefix}:${d}`]) {
              seen[`${scopePrefix}:${d}`] = timeVal;
              dirty = true;
            }
          }
        };
        if (bl.general && Array.isArray(bl.general)) {
          bl.general.forEach((e: any) => processItem(e, 'general'));
        }
        if (bl.perUser && typeof bl.perUser === 'object') {
          Object.entries(bl.perUser).forEach(([uKey, list]) => {
            if (Array.isArray(list)) list.forEach((e: any) => processItem(e, uKey));
          });
        }
      } catch (e) {
        // ignore if blocklists read fails
      }

      if (dirty) {
        await fs.writeFile(SEEN_DOMAINS_FILE, JSON.stringify(seen, null, 2), 'utf-8');
      }

      return seen;
    } finally {
      release();
    }
  }

  static async saveSeenDomains(seen: { [key: string]: string }): Promise<void> {
    await this.initialize();
    const release = await this.dbMutex.lock();
    try {
      await fs.writeFile(SEEN_DOMAINS_FILE, JSON.stringify(seen, null, 2), 'utf-8');
    } finally {
      release();
    }
  }

  // Reset helper
  static async resetAll() {
    const release = await this.dbMutex.lock();
    try {
      await fs.rm(DATA_DIR, { recursive: true, force: true });
      this.initialized = false;
      this.initPromise = null;
    } finally {
      release();
    }
    await this.initialize();
  }

  // Full state getter for UI bootstrapping
  static async getFullState(): Promise<SystemState> {
    return {
      settings: await this.getSettings(),
      profiles: await this.getProfiles(),
      blocklists: await this.getBlocklists(),
      watchlist: await this.getWatchlist(),
      threatFeeds: await this.getThreatFeeds(),
      logs: await this.getLogs(),
      alerts: await this.getAlerts(),
      seenDomains: await this.getSeenDomains(),
    };
  }

  // Audit report for verifying timestamp preservation across deploy/restart cycles
  static async getTimestampAuditReport(): Promise<{
    totalDomains: number;
    lockedCount: number;
    unlockedCount: number;
    domains: { domain: string; scope: string; addedAt: string; isLocked: boolean; updatedBy?: string }[];
  }> {
    const blocklists = await this.getBlocklists();
    const domains: { domain: string; scope: string; addedAt: string; isLocked: boolean; updatedBy?: string }[] = [];

    const processItem = (item: DenylistEntry, scope: string) => {
      const norm = typeof item === 'string' ? { domain: item, addedAt: undefined, updatedBy: undefined } : item;
      const locked = isDomainLocked(item);
      domains.push({
        domain: norm.domain,
        scope,
        addedAt: norm.addedAt || 'NONE (Pre-existing/Legacy)',
        isLocked: locked,
        updatedBy: norm.updatedBy
      });
    };

    (blocklists.general || []).forEach(item => processItem(item, 'general'));
    if (blocklists.perUser) {
      Object.entries(blocklists.perUser).forEach(([uKey, list]) => {
        (list || []).forEach(item => processItem(item, `perUser:${uKey}`));
      });
    }

    const lockedCount = domains.filter(d => d.isLocked).length;
    const unlockedCount = domains.length - lockedCount;

    return {
      totalDomains: domains.length,
      lockedCount,
      unlockedCount,
      domains
    };
  }
}

export function isDomainLocked(item: DenylistEntry): boolean {
  if (!item) return true;
  if (typeof item === 'string') return true; // Legacy string = pre-existing => locked
  const addedAt = item.addedAt;
  if (!addedAt) return true; // Missing timestamp = pre-existing => locked
  const addedMs = new Date(addedAt).getTime();
  if (isNaN(addedMs)) return true; // Unparseable date = locked
  
  const elapsedMs = Date.now() - addedMs;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  return elapsedMs > TWENTY_FOUR_HOURS_MS;
}

export function createOrPreserveDenylistItem(
  domain: string,
  existingBlocklists?: Blocklists | null,
  options?: {
    alertEnabled?: boolean;
    updatedBy?: 'native' | 'app';
    forcedAddedAt?: string;
  }
): DenylistItem {
  const cleanDomain = domain.toLowerCase().trim();

  let existingAddedAt: string | undefined = undefined;
  let existingAlertEnabled: boolean = options?.alertEnabled ?? false;
  let existingUpdatedBy: 'native' | 'app' = options?.updatedBy ?? 'app';

  if (existingBlocklists) {
    const findInList = (list: DenylistEntry[] | undefined): DenylistItem | undefined => {
      if (!list) return undefined;
      for (const item of list) {
        if (typeof item === 'object' && item !== null) {
          if ((item.domain || '').toLowerCase().trim() === cleanDomain) {
            return item;
          }
        } else if (typeof item === 'string') {
          if (item.toLowerCase().trim() === cleanDomain) {
            return { domain: cleanDomain, alertEnabled: false };
          }
        }
      }
      return undefined;
    };

    const foundGen = findInList(existingBlocklists.general);
    if (foundGen) {
      existingAddedAt = foundGen.addedAt;
      existingAlertEnabled = foundGen.alertEnabled ?? existingAlertEnabled;
      existingUpdatedBy = foundGen.updatedBy ?? existingUpdatedBy;
    } else if (existingBlocklists.perUser) {
      for (const list of Object.values(existingBlocklists.perUser)) {
        const found = findInList(list);
        if (found) {
          existingAddedAt = found.addedAt;
          existingAlertEnabled = found.alertEnabled ?? existingAlertEnabled;
          existingUpdatedBy = found.updatedBy ?? existingUpdatedBy;
          break;
        }
      }
    }
  }

  // Preservation Rule: If domain ALREADY HAS an addedAt, preserve it byte-for-byte!
  // Never blind-write a new timestamp over an existing one.
  const finalAddedAt = existingAddedAt 
    || options?.forcedAddedAt 
    || new Date().toISOString();

  return {
    domain: cleanDomain,
    alertEnabled: options?.alertEnabled ?? existingAlertEnabled,
    addedAt: finalAddedAt,
    updatedBy: options?.updatedBy ?? existingUpdatedBy,
  };
}
