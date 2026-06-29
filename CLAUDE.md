# CLAUDE.md — Vesta Folio Studio Site

You are the engineering collaborator for **Vesta Folio**, a luxury real estate
media studio. This document is your operating context. Read it fully before
writing code.

---

## Project vision

Vesta Folio is a property film and photography studio based in Los Angeles,
offering three services: HDR architectural photography, cinematic property
tours, and editorial AI staging. The website is the studio's primary sales
channel — it must feel editorial, restrained, and unambiguously luxury.

**The cardinal principle:** the work is the brand. Every design and engineering
decision must answer the question, "does this serve the photography, or does
it compete with it?" If it competes, it's wrong.

---

## Current status

**v0 + v1 chunks 1-9 shipped** at vestafolioco.com.

**Chunk 9 additions (latest):**
- Roles: `super_admin` role added to users table. `vestafolioco@gmail.com` is
  the sole super_admin. Team link in nav visible only to super_admin.
- Team management page (`/admin/team`): super_admin-only. Add/remove admin
  accounts. Invite sends a password-set email via Resend.
- Clients page (`/admin/clients`): list all portal clients with search,
  project access detail modal, and per-project access revoke.
- Project status tracker: client projects have a status field
  (Booked → Filming → Editing → Delivered → Archived) with a step tracker
  sidebar on the edit page. Badge propagates to projects list and dashboard.
- Audit trail: `last_edited_by` / `last_edited_at` on both `inquiries` and
  `client_projects`. Displayed as "Last edited by [name] on [date]".
- Video links: YouTube/Reels/TikTok video IDs stored in
  `client_project_videos` table. Admin sidebar manages them. Portal shows
  YouTube embeds, Reels as links, TikTok as ID reference.
- Video file uploads: MP4/MOV/WebM files upload via multipart FormData to
  the `IMAGES` R2 bucket at `client-projects/[slug]/videos/[filename]`.
  Stored as `video_files` JSON on `client_projects` row.
- Client portal downloads: "Download images" zips WebP gallery from IMAGES
  bucket. "Download video" shows direct R2 links per video file — no Worker
  proxying, no memory ceiling.
- Originals tab removed: client project edit page now has two tabs only
  (Details | Images). Images tab includes a video files section below gallery.
- Public site footer: "Client portal" and "Studio access" links added inside
  the Contact column.
- Email: `info@vestafolioco.com` Cloudflare Email Routing → Gmail. Gmail SMTP
  alias configured so replies send from `info@vestafolioco.com`.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Hosting (public site) | Cloudflare Pages | Free, edge-deployed, auto-deploy on push |
| Frontend | Plain HTML, CSS, JS (no framework) | No build step, GitHub web UI editable |
| Styling | Custom CSS with design tokens | Total control, zero dependency creep |
| Fonts | Google Fonts CDN (Cormorant Garamond, Inter, Cinzel) | Easy v0 shipping |
| Data (portfolio) | `data/projects.json` in repo | Source of truth, no DB for public site |
| Images (portfolio) | `images/projects/[slug]/*.webp` in repo | Free, exported at spec dimensions |
| Images (client) | R2 `vestafolioco-images` via `images.vestafolioco.com` | Scalable, not in repo |
| Video files (client) | R2 `vestafolioco-images` at `client-projects/[slug]/videos/` | Same bucket, public URL, direct download |
| Hero video | `videos/hero.mp4` direct-served | Hero is budgeted |
| API | Cloudflare Workers (`vestafolioco-api`) | Edge, free tier |
| Worker deploy | Workers Builds, auto-deploys from `/workers` on push | No CLI needed |
| Database | Cloudflare D1 (`vestafolioco-db`) | SQLite-based, free tier |
| Email | Resend (transactional) | Free tier |
| Email forwarding | Cloudflare Email Routing (`info@vestafolioco.com` → Gmail) | Catches all inbound |
| Bot protection | Cloudflare Turnstile | Free, invisible CAPTCHA |
| Auth | From scratch: bcryptjs + crypto.getRandomValues + D1 sessions | 3 roles, <20 accounts |
| Analytics | Cloudflare Web Analytics (auto-injected) | Privacy-friendly, no cookie banner |
| Domain | Cloudflare Registrar | At-cost |
| HTTPS | Always Use HTTPS + Automatic HTTPS Rewrites | Enforced edge-side |

**Operating cost target: <= $10/month total.** Currently $0 — everything on free tiers.

---

## Brand kit

### Color palette (Forest Heritage)

```css
:root {
  --color-forest:    #1F2E2A;
  --color-cream:     #F2EDE3;
  --color-gold:      #A8884E;
  --color-sage:      #4A5C57;
}
```

**Usage discipline (enforce this):**
- 60% Cream — dominant content surface
- 30% Forest — anchors and dark sections only
- 8% Gold — accents only, never large fills
- 2% Sage — body text, captions, microcopy

**Never** use pure black, pure white, or neutral grays.

**Error states:** Gold left-border pattern (never red).
**Success states:** Sage left-border pattern (never green).

### Typography

```css
--font-display:  'Cormorant Garamond', 'Cardo', Georgia, serif;
--font-sans:     'Inter', system-ui, sans-serif;
--font-wordmark: 'Cinzel', 'Trajan Pro', Georgia, serif;
```

**Two weights only per font: 400 regular and 500 medium.** Never 600/700/900.

**Micro-labels:** Inter, weight 500, ALL CAPS, letter-spacing 0.20em, 11-12px.
**Headings:** Cormorant Garamond, weight 400, sentence case. Never Title Case.

### Voice

- Restrained, confident, editorial. Short sentences.
- **Forbidden words:** passionate, stunning, world-class, premier, luxury,
  elevated, bespoke, curated, signature, elite, prestige, exclusive
- Sentence case in display headings
- Micro-labels ALL CAPS with letter-spacing — those are the only caps

### No personal names

Founder's name appears nowhere — not in code, copy, alt text, placeholders,
comments, or email signatures.

---

## Animation policy

**No scroll reveal. No section fade-in. No stagger animations.**

Allowed motion only:
- Hover state transitions on links and cards (<=200ms)
- 600ms `transform: scale(1.03)` on project card image hover
- Modal open/close (300ms ease)
- Mobile menu open/close (300ms ease)
- Hero video autoplay/loop (browser-handled)

---

## File structure (shipped)

```
/
|- CLAUDE.md
|- SPEC.md
|- README.md
|
|- public/                        <- Cloudflare Pages root
|   |- index.html                 <- single-page public site
|   |- _redirects                 <- /admin/projects/* -> /admin/project.html
|   |- brand/
|   |   |- vesta-folio-horizontal.svg
|   |   |- favicon.ico
|   |   |- og-image.jpg
|   |- css/
|   |   |- tokens.css             <- SOURCE OF TRUTH for all design values
|   |   |- base.css
|   |   |- site.css
|   |- js/
|   |   |- site.js
|   |- data/
|   |   |- projects.json          <- portfolio source of truth (2 live projects)
|   |- videos/
|   |   |- hero.mp4
|   |- images/
|   |   |- studio/studiopic.jpg
|   |   |- projects/
|   |       |- crescenta-valley-spanish/
|   |       |- los-angeles-sunshine/
|   |- admin/
|   |   |- index.html             <- dashboard
|   |   |- admin.css              <- shared admin styles
|   |   |- admin.js               <- legacy, not referenced by new pages
|   |   |- dashboard.css          <- stat cards, panels, badges
|   |   |- project-chunk9.css     <- NEW: cp9-layout, status steps, video items
|   |   |- login.html / login.css / login.js
|   |   |- account.html / account.js
|   |   |- forgot-password.html / forgot-password.js
|   |   |- reset-password.html / reset-password.js
|   |   |- projects.html / projects.js
|   |   |- project.html / project.js / project.css
|   |   |- client-project.html / client-project.js
|   |   |- leads.html / leads.js / leads.css
|   |   |- team.html / team.js    <- NEW: super_admin only
|   |   |- clients.html / clients.js  <- NEW: all portal clients
|   |   |- login.css
|   |- portal/
|       |- index.html
|       |- project.html           <- gallery + Download images + Download video
|       |- login.html
|       |- accept-invite.html
|       |- account.html
|       |- forgot-password.html
|       |- reset-password.html
|       |- portal.css
|
|- workers/
    |- package.json
    |- wrangler.jsonc
    |- src/
        |- index.js               <- ~2760 lines, all API endpoints
```

---

## Engineering conventions

### General
- **No CLI required.** All changes via GitHub web UI + Cloudflare dashboard.
- **Vanilla JS only.** No React, no Vue, no bundlers, no preprocessors.
- **Mobile-first.** 390px first, scaled up via `min-width` media queries.
- **ES modules served directly.** `<script type="module">`.

### CSS

- All values from `tokens.css` custom properties.
- **CRITICAL: Verify a CSS variable exists in `tokens.css` before using it.**
  Undefined variables silently invalidate the entire property declaration.
  On iOS Safari this causes dramatic visual regressions.
- Verified token names: `--color-{forest,cream,gold,sage,bg-light,bg-dark,accent,text-body,text-light}`,
  `--font-{display,sans,wordmark}`, `--font-weight-{regular,medium}`,
  `--text-{display-xl,display-lg,display-md,body-lg,body-md,body-sm,micro,micro-lg,wordmark}`,
  `--tracking-{micro,wide,display,normal}`, `--leading-{tight,snug,body,micro}`,
  `--space-{1,2,3,4,5,6,8,10,12,16,20,24}` (no 7, 9, 11, etc.),
  `--max-width-{content,prose,narrow}`, `--gutter-{mobile,desktop}`,
  `--nav-height`, `--border-{gold,gold-dim,radius}`,
  `--transition-{hover,reveal}`, `--z-{base,content,nav,modal,overlay}`.
- BEM-ish naming: `.section`, `.section__header`, `.section--dark`.
- Admin pages use `admin__` prefix: `admin__nav`, `admin__btn-primary`,
  `admin__input`, `admin__field`, `admin__loading`, `admin__error`,
  `admin__success`. Always use `hidden` attribute for show/hide, not
  `style="display:none"`.

### JS

- ES modules. `fetch` for all network calls.
- **Zero third-party JS on public marketing site** except Cloudflare Turnstile.
- **Auth-gated page pattern:** show loading div while `fetch('/api/auth/me')`
  runs; on 200 reveal UI; on 401 redirect to login.
- **`/api/auth/me` returns `{ user: { id, email, role, name } }`.** Role and
  id are nested under `user`. Always read `body.user.role`, never `body.role`.
- **No `onload` handlers controlling image visibility.** Use z-index layering.

### CRITICAL: JS files must be pure ASCII

**Unicode characters in JS files get corrupted during GitHub web UI upload.**
UTF-8 multibyte sequences (em dash `--`, box-drawing, ellipsis, braille)
get reinterpreted as Windows-1252 and re-encoded, producing garbage that
causes `SyntaxError: Unexpected token` in the browser.

**Rule:** Before delivering any JS file, strip all non-ASCII characters:
- `--` (em dash) -> `-`
- `...` (ellipsis) -> `...`
- `->` (arrow) -> `->`
- All box-drawing chars -> `-`

HTML files tolerate non-ASCII (GitHub web UI handles them fine).
Always verify JS with: `python3 -c "c=open('f.js').read(); print([x for x in c if ord(x)>127])"`

### CRITICAL: Never nest `<form>` elements

HTML5 parsers silently discard inner `<form>` tags. The inputs stay in the DOM
but `getElementById` returns null and submit handlers never attach.

`client-project.html` has three sibling forms (never nested):
- `<form id="project-form">` — Details metadata
- `<form id="invite-form">` — Client access invite
- `<form id="video-add-form">` — Video link add

### CRITICAL: Always build on the previous output file

Never re-copy from the live source zip when iterating on a file across build
cycles. Fixes applied to one output are silently dropped if you start again
from the original. The `esc()` helper was lost twice by re-copying from source.

### Image rendering (load-bearing pattern)
- **Never `opacity: 0` + `onload` -> `opacity: 1`.** Doesn't fire on cache hits.
- **Correct pattern:** render `<img>` tag directly, styled fallback `<div>`
  behind it via z-index.

### Email HTML pattern
- Table-based layouts with inline styles only. No `<style>` blocks.
- Web-safe font fallback chains. No CSS variables.
- Cream background (Forest triggers Gmail dark-mode inversion).
- HTML-escape all user input via `esc()` helper.
- Plain-text fallback alongside HTML.

### Worker / Cloudflare conventions
- `wrangler.jsonc` is source of truth for non-secret Worker config.
- **Never add Text vars in the Worker dashboard** — wiped on next deploy.
- **Secrets** live only in the dashboard. Current secrets:
  - `RESEND_API_KEY`
  - `TURNSTILE_SECRET_KEY`
  - `GITHUB_TOKEN` (fine-grained PAT, `caseyv22/vestafolioco`, contents read+write)
- D1 schema migrations: run ONE STATEMENT AT A TIME in dashboard SQL Console.
  Multi-statement blocks display but only execute the last statement.
- Debug via Workers Observability logs + browser DevTools Network tab.

### Auth conventions
- Three roles: `admin`, `client`, `super_admin`.
- `vestafolioco@gmail.com` is the sole `super_admin`. Cannot be deleted or
  demoted. Name stored as "Admin".
- Session cookie: `vf_session`, HttpOnly, Secure, SameSite=Lax, 30-day.
- Password hashing: bcryptjs at cost factor 12.
- Anti-timing on failed logins. Anti-enumeration on forgot-password.
- Password change revokes other sessions. Reset revokes all sessions.
- `requireAdmin` allows both `admin` and `super_admin`.
- `requireSuperAdmin` allows only `super_admin`.
- Login redirect: `admin` and `super_admin` -> `/admin`, `client` -> `/portal`.

### Video file conventions
- Client project video files upload via multipart FormData (not base64 JSON).
- Stored in `IMAGES` R2 bucket at `client-projects/[slug]/videos/[filename]`.
- URLs are direct public R2 links via `images.vestafolioco.com`.
- Portal "Download video" = direct `<a href download>` links, no Worker proxy.
- Worker memory limit is 128MB. Never stream large files through the Worker.
- Video URLs stored as JSON array in `client_projects.video_files` column.

---

## Working principles

### 1. Debug from data, not theory
DevTools Network panel, Worker Observability logs, and served file contents
tell the truth. Don't change code based on a guess.

Past examples:
- `ReferenceError: esc is not defined` — function used in added code but not
  defined in the file. Always scan for undefined references after adding code.
- `meData.role` returning undefined — `/api/auth/me` returns `{ user: {...} }`,
  role is nested. Always read `body.user.role`.
- D1 multi-statement blocks — console shows all statements but only runs the
  last. Run migrations one statement at a time.

### 2. If a feature causes repeated UX bugs, kill it
The scroll reveal animation caused three rounds of bugs. Removing it improved
the UX more than any fix would have.

### 3. One feature at a time
Don't write v2 code while v1 is unshipped.

### 4. Confirm understanding before writing code
Restate requirements first. Realigning in one sentence beats reworking fifty lines.

### 5. Push back when the founder is wrong
If a request contradicts CLAUDE.md or weakens the architecture, say so.

### 6. Source-of-truth conventions
- Public site code -> GitHub `main` -> Cloudflare Pages auto-deploys
- Worker code -> GitHub `main` (`/workers`) -> Workers Builds auto-deploys
- Worker non-secret config -> `wrangler.jsonc`
- Worker secrets -> Cloudflare dashboard only
- D1 schema -> paste-and-execute SQL in dashboard Console (one at a time)
- Portfolio data -> `public/data/projects.json`
- Design tokens -> `public/css/tokens.css`

### 7. Read the actual file, not your memory of it
Several wasted cycles came from assuming file contents. Read every file you
reference before writing code that touches it.

### 8. Delivery format
- **Existing-file edits -> zip** preserving folder structure from repo root.
- **SQL migrations -> inline in the response**, one statement per Execute call.
- **Be terse in chat, exhaustive in artifacts.**

### 9. QA before delivery
Run these checks on every JS file delivered:
- ASCII safety: `python3 -c "c=open('f.js').read(); print([x for x in c if ord(x)>127])"`
- Syntax: `node --check f.js`
- DOM ID cross-reference: every `getElementById('x')` must have `id="x"` in the HTML
- No nested forms
- Auth shape: reads `body.user.role` not `body.role`
- Undefined function scan: every function called must be defined in scope

---

## What NOT to do

- **No frameworks** on public site (no React, Vue, Svelte).
- **No design embellishment** (no drop shadows, gradients, glassmorphism, parallax).
- **No scroll reveal, fade-ins, or stagger animations.**
- **No marketing-speak** in copy. See forbidden words above.
- **No bulleted feature lists** in public copy. Editorial prose only.
- **No red error states.** Gold-border pattern instead.
- **No green success states.** Sage-border pattern instead.
- **No off-palette colors.**
- **No personal founder names** anywhere.
- **No Text vars in the Worker dashboard.** Always declare in `wrangler.jsonc`.
- **No third-party identity providers.** Auth is built from scratch.
- **No undefined CSS variables.** Always verify against `tokens.css`.
- **No non-ASCII characters in JS files.** GitHub web UI upload corrupts them.
- **No nested `<form>` elements.** Browser silently discards the inner form.
- **No `onload` handlers controlling image visibility.**
- **No stock photography.**
- **No CSS-typeset wordmark.** The logo is SVG.
- **No large files through the Worker.** 128MB memory limit. Use direct R2
  URLs for video downloads.
- **No re-copying from live source when iterating.** Always build on the
  previously delivered output file.

---

## Working with the founder

The founder has no local dev environment. All changes go through GitHub web UI.
Pages and Workers Builds auto-deploy on push to `main`.

**Match the discipline exactly.** Forest Heritage palette, two font weights,
sentence-case headings, ALL CAPS only in micro-labels, no frameworks,
no preprocessors, no personal names, no undefined CSS tokens,
no non-ASCII in JS, no nested forms.
