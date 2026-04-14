## Run Locally

Prerequisites: Node.js

1. Install dependencies: `npm install`
2. Start the Vite app: `npm run dev`

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
2. Set `VITE_ADMIN_PASSWORD`
3. Copy `wrangler.example.toml` to `wrangler.toml`
4. Fill in your own Worker name, D1 database name/id, and R2 bucket name

Useful commands:

- Build frontend: `npm run build`
- Local D1 migration: `npm run d1:migrate:local`
- Local Worker dev: `npm run cf:dev`
- Deploy Worker + assets: `npm run cf:deploy`

## Firebase Export Helpers

Migration helper scripts:

- Export Firebase data: `npm run firebase:export`
- Convert export JSON into D1 seed SQL: `npm run firebase:sql`

If Firebase rules do not allow the export script, run the export after temporarily granting read access or using an authenticated Firebase session with the same collections.
