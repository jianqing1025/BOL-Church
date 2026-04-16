## Run Locally

Prerequisites: Node.js

1. Install dependencies: `npm install`
2. Start the Worker API in one terminal: `npm run api:dev`
3. Start the Vite app in another terminal: `npm run dev`

Notes:

- Vite now proxies `/api/*` requests to `http://127.0.0.1:8787` by default.
- If your Worker runs on a different port, set `VITE_API_PROXY_TARGET` before `npm run dev`.

## Cloudflare Setup

This project now uses:

- D1 database `bol-church`
- R2 bucket binding `MEDIA_BUCKET`
- Worker entry [server.ts](/e:/Repo/bolccop/Church/server.ts)

Key files:

- [wrangler.example.toml](/e:/Repo/bolccop/Church/wrangler.example.toml)
- [migrations/0001_init.sql](/e:/Repo/bolccop/Church/migrations/0001_init.sql)
- [api.ts](/e:/Repo/bolccop/Church/api.ts)
- [context/AdminContext.tsx](/e:/Repo/bolccop/Church/context/AdminContext.tsx)

Before deploying on a new Cloudflare account:

1. Copy `.env.example` to `.env`
2. Optional but recommended: set `VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN` to your Cloudflare Web Analytics beacon token
3. Copy `wrangler.example.toml` to `wrangler.toml`
4. Fill in your own Worker name, D1 database name/id, and R2 bucket name
5. Set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_NAME` for the first Owner account
6. Set the first Owner password as a Worker secret: `npx wrangler secret put ADMIN_BOOTSTRAP_PASSWORD`
7. If you want dashboard traffic stats, also set `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_ANALYTICS_API_TOKEN`

Admin notes:

- The first active Owner is created automatically after migrations if the `users` table is empty.
- The first Owner is created when the deployed Worker first handles `/api/bootstrap`, `/api/auth/me`, or `/api/auth/login`.
- After the first Owner signs in, create named accounts from Admin → Users and change the bootstrap password.
- Admin users can edit normal admin content, sermons, manna, inbox, prayer, giving, and media, but cannot access Homepage or Users.

Cloudflare analytics notes:

- `VITE_CLOUDFLARE_WEB_ANALYTICS_TOKEN` enables the Cloudflare Web Analytics beacon on the frontend.
- `CLOUDFLARE_ZONE_ID` should be the Zone ID for the deployed website.
- `CLOUDFLARE_ANALYTICS_API_TOKEN` should have read access to zone analytics so the Worker can fetch traffic totals and top countries for the admin dashboard.

Useful commands:

- Build frontend: `npm run build`
- Local API only: `npm run api:dev`
- Local D1 migration: `npm run d1:migrate:local`
- Remote D1 migration: `npm run d1:migrate:remote`
- Trigger first Owner creation locally after starting the Worker: `curl http://127.0.0.1:8787/api/auth/me`
- Trigger first Owner creation remotely after deploy: `curl https://new.bolccop.org/api/auth/me`
- Local Worker dev: `npm run cf:dev`
- Deploy Worker + assets: `npm run cf:deploy`

## Firebase Export Helpers

Migration helper scripts:

- Export Firebase data: `npm run firebase:export`
- Convert export JSON into D1 seed SQL: `npm run firebase:sql`

If Firebase rules do not allow the export script, run the export after temporarily granting read access or using an authenticated Firebase session with the same collections.
