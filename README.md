# Vehicle RFID Access Control Dashboard

Industrial-style dashboard for monitoring and managing vehicle access via ESP32/ESP8266 RFID gate hardware.

---

## Local Development (Windows / VSCode)

### Prerequisites

Install these tools before you start:

| Tool | Download | Version |
|------|----------|---------|
| **Node.js** | https://nodejs.org | v20 or v22 LTS |
| **pnpm** | `npm install -g pnpm` | v9+ |
| **PostgreSQL** | https://www.postgresql.org/download/windows/ | v15+ |

### 1 — Set up the database

Open **pgAdmin** (installed with PostgreSQL) or the `psql` shell and create a database:

```sql
CREATE DATABASE rfid_dashboard;
```

### 2 — Configure environment variables

Copy `.env.example` to `.env` in the project root and fill in your database URL:

```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/rfid_dashboard
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
SESSION_SECRET=any-random-string-here
```

> **Note:** `ADMIN_USERNAME` and `ADMIN_PASSWORD` are the credentials you will use to log in to the dashboard. Defaults are `admin` / `admin`.

### 3 — Install dependencies

Open a terminal in the project folder and run:

```bash
pnpm install
```

### 4 — Push the database schema

This creates all the tables in your database:

```bash
pnpm --filter @workspace/db run push
```

### 5 — Run the app

**Option A — run both servers together (recommended):**

```bash
pnpm run dev
```

This starts both the API server (port 8080) and the frontend (port 3000) simultaneously.

**Option B — run them in separate terminals:**

Terminal 1 (API server):
```bash
pnpm --filter @workspace/api-server run dev
```

Terminal 2 (frontend):
```bash
pnpm --filter @workspace/rfid-dashboard run dev
```

### 6 — Open the dashboard

Navigate to **http://localhost:3000** in your browser.

Log in with the credentials you set in `.env` (default: `admin` / `admin`).

---

## Project Structure

```
├── artifacts/
│   ├── api-server/          # Express 5 API + WebSocket server (port 8080)
│   └── rfid-dashboard/      # React + Vite frontend (port 3000)
├── lib/
│   ├── api-spec/            # OpenAPI contract → code-gen source
│   ├── api-client-react/    # Generated React Query hooks + Zod schemas
│   ├── db/                  # Drizzle ORM schema + migrations
│   └── replit-auth-web/     # useAuth() hook
└── .env.example             # Copy to .env for local setup
```

## Useful commands

```bash
# Typecheck everything
pnpm run typecheck

# Push DB schema changes after editing lib/db/src/schema/
pnpm --filter @workspace/db run push

# Regenerate API hooks after editing lib/api-spec/openapi.yaml
pnpm --filter @workspace/api-spec run codegen
```

## ESP32 / ESP8266 Hardware Integration

Configure your device to send HTTP requests to the API server:

- **Gate scan event:** `POST http://YOUR_PC_IP:8080/api/access-logs`
  ```json
  { "cardUid": "AABBCCDD", "direction": "entry", "deviceId": "device-uuid" }
  ```
- **Heartbeat ping:** `POST http://YOUR_PC_IP:8080/api/esp-devices/{id}/heartbeat`

Replace `YOUR_PC_IP` with your local machine's IP address (run `ipconfig` on Windows to find it).

---

## Tech Stack

- **API:** Node.js 20+, Express 5, Drizzle ORM, PostgreSQL
- **Frontend:** React 18, Vite, TanStack Query, shadcn/ui, Tailwind CSS, Recharts
- **Real-time:** WebSocket (`ws`) — auto-reconnecting live updates
- **Exports:** CSV, Excel (exceljs), PDF (pdfkit)
