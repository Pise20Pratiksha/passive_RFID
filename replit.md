# Vehicle RFID Access Control Dashboard

A professional, industrial-style dashboard for monitoring and managing vehicle access at gated entrances via ESP32/ESP8266 RFID gate hardware. Operators can register vehicles, assign RFID cards, watch live entry/exit events, and export access logs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/rfid-dashboard run dev` — run the dashboard frontend (port 24211, proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages (preferred verification method — `pnpm run build` requires workflow-injected `PORT`/`BASE_PATH` env vars and will fail outside a workflow, e.g. for `mockup-sandbox`)
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, WebSocket (`ws`) for live updates at `/api/ws`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec) → React Query hooks + Zod schemas
- Frontend: React + Vite, wouter routing, shadcn/ui, recharts, TanStack Query
- Auth: Replit Auth (OIDC) via `@workspace/replit-auth-web`
- Exports: `exceljs` (Excel), `pdfkit` (PDF), raw CSV — access logs export endpoints
- Build: esbuild (CJS bundle) for the API server

## Where things live

- `lib/api-spec/openapi.yaml` — source-of-truth API contract (health, auth, esp-devices, vehicles, rfid-cards, access-logs, analytics)
- `lib/db/src/schema/` — Drizzle schema: `auth.ts`, `espDevices.ts`, `vehicles.ts`, `rfidCards.ts`, `accessLogs.ts`
- `lib/replit-auth-web/` — shared `useAuth()` hook + auth client helpers, consumed directly by the dashboard frontend
- `artifacts/api-server/src/routes/` — one file per resource; `exports.ts` holds the raw (non-OpenAPI) CSV/Excel/PDF download endpoints
- `artifacts/api-server/src/lib/ws.ts` — WebSocket server + broadcast helper, initialized from `src/index.ts`
- `artifacts/rfid-dashboard/src/pages/` — dashboard, devices, vehicles, rfid-cards, logs, analytics
- `artifacts/rfid-dashboard/src/hooks/use-live-socket.ts` — WebSocket client, auto-reconnect, cache invalidation, unauthorized-access toast

## Architecture decisions

- ESP hardware protocol: devices POST `/api/access-logs` `{cardUid, direction, deviceId}` for gate scan events (server resolves authorization by matching an active `rfid_cards.cardUid`), and POST `/api/esp-devices/{id}/heartbeat` for connection/liveness pings.
- Auth is Replit Auth only — no custom login forms. The frontend gates all routes behind `useAuth()` from `@workspace/replit-auth-web`.
- CSV/Excel/PDF export endpoints are plain Express routes (not in the OpenAPI/Orval contract) since they return files, not JSON; the frontend links to them directly with the current filter querystring.
- Real-time updates flow through a single WebSocket broadcasting resource-change events; the frontend hook invalidates the matching React Query cache keys rather than maintaining parallel local state.

## Product

- ESP32/ESP8266 gate controller management (register, monitor status/heartbeat, edit, delete)
- Vehicle registry with RFID card assignment
- Live entry/exit monitoring with instant unauthorized-access alerts
- Searchable/filterable/sortable access log history with CSV, Excel, and PDF export
- Analytics dashboard: daily traffic trends, vehicle usage leaderboard, summary KPIs

## User preferences

- User wants the full project as a downloadable ZIP in addition to the live app.
- Native mobile app is deferred/out of scope for this session (free tier limits to 1 new artifact) — the React codebase is structured so logic/hooks can be reused in a future Expo app.

## Gotchas

- `pdfkit`'s transitive dependency chain (`fontkit` → `brotli`) needs `@swc/helpers` at runtime if bundled by esbuild; it's externalized in `artifacts/api-server/build.mjs` (along with `fontkit`, `brotli`, `@swc/helpers`) to avoid a `MODULE_NOT_FOUND` crash in production builds.
- Any new lib package that ships React hooks executed directly by an artifact (e.g. `@workspace/replit-auth-web`) must (1) be `composite: true` with a project reference from the consuming artifact's `tsconfig.json`, and (2) be added to that artifact's Vite `optimizeDeps.include` — otherwise dev mode throws "Invalid hook call" from a duplicate React module instance.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
