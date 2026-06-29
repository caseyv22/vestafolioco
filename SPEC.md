# SPEC.md — Vesta Folio Studio Site

Product specification. Companion to CLAUDE.md.

**Status:** v0 + v1 chunks 1-9 shipped to vestafolioco.com.

---

## Product overview

A single-page editorial website for Vesta Folio, a Los Angeles luxury real
estate media studio offering HDR photography, cinematic property tours, and
editorial AI staging.

**Three audiences:**
1. **Real estate agents and brokers** — primary buyers. Land via referral or
   Instagram, evaluate the work in 60 seconds, inquire if it matches their listing.
2. **High-net-worth homeowners** — secondary buyers, referred by their agent.
3. **Existing clients (portal)** — agents and homeowners accessing their gallery
   and downloads.

---

## Site map

```
/                           -> public single-page site (LIVE)
/admin/login                -> admin sign-in (LIVE)
/admin                      -> dashboard (LIVE)
/admin/projects             -> portfolio + client project list, two-tab (LIVE)
/admin/project?slug=...     -> portfolio project edit, two-tab (LIVE)
/admin/client-project?id=N  -> client project edit, two-tab + status sidebar (LIVE)
/admin/leads                -> leads list + detail, combined (?id= switching) (LIVE)
/admin/account              -> change password (LIVE)
/admin/forgot-password      -> request reset email (LIVE)
/admin/reset-password       -> set new password from email link (LIVE)
/admin/team                 -> team management, super_admin only (LIVE)
/admin/clients              -> all portal clients list (LIVE)
/portal/login               -> client portal login (LIVE)
/portal                     -> client project list (LIVE)
/portal/project?slug=...    -> client gallery + downloads (LIVE)
/portal/accept-invite       -> set password from invite link (LIVE)
/portal/account             -> client change password (LIVE)
/portal/forgot-password     -> client forgot password (LIVE)
/portal/reset-password      -> client reset password (LIVE)

/api/inquiries                                    -> Worker (LIVE)
/api/auth/login                                   -> Worker (LIVE)
/api/auth/logout                                  -> Worker (LIVE)
/api/auth/me                                      -> Worker (LIVE)
/api/auth/change-password                         -> Worker (LIVE)
/api/auth/forgot-password                         -> Worker (LIVE)
/api/auth/reset-password                          -> Worker (LIVE)
/api/admin/dashboard                              -> Worker (LIVE)
/api/admin/leads                                  -> Worker (LIVE)
/api/admin/leads/:id                              -> Worker (LIVE)
/api/admin/projects                               -> Worker (LIVE)
/api/admin/projects/:slug                         -> Worker (LIVE)
/api/admin/projects/:slug/images                  -> Worker (LIVE)
/api/admin/projects/:slug/originals               -> Worker (LIVE, dead code)
/api/admin/client-projects                        -> Worker (LIVE)
/api/admin/client-projects/:id                    -> Worker (LIVE)
/api/admin/client-projects/:id/images             -> Worker (LIVE)
/api/admin/client-projects/:id/video-files        -> Worker (LIVE)
/api/admin/client-projects/:id/invite             -> Worker (LIVE)
/api/admin/client-projects/:id/clients            -> Worker (LIVE)
/api/admin/client-projects/:id/videos             -> Worker (LIVE - YouTube/Reels/TikTok links)
/api/admin/client-projects/:id/videos/:id         -> Worker (LIVE - delete video link)
/api/admin/invite                                 -> Worker (LIVE)
/api/admin/invite/resend                          -> Worker (LIVE)
/api/admin/clients/:id/access/:slug               -> Worker (LIVE - portfolio access revoke)
/api/admin/clients/:id/access/cp/:id              -> Worker (LIVE - client project access revoke)
/api/admin/team                                   -> Worker (LIVE)
/api/admin/team/:id                               -> Worker (LIVE)
/api/admin/all-clients                            -> Worker (LIVE)
/api/admin/all-clients/:id                        -> Worker (LIVE)
/api/portal/accept-invite                         -> Worker (LIVE)
/api/portal/projects                              -> Worker (LIVE)
/api/portal/projects/:slug                        -> Worker (LIVE)
/api/portal/projects/:slug/download               -> Worker (LIVE - zips images)
/api/portal/projects/:slug/video-files            -> Worker (LIVE - direct R2 URLs)
```

---

## Public site — shipped state

Single page, six sections, smooth scroll. Footer has three columns: brand,
navigate, contact (with access links at bottom of contact column).

**Section 1: Hero** — full-bleed silent autoplay video, overlay gradient,
display copy, no CTA button, Gold scroll cue.

**Section 2: Selected Work** — Cream bg, asymmetric editorial grid from
`projects.json`. Cards with Gold project number, serif title, micro location.
Hover: Gold underline + image scale. Click: modal. Footer link: *Inquire
about your listing ->*.

**Section 3: Services** — Forest bg. Three discipline cards (HDR Photography,
Cinematic Tours, AI Staging) with Gold numbers and hairline separators.

**Section 4: Approach** — Cream bg. Four numbered steps in horizontal
timeline (desktop) / vertical list (mobile).

**Section 5: Studio** — Cream bg, split layout (desktop). Studio photo at
`/images/studio/studiopic.jpg`, alt `"Vesta Folio studio"`.

**Section 6: Inquire** — Forest bg. Form fields: Name, Email, Brokerage
(optional), Property address, Listing date (optional), Sq ft (optional),
Listing price (optional), Bedrooms (optional), Bathrooms (optional), Services
(checkboxes), Notes. Turnstile widget. Success: form replaced by Cream serif
confirmation. Error: Gold-border state.

**Footer:** Brand column, Navigate column, Contact column. Contact column
includes email, Instagram, and at the bottom: "Client portal" -> `/portal/login`
and "Studio access" -> `/admin/login`.

---

## Admin section — shipped state

All admin pages share brand discipline: Cream surface, Forest text, Gold
accents, Cormorant for display, Inter for body/micro, sentence case,
Gold-border errors, Sage-border success.

Nav links on every admin page:
**Dashboard - Projects - Leads - Clients - [Team, super_admin only] - Account - Log out**

### /admin (dashboard)
- 4 stat cards (2-col mobile, 4-col at 1024px+):
  - Inquiries this month
  - Awaiting response (Unassigned leads — Gold value)
  - Active projects
  - Delivered this month
- Recent leads panel (last 5, links to `?id=` detail, status badges)
- Active client projects panel (last 5, links to edit, status badges,
  filters out Delivered and Archived)

### /admin/projects
- Two tabs: **Portfolio** | **Client projects**
- Portfolio tab: table with Edit + Delete. New project modal.
- Client projects tab: table with status badge column. Edit + Delete. New modal.

### /admin/project?slug=... (portfolio edit)
Two tabs: **Details** | **Images**

**Details tab:**
- Metadata form: title, slug, location, year, display order, description,
  YouTube ID, services, show on homepage
- Client access section (sibling form, not nested): invite by name+email,
  access list with Resend + Revoke

**Images tab:**
- Drop zone (JPEG/PNG -> WebP at 85%, max 1800px)
- Drag-to-reorder pending + existing images

### /admin/client-project?id=N (client project edit)
Two tabs: **Details** | **Images**. Plus a persistent right sidebar.

**Details tab:**
- Metadata: title, slug, location, year, description, YouTube ID, services
- Audit trail: "Last edited by [name] on [date]"
- Client access section: invite form (sibling, not nested), access list

**Images tab:**
- Drop zone for images (JPEG/PNG -> WebP at 85%, max 1800px)
- Drag-to-reorder pending + existing gallery images
- Video files section below images: drop zone for MP4/MOV/WebM/M4V,
  uploaded list with remove

**Right sidebar (sticky, cp9-layout):**
- Status tracker: step list (Booked/Filming/Editing/Delivered/Archived),
  current step highlighted gold, done steps dimmed sage
- Status select + Save status button
- Videos section: YouTube embed / Reels link / TikTok ID text, add form,
  remove per video

**CRITICAL:** Three sibling forms — never nested:
- `<form id="project-form">` — details metadata
- `<form id="invite-form">` — client invite
- `<form id="video-add-form">` — video link add

### /admin/leads (combined list + detail)
**List view:** filter buttons, search (debounced 350ms), table, pagination 50/page.

**Detail view (`?id=N`):**
- Header: name, address, status badge, Create client project button
- Left: Contact + Property + Client notes
- Right sidebar: status select, internal notes, Save, audit trail,
  linked project link

### /admin/team (super_admin only)
- Table of admin + super_admin accounts
- Add team member modal: name + email, sends password-set invite via Resend
- Remove button per row (not on self, not on super_admin)
- Non-super_admin redirected to /admin immediately

### /admin/clients
- Search by name/email (debounced)
- Table: name, email, project count, last login
- View modal: email, joined, last login, project access table with Revoke per row

### /admin/account
- Change password (current + new + confirm)

---

## Two-tier project model

### Portfolio projects (public site)
- Stored in `public/data/projects.json`
- Images stored in `public/images/projects/[slug]/` as WebP
- Managed via `/admin/project?slug=...`

### Client projects (portal)
- Stored in D1 `client_projects` table
- Gallery images stored in R2 `vestafolioco-images` at `client-projects/[slug]/`
- Video files stored in R2 `vestafolioco-images` at `client-projects/[slug]/videos/`
- Video links (YouTube/Reels/TikTok) stored in D1 `client_project_videos`
- Clients access via `/portal` after invite + password set
- Managed via `/admin/client-project?id=N`

---

## Data models

### D1 schema — `vestafolioco-db` (all tables live)

```sql
CREATE TABLE inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  brokerage TEXT,
  property_address TEXT NOT NULL,
  listing_date TEXT,
  services TEXT,
  notes TEXT,
  sq_ft INTEGER,
  bedrooms INTEGER,
  bathrooms REAL,
  listing_price INTEGER,
  status TEXT NOT NULL DEFAULT 'Unassigned',
  notes_internal TEXT,
  client_project_id INTEGER,
  last_edited_by INTEGER REFERENCES users(id),
  last_edited_at TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- status: Unassigned | Contacted | Booked | Filming | Editing | Delivered | Archived

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'client', 'super_admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE password_resets (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE client_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  year INTEGER NOT NULL,
  description TEXT NOT NULL,
  youtube_id TEXT,
  services TEXT,
  hero_image TEXT,
  gallery TEXT,
  status TEXT NOT NULL DEFAULT 'Booked',
  video_files TEXT,
  last_edited_by INTEGER REFERENCES users(id),
  last_edited_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- status: Booked | Filming | Editing | Delivered | Archived

CREATE TABLE client_project_access_v2 (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_project_id INTEGER NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, client_project_id)
);

CREATE TABLE client_project_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_project_id INTEGER NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('youtube', 'reels', 'tiktok')),
  video_id TEXT NOT NULL,
  title TEXT,
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Known live user accounts
- id 1: `vestafolioco@gmail.com` — `super_admin` — name "Admin"
- id 2: `caseyvillanueva@gmail.com` — `admin` (note: personal name in DB)
- id 3: `jmferriol@gmail.com` — `client`

---

## Asset specs

### Hero video
- H.264, MP4, 1280x720, 30fps, 2Mbps VBR, no audio, 12-15s, target 3-5MB

### Portfolio project images
- Hero: 2400x1260px WebP, quality 85-90, under 400KB
- Gallery: 1800x1350px WebP, quality 85, under 250KB

### Client project images (R2)
- Resized client-side via Canvas to max 1800px wide
- Exported as WebP at quality 0.85
- Stored at `images.vestafolioco.com/client-projects/[slug]/`

### Client project video files (R2)
- MP4, MOV, WebM, M4V — uploaded as-is, no resizing
- Stored at `images.vestafolioco.com/client-projects/[slug]/videos/[filename]`
- Max practical size: ~100MB (Worker request body limit)
- For files >100MB: direct R2 upload via presigned URL (not yet implemented)

---

## Hosting and deployment

### Cloudflare Pages — `vestafolioco`
- Repo: `caseyv22/vestafolioco`, branch `main`
- Build command: none (static)
- Output directory: `public`
- Custom domain: `vestafolioco.com`
- HTTPS: Always Use HTTPS + Automatic HTTPS Rewrites, Full SSL mode
- `_redirects`: `/admin/projects/* /admin/project.html 200`

### Cloudflare Worker — `vestafolioco-api`
- Repo root: `/workers`, Workers Builds auto-deploys
- Route: `vestafolioco.com/api/*`
- Bundled: `bcryptjs@^2.4.3`

### Cloudflare D1 — `vestafolioco-db`
- ID: `3e703131-aec6-4b74-a6cf-cd1f0e423c5f`
- Bound as `env.DB`

### Cloudflare R2
- `vestafolioco-images` — bound as `env.IMAGES`, public via `images.vestafolioco.com`
  - Stores: client gallery WebP images + client video files
  - CORS: GET from `https://vestafolioco.com`
- `vestafolioco-originals` — bound as `env.ORIGINALS`, private (no public domain)
  - No longer used by any frontend. Dead code remains in Worker.

### Cloudflare Email Routing
- `info@vestafolioco.com` -> `vestafolioco@gmail.com` (Active)
- `hello@vestafolioco.com` -> `vestafolioco@gmail.com` (Active)
- Gmail SMTP alias configured: replies send from `info@vestafolioco.com`

### Worker secrets (dashboard only)
- `RESEND_API_KEY`
- `TURNSTILE_SECRET_KEY`
- `GITHUB_TOKEN` — fine-grained PAT, `caseyv22/vestafolioco`, contents read+write only

### Worker vars (`wrangler.jsonc`)
- `INQUIRY_FROM` — `hello@vestafolioco.com` (consider updating to `info@`)
- `INQUIRY_TO` — `vestafolioco@gmail.com`
- `GITHUB_OWNER` — `caseyv22`
- `GITHUB_REPO` — `vestafolioco`
- `GITHUB_BRANCH` — `main`
- `PROJECTS_JSON_PATH` — `public/data/projects.json`
- `IMAGES_BASE_URL` — `https://images.vestafolioco.com`

---

## Auth (shipped)

- Session cookies: `vf_session`, HttpOnly, Secure, SameSite=Lax, 30-day, DB-backed
- Bcrypt cost 12, library `bcryptjs`
- Three roles: `admin`, `client`, `super_admin`
- `requireAdmin` allows admin + super_admin
- `requireSuperAdmin` allows super_admin only
- `requireClient` allows client + admin + super_admin (portal preview)
- Login redirect: admin/super_admin -> `/admin`, client -> `/portal`
- Anti-timing on login, anti-enumeration on forgot-password
- Password change revokes other sessions; reset revokes all
- Invite flow reuses `password_resets` table with 7-day expiry

### Email templates (Resend)
| Template | Trigger |
|---|---|
| Inquiry notification | `/api/inquiries` success -> studio |
| Inquiry confirmation | `/api/inquiries` success -> inquirer |
| Password reset | `/api/auth/forgot-password` (if user exists) |
| Client project invite | `/api/admin/client-projects/:id/invite` -> client |
| Team member invite | `/api/admin/team` POST -> new admin |

---

## Leads management (shipped)

### Lead statuses
`Unassigned` -> `Contacted` -> `Booked` -> `Filming` -> `Editing` -> `Delivered` -> `Archived`

### Create client project from lead
1. Auto-generates slug from property address
2. Handles slug conflicts with timestamp suffix
3. Creates client project via `POST /api/admin/client-projects`
4. Links lead via `PATCH /api/admin/leads/:id` (`client_project_id`)
5. Bumps lead status Unassigned -> Contacted
6. Redirects to `/admin/client-project?id=N&created=1`

---

## Routing conventions

### Admin pages
- `/admin` — `/admin/index.html`
- `/admin/projects` — `/admin/projects.html`
- `/admin/project?slug=...` — via `_redirects` rewrite
- `/admin/client-project?id=N` — `/admin/client-project.html`
- `/admin/leads` — `/admin/leads.html`; JS detects `?id=` to switch views
- `/admin/team` — `/admin/team.html` (Cloudflare Pages clean URL)
- `/admin/clients` — `/admin/clients.html` (Cloudflare Pages clean URL)

### Portal pages
- `/portal/project?slug=...` — `/portal/project.html`; JS reads `?slug=`

---

## Known issues and decisions

1. **Portal uses slug for project URLs** — Worker supports both id and slug
   lookups. Acceptable for now; clean up in v2.

2. **`admin.js` is legacy** — not referenced by any current page. Can be
   deleted safely in a future cleanup pass.

3. **`/api/admin/projects/:slug/originals` is dead code** — the Originals
   tab was removed from the admin UI in chunk 9b. The Worker handler remains
   but no frontend calls it.

4. **`vestafolioco-originals` R2 bucket is unused** — the ORIGINALS binding
   remains in `wrangler.jsonc` but no new code writes to it. Existing
   files in the bucket (if any) are stranded.

5. **Concurrent edit 409** — GitHub Contents API requires current SHA. Two
   tabs editing simultaneously will 409 on second write.

6. **Video file size cap** — Worker request body limit is ~100MB. Video files
   over that size cannot be uploaded through the current multipart handler.
   Presigned direct-to-R2 upload is the fix; not yet implemented.

7. **`INQUIRY_FROM` in wrangler.jsonc** — still set to `hello@vestafolioco.com`.
   Consider updating to `info@vestafolioco.com` to match the public-facing address.

---

## Phased build plan

### v0 — Public site (SHIPPED)
All sections, real projects, hero video, brand assets, HTTPS, analytics.

### v1 — Admin + Worker (SHIPPED, chunks 1-9)

- [x] Chunk 1: Inquiry email delivery (Resend, branded HTML)
- [x] Chunk 2: Turnstile bot protection
- [x] Chunk 3: D1 inquiry logging
- [x] Chunk 4a: Auth from scratch (login, sessions)
- [x] Chunk 4b: Account management (change/forgot/reset password)
- [x] Chunk 5: Portfolio project CRUD + image upload pipeline
- [x] Chunk 6: Client portal (invite, accept-invite, gallery, download)
- [x] Chunk 7: Two-tier project model (D1 client projects)
- [x] Chunk 8a: Dashboard + leads management + extended inquiry fields
- [x] Chunk 8b/8c: Project edit UI (Details | Images tabs)
- [x] Chunk 9: Roles, team management, clients page, status tracker,
      audit trail, video links, video file uploads, portal downloads,
      public site footer access links

### v2 — Polish and public site enhancements

- [ ] Per-project detail pages with SEO URLs
- [ ] All Work page with service filter
- [ ] YouTube reel embeds in public site project modal
- [ ] Open Graph + Twitter Card meta for project shares
- [ ] Sitemap.xml + robots.txt
- [ ] Schema.org `LocalBusiness` markup
- [ ] Lighthouse performance pass (target >=95 mobile)
- [ ] Portal: client project URL by id instead of slug
- [ ] Presigned direct-to-R2 video upload (removes 100MB cap)
- [ ] Clean up dead code: admin.js, originals Worker handlers, ORIGINALS bucket

---

## Out of scope

- Blog / journal
- Newsletter signup
- Pricing page
- Live chat
- Third-party identity provider (Clerk, Auth0, Firebase)
- Third-party analytics beyond Cloudflare
- Multi-language
- E-commerce / Stripe
- Calendar booking
- CRM integration
- Multi-author CMS
- Scroll reveal / fade-in / stagger animations
- Multi-factor auth
- OAuth sign-in
- Public sign-up (accounts are admin-created only)
