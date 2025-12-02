# Personal Accountant - AI-Powered Finance Tracker

A production-ready, self-hosted personal accountant chatbot with natural language interface, double-entry ledger, and offline-first PWA support.

## Features

- 🤖 **AI-Powered**: Uses OpenRouter (Claude 3.5 Sonnet) for natural language understanding
- 📊 **Double-Entry Ledger**: Proper accounting with permanent transaction history
- 💰 **Real-time Snapshots**: Net worth, YTD income/expenses, tax estimates
- 📱 **PWA**: Installs on iPhone/Android home screen, works offline
- 🔒 **Encrypted**: End-to-end encryption with WebCrypto + Fernet
- 📈 **Charts**: Monthly income/expense visualization
- 🔄 **Sync**: Background sync when back online

## Production Deployment (cpa.eanhd.com)

### 1. Cloudflare DNS Setup

In Cloudflare, add an A record:
- **Type**: A
- **Name**: cpa
- **Content**: Your server's public IP (or Tailscale IP if internal only)
- **Proxy status**: DNS only (gray cloud) - Caddy handles SSL

### 2. Deploy on Server

```bash
# SSH to your server
ssh eanhd@code-e

# Clone the repo
git clone https://github.com/EanHD/cpa.git
cd cpa

# Configure environment
cp .env.example .env

# Generate Fernet key and add to .env
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Edit .env with your OpenRouter API key and the generated Fernet key
nano .env

# Deploy
docker compose up --build -d
```

### 3. Firewall

Ensure ports 80 and 443 are open on your server.

### 4. Access

- **Public**: https://cpa.eanhd.com
- **Tailscale**: https://code-e:443 (or http://code-e:3000 for direct frontend)

## Quick Start (Local Development)

### 1. Clone and Configure

```bash
cd my-accountant
cp .env.example .env
```

Edit `.env` with your OpenRouter API key:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
FERNET_KEY=your-generated-fernet-key
```

Generate a Fernet key:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### 2. Deploy with Docker

```bash
docker compose up --build -d
```

That's it! The app is now running at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000

### 3. Add to iPhone Home Screen

1. Open Safari on your iPhone
2. Navigate to `http://your-server-ip:3000`
3. Tap the Share button (square with arrow)
4. Scroll down and tap **"Add to Home Screen"**
5. Name it "Accountant" and tap **Add**

The app will now launch in standalone mode with a dark theme!

## Usage Examples

### Add Transactions
- "Paid $127.43 for groceries with Chase debit"
- "Sold 0.32 BTC for $21,400"
- "Received $5000 salary deposit"
- "Bought 10 shares of AAPL at $178.50"
- "Paid rent $2,100 from checking"

### Reports & Analysis
- "Show me my monthly spending"
- "What's my tax liability?"
- "Detect any unusual spending"
- "Export my ledger"

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Dexie.js, Recharts
- **Backend**: FastAPI, LangGraph, SQLite, Fernet encryption
- **AI**: OpenRouter (Claude 3.5 Sonnet, Claude 3 Opus, Grok Beta fallback)
- **Deployment**: Docker, docker-compose

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/chat` | POST | Send message to AI |
| `/state/{thread_id}` | GET | Get current state |
| `/transactions/{thread_id}` | GET | List transactions |
| `/export/{thread_id}` | GET | Export CSV |
| `/sync` | POST | Sync offline data |
| `/monthly-data/{thread_id}` | GET | Monthly chart data |

## Project Structure

```
my-accountant/
├── app/                  # Next.js 15 frontend
│   ├── page.tsx
│   ├── layout.tsx
│   └── globals.css
├── components/           # React components
│   ├── Chat.tsx
│   ├── ChatMessage.tsx
│   ├── SnapshotDisplay.tsx
│   └── MonthlyChart.tsx
├── lib/                  # Utilities
│   ├── db.ts            # Dexie.js IndexedDB
│   ├── api.ts           # API client
│   └── utils.ts
├── agent/               # LangGraph agent
│   ├── graph.py
│   ├── tools.py
│   └── state.py
├── backend/
│   └── main.py          # FastAPI server
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── data/                # SQLite files (gitignored)
├── Dockerfile.frontend
├── Dockerfile.backend
├── docker-compose.yml
└── .env.example
```

## Development

### Run Locally

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
npm install
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | Your OpenRouter API key |
| `FERNET_KEY` | Encryption key for server-side data |
| `DATABASE_PATH` | SQLite database path |
| `CHECKPOINT_PATH` | LangGraph checkpointer path |

## License

MIT
