import { Request, Response } from 'express';
import { ServerDB } from './server-db';
import { NextDNSService } from './server-nextdns';

export class TelegramBotService {
  
  // Send reply message to a chat
  static async sendReply(chatId: string | number, text: string): Promise<boolean> {
    const settings = await ServerDB.getSettings();
    if (!settings.telegramBotToken) {
      console.warn('[TelegramBot] Cannot send reply: Bot token missing');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[TelegramBot] Send failed: ${res.status} ${errText}`);
        return false;
      }
      return true;
    } catch (err) {
      console.error('[TelegramBot] Error sending reply:', err);
      return false;
    }
  }

  // Register webhook with Telegram API
  static async registerWebhook(baseUrl: string): Promise<{ success: boolean; message: string; webhookUrl: string }> {
    const settings = await ServerDB.getSettings();
    if (!settings.telegramBotToken) {
      return { success: false, message: 'Telegram Bot Token is not configured in Settings.', webhookUrl: '' };
    }

    const cleanBase = baseUrl.replace(/\/+$/, '');
    const webhookUrl = `${cleanBase}/api/telegram/webhook`;

    try {
      const url = `https://api.telegram.org/bot${settings.telegramBotToken}/setWebhook`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });

      const json = await res.json() as any;
      if (res.ok && json.ok) {
        return { success: true, message: `Telegram Webhook successfully set to ${webhookUrl}`, webhookUrl };
      } else {
        return { success: false, message: `Telegram error: ${json.description || 'Failed to set webhook'}`, webhookUrl };
      }
    } catch (err: any) {
      return { success: false, message: `Failed to set webhook: ${err.message || err}`, webhookUrl };
    }
  }

  // Express Request Handler for POST /api/telegram/webhook
  static async handleWebhook(req: Request, res: Response) {
    // Respond to Telegram immediately with HTTP 200 to prevent retries
    res.status(200).json({ ok: true });

    try {
      const update = req.body;
      if (!update) return;

      const message = update.message || update.edited_message;
      if (!message || !message.text || !message.chat) return;

      const incomingChatId = message.chat.id ? message.chat.id.toString().trim() : '';
      const rawText = message.text.trim();

      // Check authorized chat ID
      const settings = await ServerDB.getSettings();
      const authorizedChatId = settings.telegramChatId ? settings.telegramChatId.toString().trim() : '';

      // CRITICAL REQUIREMENT:
      // Compare the incoming chat.id against the chatId already stored in settings.
      // If it doesn't match, ignore the message entirely (no reply, no action).
      if (!authorizedChatId || incomingChatId !== authorizedChatId) {
        console.warn(`[TelegramBot] Access denied for incoming chat_id: "${incomingChatId}" (Authorized: "${authorizedChatId}")`);
        return;
      }

      // Route the command
      await TelegramBotService.processCommand(incomingChatId, rawText);
    } catch (err) {
      console.error('[TelegramBot] Error handling webhook update:', err);
    }
  }

  // Process command text
  private static async processCommand(chatId: string, text: string) {
    if (!text.startsWith('/')) return;

    const tokens = text.split(/\s+/);
    let command = tokens[0].toLowerCase();
    // Normalize bot handles, e.g. /status@MyBot -> /status
    if (command.includes('@')) {
      command = command.split('@')[0];
    }

    const args = tokens.slice(1);

    try {
      switch (command) {
        case '/start':
        case '/help':
          await this.handleHelp(chatId);
          break;
        case '/status':
          await this.handleStatus(chatId);
          break;
        case '/block':
          await this.handleBlock(chatId, args);
          break;
        case '/watch':
          await this.handleWatch(chatId, args);
          break;
        case '/unwatch':
          await this.handleUnwatch(chatId, args);
          break;
        case '/report':
          await this.handleReport(chatId);
          break;
        default:
          await this.sendReply(chatId, 
            `❓ <b>Unknown Command:</b> <code>${command}</code>\n\nSend <code>/help</code> to view available commands.`
          );
          break;
      }
    } catch (err: any) {
      console.error(`[TelegramBot] Error processing command ${command}:`, err);
      await this.sendReply(chatId, `❌ <b>Internal Error:</b> ${err?.message || 'Failed to execute command. Please try again later.'}`);
    }
  }

  // /help or /start
  private static async handleHelp(chatId: string) {
    const helpMsg = `🤖 <b>nDNS Automations — Telegram Bot Console</b>\n\n` +
      `Here are your available mobile commands:\n` +
      `• <code>/status</code> — Quick traffic & block summary across all profiles\n` +
      `• <code>/block &lt;domain&gt;</code> — Add domain to Shared Denylist & sync all profiles\n` +
      `• <code>/watch &lt;domain&gt;</code> — Add domain to Watchlist Alerts\n` +
      `• <code>/unwatch &lt;domain&gt;</code> — Remove domain from Watchlist\n` +
      `• <code>/report</code> — Generate on-demand Security & Top Domains Report\n` +
      `• <code>/help</code> — Show this commands menu`;
    await this.sendReply(chatId, helpMsg);
  }

  // /status handler
  private static async handleStatus(chatId: string) {
    const profiles = await NextDNSService.getDynamicProfiles();
    const devices = await NextDNSService.getDeviceAnalytics();

    let totalQueries = 0;
    let totalBlocks = 0;
    const profileLines: string[] = [];

    for (const p of profiles) {
      const q = p.queriesLast7Days || 0;
      const b = p.blocksLast7Days || 0;
      const pct = q > 0 ? ((b / q) * 100).toFixed(1) : '0.0';
      totalQueries += q;
      totalBlocks += b;
      profileLines.push(`• <b>${p.name}:</b> ${q.toLocaleString()} queries | ${b.toLocaleString()} blocked (${pct}%)`);
    }

    const overallPct = totalQueries > 0 ? ((totalBlocks / totalQueries) * 100).toFixed(1) : '0.0';

    const statusMsg = `📊 <b>nDNS Automations — Traffic & Security Status</b>\n\n` +
      `👤 <b>Profiles Monitored:</b> ${profiles.length} Active\n` +
      `📱 <b>Active Devices:</b> ${devices.length} Tracked\n` +
      `🔍 <b>Total Queries:</b> ${totalQueries.toLocaleString()}\n` +
      `🛡️ <b>Blocked Queries:</b> ${totalBlocks.toLocaleString()} (${overallPct}% block rate)\n\n` +
      `📋 <b>Per-Profile Breakdown:</b>\n${profileLines.join('\n')}`;

    await this.sendReply(chatId, statusMsg);
  }

  // /block <domain> handler
  private static async handleBlock(chatId: string, args: string[]) {
    if (args.length === 0 || !args[0].trim()) {
      await this.sendReply(chatId, `⚠️ <b>Usage:</b> <code>/block &lt;domain&gt;</code>\nExample: <code>/block ads.example.com</code>`);
      return;
    }

    const rawDomain = args[0].trim();
    const cleanDomain = rawDomain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '')
      .trim();

    // Basic domain validation regex
    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(cleanDomain)) {
      await this.sendReply(chatId, `⚠️ <b>Invalid domain format:</b> <code>${rawDomain}</code>. Please provide a valid domain name (e.g. <code>example.com</code>).`);
      return;
    }

    const blocklists = await ServerDB.getBlocklists();
    const getDomainStr = (d: any) => (typeof d === 'string' ? d : d?.domain || '').toLowerCase().trim();
    const isAlreadyBlocked = blocklists.general.some(d => getDomainStr(d) === cleanDomain);

    if (isAlreadyBlocked) {
      await this.sendReply(chatId, `ℹ️ <b>Domain Already Blocked:</b> <code>${cleanDomain}</code> is already in your Shared Denylist.`);
      return;
    }

    // Add to general denylist
    blocklists.general.push({ domain: cleanDomain, alertEnabled: false });
    // Sort
    blocklists.general.sort((a, b) => getDomainStr(a).localeCompare(getDomainStr(b)));
    await ServerDB.saveBlocklists(blocklists);

    // Sync to NextDNS API
    const syncRes = await NextDNSService.syncAllProfiles();

    if (syncRes.success) {
      await this.sendReply(
        chatId, 
        `✅ <b>Domain Blocked & Synced!</b>\n\n` +
        `Domain <code>${cleanDomain}</code> added to Shared Denylist and synchronized across all NextDNS profiles immediately.`
      );
    } else {
      await this.sendReply(
        chatId,
        `⚠️ <b>Domain Saved Locally:</b> <code>${cleanDomain}</code> added to Shared Denylist, but NextDNS API sync returned a warning/error. It will sync on the next cycle.`
      );
    }
  }

  // /watch <domain> handler
  private static async handleWatch(chatId: string, args: string[]) {
    if (args.length === 0 || !args[0].trim()) {
      await this.sendReply(chatId, `⚠️ <b>Usage:</b> <code>/watch &lt;domain&gt;</code>\nExample: <code>/watch tiktok.com</code>`);
      return;
    }

    const rawDomain = args[0].trim();
    const cleanDomain = rawDomain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '')
      .trim();

    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(cleanDomain)) {
      await this.sendReply(chatId, `⚠️ <b>Invalid domain format:</b> <code>${rawDomain}</code>. Please provide a valid domain name.`);
      return;
    }

    const watchlist = await ServerDB.getWatchlist();
    const getDomainStr = (d: any) => (typeof d === 'string' ? d : d?.domain || '').toLowerCase().trim();
    const isWatchlisted = watchlist.domains.some(d => getDomainStr(d) === cleanDomain);

    if (isWatchlisted) {
      await this.sendReply(chatId, `ℹ️ <b>Domain Already Watchlisted:</b> <code>${cleanDomain}</code> is already on your Watchlist.`);
      return;
    }

    watchlist.domains.push(cleanDomain);
    await ServerDB.saveWatchlist(watchlist);

    await this.sendReply(
      chatId,
      `👁️ <b>Watchlist Updated!</b>\n\n` +
      `Domain <code>${cleanDomain}</code> is now watchlisted. Any access attempt across all profiles will trigger an instant alert.`
    );
  }

  // /unwatch <domain> handler
  private static async handleUnwatch(chatId: string, args: string[]) {
    if (args.length === 0 || !args[0].trim()) {
      await this.sendReply(chatId, `⚠️ <b>Usage:</b> <code>/unwatch &lt;domain&gt;</code>\nExample: <code>/unwatch tiktok.com</code>`);
      return;
    }

    const rawDomain = args[0].trim();
    const cleanDomain = rawDomain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '')
      .trim();

    const watchlist = await ServerDB.getWatchlist();
    const getDomainStr = (d: any) => (typeof d === 'string' ? d : d?.domain || '').toLowerCase().trim();
    const initialCount = watchlist.domains.length;

    watchlist.domains = watchlist.domains.filter(d => getDomainStr(d) !== cleanDomain);

    if (watchlist.domains.length === initialCount) {
      await this.sendReply(chatId, `⚠️ <b>Not Found:</b> Domain <code>${cleanDomain}</code> is not currently on your Watchlist.`);
      return;
    }

    await ServerDB.saveWatchlist(watchlist);
    await this.sendReply(
      chatId,
      `🗑️ <b>Watchlist Updated!</b>\n\n` +
      `Domain <code>${cleanDomain}</code> has been removed from Watchlist alerts.`
    );
  }

  // /report handler
  private static async handleReport(chatId: string) {
    const reportText = await this.generateReportText();
    await this.sendReply(chatId, reportText);
  }

  // Shared function for generating on-demand / scheduled top-domains report
  static async generateReportText(): Promise<string> {
    const profiles = await NextDNSService.getDynamicProfiles();
    const devices = await NextDNSService.getDeviceAnalytics();

    // Aggregate top blocked domains across all devices
    const domainBlockMap: { [dom: string]: number } = {};
    for (const dev of devices) {
      for (const bd of (dev.blockedDomains || [])) {
        domainBlockMap[bd.domain] = (domainBlockMap[bd.domain] || 0) + bd.blocks;
      }
    }

    const sortedBlocked = Object.keys(domainBlockMap)
      .map(d => ({ domain: d, blocks: domainBlockMap[d] }))
      .sort((a, b) => b.blocks - a.blocks)
      .slice(0, 5);

    const blockedListLines = sortedBlocked.length > 0
      ? sortedBlocked.map((item, i) => `${i + 1}. <code>${item.domain}</code> — <b>${item.blocks.toLocaleString()}</b> blocks`).join('\n')
      : '• <i>No blocked domain activity recorded yet.</i>';

    const topDevicesLines = devices.slice(0, 5).map(dev => 
      `• <b>${dev.deviceName}</b> (${dev.clientIp}): <b>${dev.totalQueries.toLocaleString()}</b> queries (${dev.blockedPercentage}% block rate)`
    ).join('\n') || '• <i>No device activity recorded yet.</i>';

    const now = new Date();
    const utc6 = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeFormatted = `${utc6.getUTCFullYear()}-${pad(utc6.getUTCMonth() + 1)}-${pad(utc6.getUTCDate())} ${pad(utc6.getUTCHours())}:${pad(utc6.getUTCMinutes())}:${pad(utc6.getUTCSeconds())}`;

    return `📈 <b>nDNS Automations — On-Demand Security Report</b>\n\n` +
      `⏰ <b>Generated:</b> ${timeFormatted} (UTC+06:00)\n` +
      `👥 <b>Profiles Monitored:</b> ${profiles.length}\n` +
      `📱 <b>Devices Tracked:</b> ${devices.length}\n\n` +
      `🛡️ <b>Top Blocked Domains:</b>\n${blockedListLines}\n\n` +
      `📱 <b>Top Devices Activity:</b>\n${topDevicesLines}\n\n` +
      `<i>Report generated on demand via Telegram Bot.</i>`;
  }
}
