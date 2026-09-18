# Deploying Mushika's Quest (Netlify or Vercel)

The game is **100% static** — plain HTML/CSS/ES-modules, zero assets, zero build step.
Anything that can serve a folder can host it. Both configs (`netlify.toml`, `vercel.json`)
are already in this folder; you change nothing.

> ⚠️ **Do not double-click `index.html`.** Browsers block ES-module imports over `file://`
> (CORS), so the page looks blank. The game must be served over HTTP(S) — which is exactly
> what Netlify/Vercel do. If you ever need it locally: `npx serve .` or `python3 -m http.server`.

---

## Option A — Netlify (fastest: ~60 seconds)

1. Sign in at <https://app.netlify.com> (free tier is fine).
2. Open <https://app.netlify.com/drop> and **drag this whole folder** (`mushikas-quest/`)
   onto the page. Wait for the upload hash.
3. You get a URL like `https://mushika-quest-xxxx.netlify.app` — open it and play.
4. Rename it: *Site configuration → Change site name* (e.g. `mushikas-quest`).
5. (Optional, for updates) install the CLI once and redeploy from this folder:
   ```bash
   npm i -g netlify-cli
   netlify deploy --prod --dir .
   ```
   Or connect a Git repo: *Add new site → Import an existing project* — build command
   **none**, publish directory **`.`** — every push redeploys.

## Option B — Vercel (~2 minutes)

1. Sign in at <https://vercel.com> (free Hobby tier is fine).
2. From inside this folder:
   ```bash
   npx vercel --prod
   ```
   Answer the prompts: scope = your account, link = new project, framework = **Other**,
   build command = **none** (leave empty), output directory = **`.`** (leave empty).
3. Or import the Git repo at <https://vercel.com/new> with the same three settings
   (framework *Other*, no build command, no output dir). `vercel.json` handles the rest.
4. You get `https://mushikas-quest.vercel.app` — open it and play.

---

## Pre-flight checklist (before you submit the link)

- [ ] Played Day 1 once in **Chrome or Edge** on the deployed URL (not localhost).
- [ ] Opened the same URL on a **phone** (or DevTools device mode): touch stick + 4 buttons
      appear automatically; portrait and landscape both playable.
- [ ] First run shows the **How to Play** modal, then the coach cues
      (walk → jump → swipe → dodge). Dismiss with *Got it*.
- [ ] Pressed **Esc** (pause), **M** (mute), **F1** (debug overlay off by default).
- [ ] Hard-reloaded once (**Ctrl/Cmd-Shift-R**) to prove caching headers behave:
      `index.html` must revalidate, `/js/*` and `/css/*` may come from cache.
- [ ] Console (F12) shows **no errors** during a minute of play.
- [ ] Shared the link in a private/incognito window (proves "anyone can play", no login).

## Post-deploy troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Blank white page | Opened via `file://`, or JS blocked. Serve over HTTP(S); check console for `CORS`/`module` errors. |
| 404 on `/js/main.js` | Wrong publish/output directory. It must be the folder containing `index.html` (Netlify `publish = "."`, Vercel output empty). |
| Old version shows after redeploy | Browser cache on `index.html` shouldn't happen (headers set `no-cache`); hard-reload, or check the deploy actually finished (*Deploys* list = Published). |
| Fonts look different offline | Fonts load from Google Fonts CDN; without internet the game falls back to system serifs — still playable. |
| Touch controls missing on desktop | Correct — they only appear on touch devices / narrow viewports. |

## What the configs already give you

- `index.html` and `/` are never cached → deploys go live instantly.
- `/js/*`, `/css/*` cache for 24 h → fast repeat visits.
- Security headers on everything: `X-Content-Type-Options: nosniff`, sane `Referrer-Policy`.
- Clean URLs on Vercel (`/index` → `/`), silent GitHub checks.

That's it — one folder, one drag, one public URL. Good luck with the judges. 🐭🪔
