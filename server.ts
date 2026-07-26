import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { ServerDB, createOrPreserveDenylistItem, isDomainLocked } from './server-db';
import { NextDNSService } from './server-nextdns';
import { ThreatFeedService } from './server-threatfeed';
import { TelegramBotService } from './server-telegram';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Bootstrap JSON storage schemas and load listeners
  await ServerDB.initialize();
  NextDNSService.startAllMonitors();

  // --- TELEGRAM BOT WEBHOOK & COMMAND ROUTES ---

  // Webhook handler called by Telegram
  app.post('/api/telegram/webhook', TelegramBotService.handleWebhook);

  // Manual or automatic Webhook Setup route
  app.post('/api/telegram/setup-webhook', async (req, res) => {
    try {
      const hostUrl = req.body.webhookUrl || `${req.protocol}://${req.get('host')}`;
      const result = await TelegramBotService.registerWebhook(hostUrl);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- API ROUTES FIRST ---

  // Get full state
  app.get('/api/state', async (req, res) => {
    try {
      const state = await ServerDB.getFullState();
      // Replace hardcoded profiles with real-time dynamically fetched/simulated ones!
      state.profiles = await NextDNSService.getDynamicProfiles();
      res.json({ success: true, state });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Get aggregated user analytics
  app.get('/api/analytics', async (req, res) => {
    try {
      const profiles = await NextDNSService.getDynamicProfiles();
      const analytics = [];

      for (const profile of profiles) {
        const topDomains = await NextDNSService.fetchTopDomains(profile.id);
        const totalQueries = profile.queriesLast7Days;
        const totalBlocks = profile.blocksLast7Days;

        analytics.push({
          username: profile.name,
          profileId: profile.id,
          topDomains,
          summary: {
            totalQueries,
            totalBlocks,
            blockedPercentage: totalQueries > 0 ? parseFloat(((totalBlocks / totalQueries) * 100).toFixed(1)) : 0
          }
        });
      }

      res.json({ success: true, analytics });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Get per-device analytics
  app.get('/api/analytics/devices', async (req, res) => {
    try {
      const devices = await NextDNSService.getDeviceAnalytics();
      res.json({ success: true, devices });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Update app configurations
  app.post('/api/settings', async (req, res) => {
    try {
      const { settings } = req.body;
      if (!settings) {
        return res.status(400).json({ success: false, message: 'Settings payload missing' });
      }

      await ServerDB.saveSettings(settings);

      // Verify and restart SSE log streaming with new credentials if updated
      NextDNSService.stopAllMonitors();
      NextDNSService.startAllMonitors();

      res.json({ success: true, message: 'Settings updated and monitors restarted successfully!' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Save full blocklist configuration (general + perUser maps) & push to NextDNS API
  app.post('/api/blocklists', async (req, res) => {
    try {
      const { blocklists } = req.body;
      if (!blocklists) {
        return res.status(400).json({ success: false, message: 'Blocklists payload missing' });
      }

      const currentBlocklists = await ServerDB.getBlocklists();
      const getDomainKey = (e: any) => (typeof e === 'string' ? e : e?.domain || '').toLowerCase().trim();

      // Check general removals against 24-hour lock
      const incomingGenSet = new Set((blocklists.general || []).map(getDomainKey));
      for (const item of (currentBlocklists.general || [])) {
        const dKey = getDomainKey(item);
        if (dKey && !incomingGenSet.has(dKey)) {
          if (isDomainLocked(item)) {
            return res.status(403).json({
              success: false,
              message: `Removal refused: Domain "${dKey}" is locked because its 24-hour grace period has passed.`
            });
          }
        }
      }

      // Check perUser removals against 24-hour lock
      for (const uKey of Object.keys(currentBlocklists.perUser || {})) {
        const curList = currentBlocklists.perUser[uKey] || [];
        const incList = (blocklists.perUser && blocklists.perUser[uKey]) || [];
        const incSet = new Set(incList.map(getDomainKey));

        for (const item of curList) {
          const dKey = getDomainKey(item);
          if (dKey && !incSet.has(dKey)) {
            if (isDomainLocked(item)) {
              return res.status(403).json({
                success: false,
                message: `Removal refused: Domain "${dKey}" in profile "${uKey}" is locked because its 24-hour grace period has passed.`
              });
            }
          }
        }
      }

      // Sanitize and preserve timestamps for all items in payload
      const sanitizedGeneral = (blocklists.general || []).map((e: any) => {
        const d = getDomainKey(e);
        const alertEnabled = typeof e === 'object' ? Boolean(e.alertEnabled) : false;
        const forcedAddedAt = typeof e === 'object' && e?.addedAt ? e.addedAt : undefined;
        return createOrPreserveDenylistItem(d, currentBlocklists, { alertEnabled, forcedAddedAt });
      });

      const sanitizedPerUser: { [key: string]: any[] } = {};
      if (blocklists.perUser) {
        for (const [uKey, list] of Object.entries(blocklists.perUser)) {
          sanitizedPerUser[uKey] = ((list as any[]) || []).map((e: any) => {
            const d = getDomainKey(e);
            const alertEnabled = typeof e === 'object' ? Boolean(e.alertEnabled) : false;
            const forcedAddedAt = typeof e === 'object' && e?.addedAt ? e.addedAt : undefined;
            return createOrPreserveDenylistItem(d, currentBlocklists, { alertEnabled, forcedAddedAt });
          });
        }
      }

      const finalBlocklists = {
        ...blocklists,
        general: sanitizedGeneral,
        perUser: sanitizedPerUser,
      };

      await ServerDB.saveBlocklists(finalBlocklists);
      await NextDNSService.notifyNewDenylistAdditions(currentBlocklists, finalBlocklists, 'Manual UI');

      const syncRes = await NextDNSService.syncAllProfiles();
      res.json({ success: true, message: 'Blocklists saved and synchronized to NextDNS!', sync: syncRes });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Pull denylists from NextDNS API to sync local state
  app.post('/api/blocklists/pull', async (req, res) => {
    try {
      const result = await NextDNSService.pullDenylistsFromNextDNS();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Timestamp audit report endpoint for deploy/restart verification
  app.get('/api/blocklists/audit', async (req, res) => {
    try {
      const report = await ServerDB.getTimestampAuditReport();
      res.json({ success: true, ...report });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Save watchlist configurations
  app.post('/api/watchlist', async (req, res) => {
    try {
      const { watchlist } = req.body;
      if (!watchlist) {
        return res.status(400).json({ success: false, message: 'Watchlist payload missing' });
      }

      await ServerDB.saveWatchlist(watchlist);
      res.json({ success: true, message: 'Watchlist domains updated successfully' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Dispatch test Telegram alert for Watchlist domain
  app.post('/api/watchlist/test-alert', async (req, res) => {
    try {
      const watchlist = await ServerDB.getWatchlist();
      const targetDomain = watchlist.domains[0] || 'freefiremobile.com';
      const profiles = await ServerDB.getProfiles();
      const testProfile = profiles[0]?.name || 'MINE';

      const pad = (n: number) => n.toString().padStart(2, '0');
      const now = new Date();
      const utc6 = new Date(now.getTime() + 6 * 60 * 60 * 1000);
      const timeFormatted = `${utc6.getUTCFullYear()}-${pad(utc6.getUTCMonth() + 1)}-${pad(utc6.getUTCDate())} ${pad(utc6.getUTCHours())}:${pad(utc6.getUTCMinutes())}:${pad(utc6.getUTCSeconds())}`;

      const alertMsg = `🚨 <b>[TEST] Watchlist Access Violation Triggered!</b>\n\n` +
        `Profile: <b>${testProfile}</b>\n` +
        `Domain: <code>${targetDomain}</code>\n` +
        `Attempted by: <b>Test Mobile Device (192.168.1.50)</b>\n` +
        `Time: <b>${timeFormatted}</b>\n\n` +
        `⚠️ <i>This is a manual test dispatch from NextDNS Guard.</i>`;

      const sent = await NextDNSService.sendTelegramAlert(alertMsg);
      await ServerDB.addAlert({
        timestamp: now.toISOString(),
        user: 'mine',
        domain: targetDomain,
        deviceName: 'Test Mobile Device',
        type: 'watchlist',
        status: sent ? 'sent' : 'failed',
        errorMessage: sent ? undefined : 'Failed to dispatch Telegram payload'
      });

      if (sent) {
        res.json({ success: true, message: `Test Telegram alert sent for ${targetDomain}!` });
      } else {
        res.status(500).json({ success: false, message: 'Telegram dispatch failed. Check Bot Token and Chat ID in Settings.' });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Manual Trigger: Profile Sync
  app.post('/api/sync', async (req, res) => {
    try {
      const result = await NextDNSService.syncAllProfiles();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Manual Trigger: Threat Feed Ingestion
  app.post('/api/threat-feeds/ingest', async (req, res) => {
    try {
      const result = await ThreatFeedService.ingestAllFeeds();
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Update threat feed configs
  app.post('/api/threat-feeds/config', async (req, res) => {
    try {
      const { feeds } = req.body;
      if (!feeds) return res.status(400).json({ success: false, message: 'Feeds missing' });
      await ServerDB.saveThreatFeeds(feeds);
      res.json({ success: true, message: 'Threat feed configurations saved' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Clear log history
  app.post('/api/logs/clear', async (req, res) => {
    try {
      await ServerDB.saveLogs([]);
      await ServerDB.saveAlerts([]);
      res.json({ success: true, message: 'Security logs and alert dispatch records cleared.' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // Reset database state to mock pristine defaults
  app.post('/api/db/reset', async (req, res) => {
    try {
      NextDNSService.stopAllMonitors();
      await ServerDB.resetAll();
      NextDNSService.startAllMonitors();
      res.json({ success: true, message: 'Database reset to default template state.' });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- VITE MIDDLEWARE SETUP FOR DEV/PROD ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NextDNS Automation Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
