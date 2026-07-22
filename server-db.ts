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
  SystemState
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

    // DB Migration Check: if old profile data or mock names exist, wipe DATA_DIR to ensure fresh update
    try {
      const data = await fs.readFile(PROFILES_FILE, 'utf-8');
      if (data.includes('9d2c31') || data.includes('User 2')) {
        console.log('Old profile metadata schema detected. Wiping database files for automatic migration...');
        await fs.rm(DATA_DIR, { recursive: true, force: true });
        await fs.mkdir(DATA_DIR, { recursive: true });
      }
    } catch (e) {
      // File doesn't exist yet, safe to proceed
    }

    // Initialize Settings (prioritize env variables if present)
    const defaultSettings: AppSettings = {
      nextDnsApiKey: process.env.NEXTDNS_API_KEY || '',
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      emailAlertsEnabled: false,
    };
    await ensureFile<AppSettings>(SETTINGS_FILE, defaultSettings);

    // Initialize Profiles
    const defaultProfiles: NextDNSProfile[] = [
      {
        id: '3e1c94',
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

    // Initialize Blocklists
    const defaultBlocklists: Blocklists = {
      general: [
        'pornhub.com',
        'badwebsite.com',
        'doubleclick.net',
        'trackers-r-us.org',
        'coin-miner.ru',
        'malware-distribution-node.info',
        'ads-server-xyz.com',
        'phishing-portal-scam.net'
      ],
      perUser: {
        'router': [
          'ads-server-xyz.com'
        ],
        'mine': [
          'distraction-reddit.com',
          'hackernews-time-waster.org'
        ],
        'ammu': [
          'tiktok.com',
          'instagram.com'
        ],
        'abbu': [
          'tiktok.com',
          'freefiremobile.com'
        ],
        'others': [
          'gaming-portal-distraction.net',
          'roblox-unblocked.org'
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
    const defaultLogs: LogEntry[] = [
      {
        id: 'log-1',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
        domain: 'doubleclick.net',
        rootDomain: 'doubleclick.net',
        deviceName: 'MINE-Macbook',
        clientIp: '192.168.1.10',
        status: 'blocked',
        matchedRule: 'Ad & Tracker Blocklist',
        profileName: 'MINE'
      },
      {
        id: 'log-2',
        timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(), // 12 mins ago
        domain: 'freefiremobile.com',
        rootDomain: 'freefiremobile.com',
        deviceName: 'ABBU-Phone',
        clientIp: '192.168.1.15',
        status: 'blocked',
        matchedRule: 'Watchlist Match & Per-User Block',
        profileName: 'ABBU'
      },
      {
        id: 'log-3',
        timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        domain: 'google.com',
        rootDomain: 'google.com',
        deviceName: 'MINE-iPhone',
        clientIp: '192.168.1.11',
        status: 'allowed',
        profileName: 'MINE'
      },
      {
        id: 'log-4',
        timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        domain: 'roblox-unblocked.org',
        rootDomain: 'roblox-unblocked.org',
        deviceName: 'Guest-Laptop',
        clientIp: '192.168.1.20',
        status: 'blocked',
        matchedRule: 'Per-User Block',
        profileName: 'Others'
      },
      {
        id: 'log-5',
        timestamp: new Date(Date.now() - 60 * 1000 * 65).toISOString(),
        domain: 'malware-distribution-node.info',
        rootDomain: 'malware-distribution-node.info',
        deviceName: 'Home-Router',
        clientIp: '192.168.1.1',
        status: 'blocked',
        matchedRule: 'Threat Feed Ingestion',
        profileName: 'Router'
      }
    ];
    await ensureFile<LogEntry[]>(LOGS_FILE, defaultLogs);

    // Initialize Alert logs
    const defaultAlerts: AlertLogEntry[] = [
      {
        id: 'alert-1',
        timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        user: 'abbu',
        domain: 'freefiremobile.com',
        deviceName: 'ABBU-Phone',
        type: 'watchlist',
        status: 'sent'
      },
      {
        id: 'alert-2',
        timestamp: new Date(Date.now() - 60 * 1000 * 65).toISOString(),
        user: 'router',
        domain: 'malware-distribution-node.info',
        deviceName: 'Home-Router',
        type: 'new_block',
        status: 'sent'
      }
    ];
    await ensureFile<AlertLogEntry[]>(ALERTS_FILE, defaultAlerts);

    // Initialize Seen Domains (for deduplication)
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultSeen: { [key: string]: string } = {
      'router:malware-distribution-node.info': todayStr
    };
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

      // Smart fallback to environment variables if settings fields are empty
      if (!settings.nextDnsApiKey && process.env.NEXTDNS_API_KEY) {
        settings.nextDnsApiKey = process.env.NEXTDNS_API_KEY.trim();
      }
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
      return JSON.parse(await fs.readFile(THREAT_FEEDS_FILE, 'utf-8'));
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
      return JSON.parse(await fs.readFile(SEEN_DOMAINS_FILE, 'utf-8'));
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
}
