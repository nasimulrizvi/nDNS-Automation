/**
 * NextDNS Multi-User Automation Schema & Types
 */

export interface NextDNSProfile {
  id: string;
  name: string;
  deviceCount: number;
  activeRulesCount: number;
  queriesLast7Days: number;
  blocksLast7Days: number;
  status: 'active' | 'inactive';
}

export interface AppSettings {
  nextDnsApiKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  emailAlertsEnabled: boolean;
  emailSmtpConfig?: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
  };
}

export interface DenylistItem {
  domain: string;
  alertEnabled: boolean;
  addedAt?: string;
  updatedBy?: 'native' | 'app';
}

export type DenylistEntry = string | DenylistItem;

export interface ProfileSyncStatus {
  lastSyncedAt: string;
  lastChangedBy: 'native' | 'app' | 'sync';
  lastChangeSummary: string;
}

export interface Blocklists {
  general: DenylistEntry[];
  perUser: {
    [username: string]: DenylistEntry[];
  };
  lastSyncedAt?: string;
  profileLastSyncedAt?: {
    [key: string]: string;
  };
  profileSyncStatus?: {
    [key: string]: ProfileSyncStatus;
  };
}

export interface Watchlist {
  domains: string[];
}

export interface ThreatFeed {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  isPrimaryNative?: boolean;
  lastChecked?: string;
  domainsAdded?: number;
  status: 'success' | 'failed' | 'never';
}

export interface LogEntry {
  id: string;
  timestamp: string;
  domain: string;
  rootDomain: string;
  deviceName: string;
  clientIp: string;
  status: 'blocked' | 'allowed';
  matchedRule?: string;
  profileName: string;
}

export interface AlertLogEntry {
  id: string;
  timestamp: string;
  user: string;
  domain: string;
  deviceName: string;
  type: 'watchlist' | 'new_block' | 'denylist';
  status: 'sent' | 'failed';
  errorMessage?: string;
}

export interface AnalyticsDomain {
  domain: string;
  queries: number;
  blocks: number;
}

export interface UserAnalytics {
  username: string;
  profileId: string;
  topDomains: AnalyticsDomain[];
  summary: {
    totalQueries: number;
    totalBlocks: number;
    blockedPercentage: number;
  };
}

export interface DeviceBlockedDomain {
  domain: string;
  blocks: number;
  lastBlockedAt: string;
}

export interface DeviceAnalytics {
  id?: string;
  deviceName: string;
  clientIp: string;
  profileName: string;
  profileId?: string;
  totalQueries: number;
  blockedQueries: number;
  blockedPercentage: number;
  blockedDomains: DeviceBlockedDomain[];
  topDomains: AnalyticsDomain[];
  lastActive: string;
}

export interface SystemState {
  settings: AppSettings;
  profiles: NextDNSProfile[];
  blocklists: Blocklists;
  watchlist: Watchlist;
  threatFeeds: ThreatFeed[];
  logs: LogEntry[];
  alerts: AlertLogEntry[];
  seenDomains: { [key: string]: string }; // Map of "user:domain" -> "YYYY-MM-DD"
}
