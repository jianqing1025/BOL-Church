<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1WnXsfMvYLCYpYAMC-l_xulLx3KeKpBdC

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## Cloudflare Pages Deployment

| Field | Value |
|---|---|
| Cloudflare account | **Jianqing1025@gmail.com** (`be3d95c2f0211bfc68b26e41ef1a3366`) |
| Pages project | `garyhub` |
| Production URLs | https://garyhub.pages.dev<br>https://hub.4022.us<br>https://hub.garylab.cc |
| Production branch | `master` |
| Preview branch | `preview` |

### Commands

```bash
npm run deploy        # → preview environment (testing)
npm run deploy:prod   # → production
```

Each command runs `vite build` then `wrangler pages deploy dist --project-name garyhub --branch <branch>`.

### How auth works (no account switching needed)

- The Cloudflare account ID is cached in `node_modules/.cache/wrangler/wrangler-account.json`
- The `CLOUDFLARE_API_TOKEN` for that account is read from `.env.local`
- So `npm run deploy` / `npm run deploy:prod` just works — no `wrangler login`, no account switch.

### Environment variables on Cloudflare Pages

Both **Production** and **Preview** environments have these secrets configured (managed via Cloudflare dashboard):

- `LOGIN_PASS`
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID`
- `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_PUBLIC_URL`

Changing any env var requires a new deployment for the change to apply to the live URL.
