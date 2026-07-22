import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { ServerDB } from './server-db';
import { NextDNSService } from './server-nextdns';
import { ThreatFeedService } from './server-threatfeed';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Bootstrap JSON storage schemas and load listeners
  await ServerDB.initialize();
  NextDNSService.startAllMonitors();

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
        const totalQueries = profile.queriesLast7Days || 120;
        const totalBlocks = profile.blocksLast7Days || 15;

        analytics.push({
          username: profile.name,
          profileId: profile.id,
          topDomains,
          summary: {
            totalQueries,
            totalBlocks,
            blockedPercentage: parseFloat(((totalBlocks / totalQueries) * 100).toFixed(1))
          }
        });
      }

      res.json({ success: true, analytics });
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

  // Save full blocklist configuration (general + perUser maps)
  app.post('/api/blocklists', async (req, res) => {
    try {
      const { blocklists } = req.body;
      if (!blocklists) {
        return res.status(400).json({ success: false, message: 'Blocklists payload missing' });
      }

      await ServerDB.saveBlocklists(blocklists);
      res.json({ success: true, message: 'Blocklists saved. Trigger synchronization to push update!' });
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
