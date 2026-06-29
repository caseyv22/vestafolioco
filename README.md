# Vesta Folio

Estate film and photography. Los Angeles.

**Live site:** [vestafolioco.com](https://vestafolioco.com)

---

## What this is

A full-stack studio site for Vesta Folio, hosted on Cloudflare Pages + Workers. No build step. No framework. The public site, admin dashboard, client portal, and API are all plain HTML/CSS/JS backed by Cloudflare D1 and R2.

**Status:** v0 + v1 (chunks 1–9) fully shipped.

---

## Site map

| URL | Description |
|---|---|
| `/` | Public single-page site |
| `/admin/login` | Admin sign-in |
| `/admin` | Dashboard (stat cards, recent leads, active projects) |
| `/admin/projects` | Portfolio + client project list (two tabs) |
| `/admin/project?slug=...` | Portfolio project edit (Details \| Images) |
| `/admin/client-project?id=N` | Client project edit (Details \| Images + status sidebar) |
| `/admin/leads` | Leads list + detail |
| `/admin/team` | Team management (super_admin only) |
| `/admin/clients` | All portal clients |
| `/admin/account` | Change password |
| `/portal/login` | Client portal login |
| `/portal` | Client project list |
| `/portal/project?slug=...` | Client gallery + downloads |
| `/portal/accept-invite` | Set password from invite link |
| `/portal/account` | Client change password |

---

## File structure

```
/
├── CLAUDE.md                     ← engineering operating context
├── SPEC.md                       ← full product spec
│
├── public/                       ← Cloudflare Pages root
│   ├── index.html                ← single-page public site
│   ├── _redirects                ← /admin/projects/* -> /admin/project.html
│   ├── css/
│   │   ├── tokens.css            ← SOURCE OF TRUTH for all design values
│   │   ├── base.css
│   │   └── site.css
│   ├── js/
│   │   └── site.js
│   ├── data/
│   │   └── projects.json         ← public portfolio content
│   ├── brand/
│   │   ├── vesta-folio-horizontal.svg
│   │   ├── favicon.ico
│   │   └── og-image.jpg
│   ├── images/
│   │   ├── studio/studiopic.jpg
│   │   └── projects/[slug]/      ← WebP images per portfolio project
│   ├── videos/
│   │   └── hero.mp4
│   ├── admin/                    ← admin dashboard (auth-gated)
│   │   ├── index.html            ← dashboard
│   │   ├── projects.html / projects.js
│   │   ├── project.html / project.js / project.css
│   │   ├── client-project.html / client-project.js
│   │   ├── leads.html / leads.js / leads.css
│   │   ├── team.html / team.js   ← super_admin only
│   │   ├── clients.html / clients.js
│   │   ├── login.html / login.css / login.js
│   │   ├── account.html / account.js
│   │   ├── forgot-password.html / forgot-password.js
│   │   ├── reset-password.html / reset-password.js
│   │   ├── admin.css             ← shared admin styles
│   │   ├── dashboard.css
│   │   └── project-chunk9.css
│   └── portal/                   ← client portal (invite-only)
│       ├── index.html
│       ├── project.html          ← gallery + image/video downloads
│       ├── login.html
│       ├── accept-invite.html
│       ├── account.html
│       ├── forgot-password.html
│       ├── reset-password.html
│       └── portal.css
│
└── workers/                      ← Cloudflare Worker (API)
    ├── wrangler.jsonc
    ├── package.json
    └── src/
        └── index.js              ← all API endpoints (~2760 lines)
```

---

## Tech stack

| Layer | Choice |
|---|---|
| Hosting | Cloudflare Pages (static, auto-deploy on push) |
| Frontend | Plain HTML + CSS + JS (no framework, no build step) |
| Styling | Custom CSS with design tokens in `tokens.css` |
| API | Cloudflare Workers (`vestafolioco-api`, auto-deploy from `/workers`) |
| Database | Cloudflare D1 (`vestafolioco-db`) |
| File storage | Cloudflare R2 (`vestafolioco-images`, public via `images.vestafolioco.com`) |
| Auth | From scratch: bcryptjs + D1 sessions, three roles |
| Email | Resend (transactional) + Cloudflare Email Routing |
| Bot protection | Cloudflare Turnstile |
| Analytics | Cloudflare Web Analytics |
| Domain | Cloudflare Registrar |

**Operating cost: $0** — everything on free tiers.

---

## Adding a portfolio project

1. Upload images to `public/images/projects/[slug]/` via GitHub web UI (hero.webp + 01.webp, 02.webp, etc.)
2. Edit `public/data/projects.json` — add an entry following the existing schema
3. Push to `main` — Cloudflare Pages auto-deploys in ~60 seconds

Or use the admin dashboard at `/admin/projects` to manage projects through the UI.

---

## Deployment

All deploys are automatic on push to `main`:

- **Public site + admin + portal** — Cloudflare Pages builds from `public/`
- **Worker API** — Workers Builds deploys from `workers/`

No CLI required. No local dev environment needed.

---

## Phases

- **v0** (shipped): Public site — six sections, hero video, portfolio grid, inquiry form
- **v1** (shipped, chunks 1–9): Admin dashboard, leads management, portfolio CRUD, client portal, invite flow, image/video upload, roles, team management, status tracker, audit trail
- **v2** (next): Per-project detail pages, All Work page, SEO/OG meta, presigned R2 video upload, portal cleanup

See `SPEC.md` for the full product spec and `CLAUDE.md` for engineering conventions.
