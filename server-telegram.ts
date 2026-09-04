import { Request, Response } from 'express';
import { ServerDB, createOrPreserveDenylistItem } from './server-db';
import { NextDNSService, getProfileKey } from './server-nextdns';

export class TelegramBotService {
  
  // Send reply message to a chat
  static async sendReply(chatId: string | number, text: string, replyMarkup?: any): Promise<boolean> {
    const settings = await ServerDB.getSettings();
    if (!settings.telegramBotToken) {
      console.warn('[TelegramBot] Cannot send reply: Bot token missing');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

  // Answer inline callback query
  static async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    const settings = await ServerDB.getSettings();
    if (!settings.telegramBotToken) return false;
    try {
      const url = `https://api.telegram.org/bot${settings.telegramBotToken}/answerCallbackQuery`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text: text || ''
        })
      });
      return true;
    } catch (err) {
      console.error('[TelegramBot] Error answering callback query:', err);
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

      // Also set bot commands menu for BotFather
      try {
        const cmdUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/setMyCommands`;
        await fetch(cmdUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commands: [
              { command: 'status', description: 'Quick traffic & block summary across profiles' },
              { command: 'block', description: 'Add domain to Shared General, or a specific profile' },
              { command: 'unblock', description: 'Unblock domain (within 24h) from Shared General or profile' },
              { command: 'watch', description: 'Add domain to Watchlist Alerts' },
              { command: 'unwatch', description: 'Remove domain from Watchlist' },
              { command: 'report', description: 'Generate on-demand Security & Top Domains Report' },
              { command: 'help', description: 'Show available bot commands' }
            ]
          })
        });
      } catch (e) {
        console.warn('[TelegramBot] Could not setMyCommands:', e);
      }

      if (res.ok && json.ok) {
        return { success: true, message: `Telegram Webhook successfully set to ${webhookUrl}`, webhookUrl };
      } else {
        return { success: false, message: `Telegram error: ${json.description || 'Failed to set webhook'}`, webhookUrl };
      }
    } catch (err: any) {
      return { success: false, message: `Failed to set webhook: ${err.message || err}`, webhookUrl };
    }
  }

  private static isPolling = false;
  private static pollingAbortController: AbortController | null = null;
  private static processedUpdateIds = new Set<number>();
  private static lastUpdateOffset = 0;

  // Start Background Long-Polling for Telegram Updates
  static async startPolling(): Promise<void> {
    const settings = await ServerDB.getSettings();
    if (!settings.telegramBotToken) {
      console.log('[TelegramBot] Long polling not started: No Telegram Bot Token configured.');
      return;
    }

    if (this.isPolling) {
      console.log('[TelegramBot] Long polling is already active.');
      return;
    }

    this.isPolling = true;
    this.pollingAbortController = new AbortController();

    console.log('[TelegramBot] Initializing Telegram Long-Polling engine...');

    // Clear any stale webhook to allow getUpdates
    try {
      const delUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/deleteWebhook?drop_pending_updates=false`;
      const delRes = await fetch(delUrl);
      const delJson = await delRes.json() as any;
      console.log('[TelegramBot] Webhook status for long polling:', delJson?.description || delJson?.ok);
    } catch (e) {
      console.warn('[TelegramBot] Could not delete webhook prior to polling:', e);
    }

    // Set bot commands menu in BotFather
    try {
      const cmdUrl = `https://api.telegram.org/bot${settings.telegramBotToken}/setMyCommands`;
      await fetch(cmdUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'status', description: 'Quick traffic & block summary across profiles' },
            { command: 'block', description: 'Add domain to Shared General or profile' },
            { command: 'unblock', description: 'Unblock domain (within 24h) from Shared General or profile' },
            { command: 'watch', description: 'Add domain to Watchlist Alerts' },
            { command: 'unwatch', description: 'Remove domain from Watchlist' },
            { command: 'report', description: 'Generate on-demand Security & Top Domains Report' },
            { command: 'help', description: 'Show available bot commands' }
          ]
        })
      });
    } catch (e) {
      console.warn('[TelegramBot] Could not setMyCommands:', e);
    }

    // Long-polling worker loop
    (async () => {
      let consecutiveErrors = 0;
      while (this.isPolling) {
        try {
          const currentSettings = await ServerDB.getSettings();
          const token = currentSettings.telegramBotToken;
          if (!token) {
            console.log('[TelegramBot] Bot token removed. Stopping polling.');
            this.stopPolling();
            break;
          }

          const offsetParam = this.lastUpdateOffset > 0 ? `&offset=${this.lastUpdateOffset}` : '';
          const url = `https://api.telegram.org/bot${token}/getUpdates?timeout=20&limit=50${offsetParam}&allowed_updates=["message","callback_query","edited_message"]`;

          const res = await fetch(url, {
            signal: this.pollingAbortController?.signal
          });

          if (!res.ok) {
            const errText = await res.text();
            console.warn(`[TelegramBot] getUpdates non-ok (${res.status}):`, errText);
            consecutiveErrors++;
            const backoff = Math.min(consecutiveErrors * 2000, 15000);
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }

          const data = await res.json() as any;
          if (data.ok && Array.isArray(data.result)) {
            consecutiveErrors = 0;
            for (const update of data.result) {
              if (typeof update.update_id === 'number') {
                this.lastUpdateOffset = update.update_id + 1;

                if (this.processedUpdateIds.has(update.update_id)) {
                  continue;
                }
                this.processedUpdateIds.add(update.update_id);
                if (this.processedUpdateIds.size > 2000) {
                  this.processedUpdateIds.clear();
                }

                // Process update asynchronously
                this.processUpdate(update).catch(err => {
                  console.error('[TelegramBot] Error processing update:', err);
                });
              }
            }
          }
        } catch (err: any) {
          if (err?.name === 'AbortError' || !this.isPolling) {
            console.log('[TelegramBot] Long-polling aborted.');
            break;
          }
          consecutiveErrors++;
          console.warn('[TelegramBot] Polling loop exception:', err?.message || err);
          const backoff = Math.min(consecutiveErrors * 2000, 10000);
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    })();
  }

  // Stop background polling
  static stopPolling(): void {
    this.isPolling = false;
    if (this.pollingAbortController) {
      try {
        this.pollingAbortController.abort();
      } catch (e) {}
      this.pollingAbortController = null;
    }
    console.log('[TelegramBot] Long polling stopped.');
  }

  // Unified Update Processor (used by both Long Polling and Webhooks)
  static async processUpdate(update: any): Promise<void> {
    if (!update) return;

    try {
      const settings = await ServerDB.getSettings();
      const authorizedChatId = settings.telegramChatId ? settings.telegramChatId.toString().trim() : '';

      // Handle Callback Queries (inline keyboard button taps)
      if (update.callback_query) {
        const cb = update.callback_query;
        const incomingChatId = cb.message?.chat?.id ? cb.message.chat.id.toString().trim() : '';

        if (!authorizedChatId || incomingChatId !== authorizedChatId) {
          console.warn(`[TelegramBot] Access denied for callback query chat_id: "${incomingChatId}" (Authorized: "${authorizedChatId}")`);
          return;
        }

        await TelegramBotService.answerCallbackQuery(cb.id);
        await TelegramBotService.processCallbackQuery(incomingChatId, cb.data);
        return;
      }

      const message = update.message || update.edited_message;
      if (!message || !message.text || !message.chat) return;

      const incomingChatId = message.chat.id ? message.chat.id.toString().trim() : '';
      const rawText = message.text.trim();

      // If authorizedChatId is configured, enforce security
      if (authorizedChatId && incomingChatId !== authorizedChatId) {
        console.warn(`[TelegramBot] Access denied for incoming chat_id: "${incomingChatId}" (Authorized: "${authorizedChatId}")`);
        return;
      }

      // If authorizedChatId was not yet saved, save it now from first incoming message
      if (!authorizedChatId && incomingChatId) {
        settings.telegramChatId = incomingChatId;
        await ServerDB.saveSettings(settings);
        console.log(`[TelegramBot] Auto-configured authorized telegramChatId to ${incomingChatId}`);
      }

      // Route the command
      await TelegramBotService.processCommand(incomingChatId, rawText);
    } catch (err) {
      console.error('[TelegramBot] Error in processUpdate:', err);
    }
  }

  // Express Request Handler for POST /api/telegram/webhook
  static async handleWebhook(req: Request, res: Response) {
    // Respond to Telegram immediately with HTTP 200 to prevent retries
    res.status(200).json({ ok: true });

    try {
      const update = req.body;
      if (!update) return;

      if (typeof update.update_id === 'number') {
        if (TelegramBotService.processedUpdateIds.has(update.update_id)) {
          return;
        }
        TelegramBotService.processedUpdateIds.add(update.update_id);
      }

      await TelegramBotService.processUpdate(update);
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
      const settings = await ServerDB.getSettings();
      if (!settings.nextDnsApiKey && command !== '/help' && command !== '/start') {
        await this.sendReply(
          chatId,
          `⚠️ <b>NextDNS Account Not Connected</b>\n\nNextDNS API Key is not configured. Please open Settings in the web dashboard and enter your NextDNS API Key to use bot controls.`
        );
        return;
      }

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
        case '/unblock':
          await this.handleUnblock(chatId, args);
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

  // Helper to match user input string to profile
  private static async findProfileMatch(input: string): Promise<{ userKey: string; profileName: string; isGeneral: boolean } | null> {
    const clean = input.trim().toLowerCase();
    if (clean === 'general' || clean === 'shared' || clean === 'all') {
      return { userKey: 'general', profileName: 'Shared General', isGeneral: true };
    }

    const profiles = await NextDNSService.getDynamicProfiles();

    // 1. Exact match on ID or Key
    for (const p of profiles) {
      const key = getProfileKey(p);
      if (p.id.toLowerCase() === clean || key.toLowerCase() === clean) {
        return { userKey: key, profileName: p.name, isGeneral: false };
      }
    }

    // 2. Exact match on Name
    for (const p of profiles) {
      if (p.name.toLowerCase() === clean) {
        const key = getProfileKey(p);
        return { userKey: key, profileName: p.name, isGeneral: false };
      }
    }

    // 3. Partial match on Name or Key
    for (const p of profiles) {
      const key = getProfileKey(p);
      if (p.name.toLowerCase().includes(clean) || clean.includes(p.name.toLowerCase()) || key.toLowerCase().includes(clean)) {
        return { userKey: key, profileName: p.name, isGeneral: false };
      }
    }

    return null;
  }

  // Callback query handler
  static async processCallbackQuery(chatId: string, data: string) {
    if (!data) return;

    if (data.startsWith('block_p:')) {
      // Format: block_p:userKey:domain
      const parts = data.split(':');
      if (parts.length >= 3) {
        const uKey = parts[1];
        const domain = parts.slice(2).join(':');
        const profiles = await NextDNSService.getDynamicProfiles();
        const pMatch = profiles.find(p => getProfileKey(p) === uKey);
        const profileName = pMatch ? pMatch.name : uKey.toUpperCase();
        await this.blockDomainInProfile(chatId, domain, uKey, profileName);
      }
    } else if (data.startsWith('block_hint:')) {
      const uKey = data.replace('block_hint:', '');
      const profiles = await NextDNSService.getDynamicProfiles();
      const pMatch = profiles.find(p => getProfileKey(p) === uKey);
      const pName = pMatch ? pMatch.name : uKey.toUpperCase();
      await this.sendReply(chatId, `💡 <b>To block for ${pName}:</b>\nSend <code>/block &lt;domain&gt; ${pName}</code>\nExample: <code>/block game.com ${pName}</code>`);
    }
  }

  // /help or /start
  private static async handleHelp(chatId: string) {
    const helpMsg = `🤖 <b>nDNS Automations — Telegram Bot Console</b>\n\n` +
      `Here are your available mobile commands:\n` +
      `• <code>/status</code> — Quick traffic & block summary across all profiles\n` +
      `• <code>/block &lt;domain&gt; [profile]</code> — Add domain to Shared General or specific profile (e.g. <code>/block freefire.com AMMU</code>)\n` +
      `• <code>/unblock &lt;domain&gt; [profile]</code> — Unblock domain (within 24h) from Shared General or specific profile\n` +
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

  // /block <domain> [profile] handler
  private static async handleBlock(chatId: string, args: string[]) {
    if (args.length === 0 || !args[0].trim()) {
      const profiles = await NextDNSService.getDynamicProfiles();
      const inlineKeyboard: any[] = [];
      let row: any[] = [];
      for (const p of profiles) {
        const uKey = getProfileKey(p);
        row.push({ text: p.name, callback_data: `block_hint:${uKey}` });
        if (row.length === 2) {
          inlineKeyboard.push(row);
          row = [];
        }
      }
      if (row.length > 0) inlineKeyboard.push(row);

      await this.sendReply(
        chatId,
        `⚠️ <b>Usage:</b> <code>/block &lt;domain&gt; [profile]</code>\n\n` +
        `<b>Examples:</b>\n` +
        `• <code>/block ads.example.com</code> (Shared General — all profiles)\n` +
        `• <code>/block freefire.com AMMU</code> (AMMU profile only)\n\n` +
        `<i>Tap a profile below for syntax guide:</i>`,
        { inline_keyboard: inlineKeyboard }
      );
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
      await this.sendReply(chatId, `⚠️ <b>Invalid domain format:</b> <code>${rawDomain}</code>. Please provide a valid domain name (e.g. <code>example.com</code>).`);
      return;
    }

    const profileArg = args.length > 1 ? args.slice(1).join(' ').trim() : null;

    if (profileArg) {
      const match = await this.findProfileMatch(profileArg);
      if (!match) {
        const profiles = await NextDNSService.getDynamicProfiles();
        const available = ['Shared General', ...profiles.map(p => p.name)].join(', ');
        await this.sendReply(chatId, `⚠️ <b>Profile Not Found:</b> <code>${profileArg}</code>\n\nAvailable profiles: <code>${available}</code>`);
        return;
      }

      if (match.isGeneral) {
        await this.blockDomainInGeneral(chatId, cleanDomain, false);
      } else {
        await this.blockDomainInProfile(chatId, cleanDomain, match.userKey, match.profileName);
      }
    } else {
      // Default to Shared General + attach inline keyboard to also add to specific profile
      await this.blockDomainInGeneral(chatId, cleanDomain, true);
    }
  }

  // Add domain to Shared General
  private static async blockDomainInGeneral(chatId: string, cleanDomain: string, showProfileButtons: boolean = false) {
    const oldBlocklists = await ServerDB.getBlocklists();
    const blocklists = JSON.parse(JSON.stringify(oldBlocklists));
    const getDomainStr = (d: any) => (typeof d === 'string' ? d : d?.domain || '').toLowerCase().trim();
    const isAlreadyBlocked = (blocklists.general || []).some(d => getDomainStr(d) === cleanDomain);

    let keyboard: any = null;
    if (showProfileButtons) {
      const profiles = await NextDNSService.getDynamicProfiles();
      const rows: any[] = [];
      let currentRow: any[] = [];
      for (const p of profiles) {
        const uKey = getProfileKey(p);
        currentRow.push({
          text: `+ ${p.name}`,
          callback_data: `block_p:${uKey}:${cleanDomain}`
        });
        if (currentRow.length === 2) {
          rows.push(currentRow);
          currentRow = [];
        }
      }
      if (currentRow.length > 0) rows.push(currentRow);
      if (rows.length > 0) {
        keyboard = { inline_keyboard: rows };
      }
    }

    if (isAlreadyBlocked) {
      await this.sendReply(
        chatId,
        `ℹ️ <b>Domain Already Blocked:</b> <code>${cleanDomain}</code> is already in <b>Shared General (all profiles)</b>.` +
        (showProfileButtons ? `\n\n<i>Also scope to a specific profile:</i>` : ''),
        keyboard
      );
      return;
    }

    blocklists.general.push(createOrPreserveDenylistItem(cleanDomain, oldBlocklists, { alertEnabled: false, updatedBy: 'app' }));
    blocklists.general.sort((a, b) => getDomainStr(a).localeCompare(getDomainStr(b)));
    await ServerDB.saveBlocklists(blocklists);
    await NextDNSService.notifyNewDenylistAdditions(oldBlocklists, blocklists, '/block command');

    const syncRes = await NextDNSService.syncAllProfiles();
    const extraMsg = showProfileButtons ? `\n\n<i>Also scope to a specific profile:</i>` : '';

    if (syncRes.success) {
      await this.sendReply(
        chatId, 
        `✅ <b>Domain Blocked & Synced!</b>\n\n` +
        `Domain <code>${cleanDomain}</code> added to <b>Shared General (all profiles)</b> and synchronized across all NextDNS profiles immediately.` +
        extraMsg,
        keyboard
      );
    } else {
      await this.sendReply(
        chatId,
        `⚠️ <b>Domain Saved Locally:</b> <code>${cleanDomain}</code> added to <b>Shared General (all profiles)</b>, but NextDNS API sync returned a warning. It will sync on the next cycle.` +
        extraMsg,
        keyboard
      );
    }
  }

  // Add domain to specific profile's userKey
  private static async blockDomainInProfile(chatId: string, cleanDomain: string, userKey: string, profileName: string) {
    const oldBlocklists = await ServerDB.getBlocklists();
    const blocklists = JSON.parse(JSON.stringify(oldBlocklists));
    if (!blocklists.perUser) blocklists.perUser = {};
    if (!blocklists.perUser[userKey]) blocklists.perUser[userKey] = [];

    const getDomainStr = (d: any) => (typeof d === 'string' ? d : d?.domain || '').toLowerCase().trim();
    const isAlreadyBlocked = blocklists.perUser[userKey].some(d => getDomainStr(d) === cleanDomain);

    if (isAlreadyBlocked) {
      await this.sendReply(chatId, `ℹ️ <b>Domain Already Blocked:</b> <code>${cleanDomain}</code> is already in the denylist for <b>Profile ${profileName}</b>.`);
      return;
    }

    blocklists.perUser[userKey].push(createOrPreserveDenylistItem(cleanDomain, oldBlocklists, { alertEnabled: false, updatedBy: 'app' }));
    blocklists.perUser[userKey].sort((a, b) => getDomainStr(a).localeCompare(getDomainStr(b)));
    await ServerDB.saveBlocklists(blocklists);
    await NextDNSService.notifyNewDenylistAdditions(oldBlocklists, blocklists, `/block command (${profileName})`);

    const syncRes = await NextDNSService.syncAllProfiles();

    if (syncRes.success) {
      await this.sendReply(
        chatId,
        `✅ <b>Domain Blocked & Synced!</b>\n\n` +
        `Domain <code>${cleanDomain}</code> added to <b>Profile ${profileName}</b> and synchronized to NextDNS immediately.`
      );
    } else {
      await this.sendReply(
        chatId,
        `⚠️ <b>Domain Saved Locally:</b> <code>${cleanDomain}</code> added to <b>Profile ${profileName}</b>, but NextDNS API sync returned a warning.`
      );
    }
  }

  // /unblock <domain> [profile] handler
  private static async handleUnblock(chatId: string, args: string[]) {
    if (args.length === 0 || !args[0].trim()) {
      await this.sendReply(
        chatId,
        `⚠️ <b>Usage:</b> <code>/unblock &lt;domain&gt; [profile]</code>\n\n` +
        `<b>Examples:</b>\n` +
        `• <code>/unblock ads.example.com</code> (Shared General)\n` +
        `• <code>/unblock freefire.com AMMU</code> (AMMU profile only)`
      );
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

    const profileArg = args.length > 1 ? args.slice(1).join(' ').trim() : null;
    const blocklists = await ServerDB.getBlocklists();
    const getDomainStr = (d: any) => (typeof d === 'string' ? d : d?.domain || '').toLowerCase().trim();

    const isLocked = (item: any): boolean => {
      if (!item) return true;
      const addedAt = typeof item === 'string' ? null : item.addedAt;
      if (!addedAt) return true;
      const addedMs = new Date(addedAt).getTime();
      if (isNaN(addedMs)) return true;
      return Date.now() - addedMs > 24 * 60 * 60 * 1000;
    };

    const formatAddedAt = (item: any): string => {
      const addedAt = typeof item === 'string' ? null : item?.addedAt;
      if (!addedAt) return 'pre-existing (no timestamp)';
      const d = new Date(addedAt);
      if (isNaN(d.getTime())) return 'pre-existing (no timestamp)';
      const utc6 = new Date(d.getTime() + 6 * 60 * 60 * 1000);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${utc6.getUTCFullYear()}-${pad(utc6.getUTCMonth() + 1)}-${pad(utc6.getUTCDate())} ${pad(utc6.getUTCHours())}:${pad(utc6.getUTCMinutes())}:${pad(utc6.getUTCSeconds())} (UTC+06:00)`;
    };

    if (profileArg) {
      // Specific profile requested
      const match = await this.findProfileMatch(profileArg);
      if (!match) {
        const profiles = await NextDNSService.getDynamicProfiles();
        const available = ['Shared General', ...profiles.map(p => p.name)].join(', ');
        await this.sendReply(chatId, `⚠️ <b>Profile Not Found:</b> <code>${profileArg}</code>\n\nAvailable profiles: <code>${available}</code>`);
        return;
      }

      if (match.isGeneral) {
        const genIndex = (blocklists.general || []).findIndex(item => getDomainStr(item) === cleanDomain);
        if (genIndex === -1) {
          await this.sendReply(chatId, `⚠️ <b>Not Found in Shared General:</b> Domain <code>${cleanDomain}</code> is not present on <b>Shared General (all profiles)</b>.`);
          return;
        }
        const item = blocklists.general[genIndex];
        if (isLocked(item)) {
          await this.sendReply(
            chatId,
            `🔒 <b>Domain Removal Locked:</b>\n\n` +
            `Domain <code>${cleanDomain}</code> in <b>Shared General (all profiles)</b> is locked because its 24-hour grace period has passed.\n\n` +
            `<b>Added At:</b> ${formatAddedAt(item)}\n` +
            `Locked domains can no longer be unblocked via nDNS Automations.`
          );
          return;
        }
        blocklists.general.splice(genIndex, 1);
        await ServerDB.saveBlocklists(blocklists);
        const syncRes = await NextDNSService.syncAllProfiles();
        if (syncRes.success) {
          await this.sendReply(chatId, `🔓 <b>Domain Unblocked & Synced!</b>\n\nDomain <code>${cleanDomain}</code> removed from <b>Shared General (all profiles)</b> and unblocked across NextDNS profiles immediately.`);
        } else {
          await this.sendReply(chatId, `⚠️ <b>Domain Removed Locally:</b> <code>${cleanDomain}</code> removed from <b>Shared General (all profiles)</b>, but NextDNS API sync returned a warning.`);
        }
      } else {
        const userList = (blocklists.perUser && blocklists.perUser[match.userKey]) || [];
        const uIndex = userList.findIndex(item => getDomainStr(item) === cleanDomain);
        if (uIndex === -1) {
          await this.sendReply(chatId, `⚠️ <b>Not Found in Profile ${match.profileName}:</b> Domain <code>${cleanDomain}</code> is not present on <b>Profile ${match.profileName}</b>'s denylist.`);
          return;
        }
        const item = userList[uIndex];
        if (isLocked(item)) {
          await this.sendReply(
            chatId,
            `🔒 <b>Domain Removal Locked:</b>\n\n` +
            `Domain <code>${cleanDomain}</code> in <b>Profile ${match.profileName}</b> is locked because its 24-hour grace period has passed.\n\n` +
            `<b>Added At:</b> ${formatAddedAt(item)}\n` +
            `Locked domains can no longer be unblocked via nDNS Automations.`
          );
          return;
        }
        userList.splice(uIndex, 1);
        await ServerDB.saveBlocklists(blocklists);
        const syncRes = await NextDNSService.syncAllProfiles();
        if (syncRes.success) {
          await this.sendReply(chatId, `🔓 <b>Domain Unblocked & Synced!</b>\n\nDomain <code>${cleanDomain}</code> removed from <b>Profile ${match.profileName}</b> and unblocked on NextDNS immediately.`);
        } else {
          await this.sendReply(chatId, `⚠️ <b>Domain Removed Locally:</b> <code>${cleanDomain}</code> removed from <b>Profile ${match.profileName}</b>, but NextDNS API sync returned a warning.`);
        }
      }
    } else {
      // Default /unblock <domain> (no profile arg): try Shared General first, then fall back to perUser
      const genIndex = (blocklists.general || []).findIndex(item => getDomainStr(item) === cleanDomain);
      if (genIndex !== -1) {
        const item = blocklists.general[genIndex];
        if (isLocked(item)) {
          await this.sendReply(
            chatId,
            `🔒 <b>Domain Removal Locked:</b>\n\n` +
            `Domain <code>${cleanDomain}</code> in <b>Shared General (all profiles)</b> is locked because its 24-hour grace period has passed.\n\n` +
            `<b>Added At:</b> ${formatAddedAt(item)}\n` +
            `Locked domains can no longer be unblocked via nDNS Automations.`
          );
          return;
        }
        blocklists.general.splice(genIndex, 1);
        await ServerDB.saveBlocklists(blocklists);
        const syncRes = await NextDNSService.syncAllProfiles();
        if (syncRes.success) {
          await this.sendReply(chatId, `🔓 <b>Domain Unblocked & Synced!</b>\n\nDomain <code>${cleanDomain}</code> removed from <b>Shared General (all profiles)</b> and unblocked across NextDNS profiles immediately.`);
        } else {
          await this.sendReply(chatId, `⚠️ <b>Domain Removed Locally:</b> <code>${cleanDomain}</code> removed from <b>Shared General (all profiles)</b>, but NextDNS API sync returned a warning.`);
        }
        return;
      }

      // Search perUser
      let foundEntry: { userKey: string; profileName: string; index: number; item: any } | null = null;
      const profiles = await NextDNSService.getDynamicProfiles();

      if (blocklists.perUser) {
        for (const uKey of Object.keys(blocklists.perUser)) {
          const uList = blocklists.perUser[uKey] || [];
          const idx = uList.findIndex(item => getDomainStr(item) === cleanDomain);
          if (idx !== -1) {
            const pMatch = profiles.find(p => getProfileKey(p) === uKey);
            foundEntry = {
              userKey: uKey,
              profileName: pMatch ? pMatch.name : uKey.toUpperCase(),
              index: idx,
              item: uList[idx]
            };
            break;
          }
        }
      }

      if (!foundEntry) {
        await this.sendReply(chatId, `⚠️ <b>Not Found in Denylist:</b> Domain <code>${cleanDomain}</code> is not currently present on any Denylist.`);
        return;
      }

      if (isLocked(foundEntry.item)) {
        await this.sendReply(
          chatId,
          `🔒 <b>Domain Removal Locked:</b>\n\n` +
          `Domain <code>${cleanDomain}</code> in <b>Profile ${foundEntry.profileName}</b> is locked because its 24-hour grace period has passed.\n\n` +
          `<b>Added At:</b> ${formatAddedAt(foundEntry.item)}\n` +
          `Locked domains can no longer be unblocked via nDNS Automations.`
        );
        return;
      }

      blocklists.perUser[foundEntry.userKey].splice(foundEntry.index, 1);
      await ServerDB.saveBlocklists(blocklists);
      const syncRes = await NextDNSService.syncAllProfiles();
      if (syncRes.success) {
        await this.sendReply(chatId, `🔓 <b>Domain Unblocked & Synced!</b>\n\nDomain <code>${cleanDomain}</code> removed from <b>Profile ${foundEntry.profileName}</b> and unblocked on NextDNS immediately.`);
      } else {
        await this.sendReply(chatId, `⚠️ <b>Domain Removed Locally:</b> <code>${cleanDomain}</code> removed from <b>Profile ${foundEntry.profileName}</b>, but NextDNS API sync returned a warning.`);
      }
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
