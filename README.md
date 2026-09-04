# 🛡️ nDNS Automations — NextDNS Multi-Profile Automation & Security Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19.0-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Express](https://img.shields.io/badge/Express-4.21-000000.svg?logo=express&logoColor=white)](https://expressjs.com/)
[![Cloudflare Turnstile](https://img.shields.io/badge/Protected_by-Cloudflare_Turnstile-f38020.svg?logo=cloudflare&logoColor=white)](https://www.cloudflare.com/products/turnstile/)
[![Telegram Bot](https://img.shields.io/badge/Alerts-Telegram_Bot-26A5E4.svg?logo=telegram&logoColor=white)](https://core.telegram.org/bots)

> **nDNS Automations** is an enterprise-grade, full-stack DNS security management suite engineered to orchestrate, synchronize, and monitor multiple **NextDNS** profiles. It features automated threat-feed ingestion, cross-profile blocklist synchronization, device-level query telemetry, instant Telegram incident alerting, and Cloudflare Turnstile bot protection.

---

## 🌟 Key Highlights & Capabilities

- **🔄 Multi-Profile Synchronization:** Seamlessly manage and broadcast blocklists, allowlists, and security policies across individual, family, or enterprise NextDNS profiles from a single unified pane.
- **⚡ Automated Threat Intelligence (TI):** Continuously ingests OSINT threat feeds, phishing feeds, and malware domain lists, automatically converting IOCs (Indicators of Compromise) into actionable NextDNS block rules.
- **📊 Real-Time Device Telemetry & Analytics:** Granular device-by-device metrics displaying total queries, blocked percentage, top queried domains, and malware/tracker block breakdowns with low-overhead caching.
- **🚨 Telegram Instant Incident Response:** Two-way Telegram bot integration that broadcasts real-time security alerts (malware blocks, watchlist hits, domain alerts) and allows on-the-fly interactive domain blocking directly from chat.
- **🛡️ Cloudflare Turnstile Bot Defense:** Built-in client and server-side verification using Cloudflare Turnstile (`challenges.cloudflare.com/turnstile/v0/siteverify`), protecting the dashboard from unauthorized automated abuse without annoying CAPTCHAs.
- **📈 Live Security Stream (SSE):** Server-Sent Events stream live DNS resolution logs, query metrics, and threat feed update events directly to the frontend with zero polling strain.

---

## 🏗️ System Architecture

```
                                +---------------------------+
                                |    Threat Intel Feeds     |
                                | (URLHaus, PhishTank, etc) |
                                +-------------+-------------+
                                              |
                                              v
+------------------+          +-------------------------------+          +--------------------+
|  Telegram Client | <======> |     nDNS Automation Server    | <======> | NextDNS REST & SSE |
| (Bot / Webhooks) |          | (Node.js + Express + Caching) |          | (Profiles / Logs)  |
+------------------+          +---------------+---------------+          +--------------------+
                                              |
                                              v
                              +-------------------------------+
                              |    React 19 + Tailwind v4     |
                              |   Unified Operator Console    |
                              |  (Cloudflare Turnstile Guard) |
                              +-------------------------------+
```

---

## 🚀 Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide Icons, Motion |
| **Backend / API** | Node.js (v20+), Express.js, TypeScript (`tsx`), Server-Sent Events (SSE) |
| **Integrations** | NextDNS REST API, NextDNS Streaming API, Telegram Bot API, Cloudflare Turnstile API |
| **Data & Cache** | In-memory adaptive cache with request deduplication, JSON-based persistent state store |
| **Security** | Cloudflare Turnstile (Siteverify API), Sanitized Proxies, Environment Secret Encapsulation |

---

## 📦 Getting Started

### Prerequisites

- **Node.js**: `v20.x` or higher
- **npm** or **bun**
- A valid **NextDNS Account** and API key ([nextdns.io/account](https://my.nextdns.io/account))
- *(Optional)* **Telegram Bot Token & Chat ID** ([BotFather](https://t.me/botfather))
- *(Optional)* **Cloudflare Turnstile Site Key & Secret Key** ([Cloudflare Dashboard](https://dash.cloudflare.com/))

---

### Installation

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/your-username/ndns-automations.git
   cd ndns-automations
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Configure the required variables:
   ```env
   # Application Host URL (Optional for local development)
   APP_URL="http://localhost:3000"

   # Telegram Bot Integration (Optional)
   TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
   TELEGRAM_CHAT_ID="987654321"

   # Cloudflare Turnstile Bot Defense (Optional - Uses official test keys by default)
   VITE_CLOUDFLARE_TURNSTILE_SITE_KEY=""
   CLOUDFLARE_TURNSTILE_SECRET_KEY=""
   ```

4. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build for Production:**
   ```bash
   npm run build
   npm start
   ```

---

## ⚙️ Core Configuration & Modules

### 1. NextDNS Profile Sync
- Connect via your NextDNS API Key in **Settings**.
- Manage master blocklists and distribute rules across multiple user/device profiles automatically.

### 2. Threat Feed Automation
- Add upstream blocklists or IOC feeds in plain text / raw format.
- Set automated synchronization intervals to pull malicious domains and push them to active NextDNS profiles.

### 3. Telegram Security Bot
- Instant notifications when a watched domain or high-risk category is blocked.
- Interactive alerts with inline action buttons to unblock or investigate queries.

### 4. Cloudflare Turnstile Protection
- Protects administrative dashboards and sensitive state changes from automated scraping or credential-stuffing bots.
- Test mode is supported out of the box with Cloudflare's dummy test keys (`1x00000000000000000000AA`).

---

## 🛡️ Security & Privacy Best Practices

- **Zero Client Exposure of Secrets:** NextDNS API keys, Telegram tokens, and Cloudflare secret keys never leave the server environment.
- **Privacy-Preserving Bot Challenge:** Cloudflare Turnstile respects visitor privacy and does not track users or set persistent tracking cookies.
- **Rate-Limiting & Concurrency Throttling:** Background jobs utilize request deduplication and sliding-window caching to prevent NextDNS API rate-limiting (`429 Too Many Requests`).

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!
Feel free to check the [issues page](https://github.com/your-username/ndns-automations/issues).

---

*Engineered with precision for modern network privacy and proactive DNS security.*
