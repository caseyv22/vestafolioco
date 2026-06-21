# Vesta Folio

Estate film and photography. Los Angeles.

**Live site:** [vestafolioco.com](https://vestafolioco.com)

---

## What this is

A static single-page editorial website for Vesta Folio, hosted on Cloudflare Pages. No build step. No framework. Files are edited directly in the GitHub web UI and auto-deploy on push.

---

## File structure

```
public/
├── index.html              ← the entire public site
├── css/
│   ├── tokens.css          ← design tokens (all color, type, spacing values)
│   ├── base.css            ← reset, typography, layout primitives
│   └── site.css            ← all section styles
├── js/
│   └── site.js             ← portfolio render, scroll reveal, nav, modal, form
├── data/
│   └── projects.json       ← portfolio content (edit this to add/update projects)
├── brand/                  ← logo SVG files (add when available)
├── images/
│   └── projects/[slug]/    ← project images in webp format
└── videos/
    └── hero.mp4            ← hero loop (add when shot)
```

---

## Adding a project (v0 workflow)

1. Add project images to `public/images/projects/[slug]/` via GitHub web UI (hero.webp + 01.webp, 02.webp, etc.)
2. Edit `public/data/projects.json` — add an entry following the existing schema
3. Commit — Cloudflare Pages auto-deploys in ~60 seconds

---

## Adding logo files

Drop the following files into `public/brand/` when the SVG files are ready:

| File | Used in |
|---|---|
| `vesta-folio-primary.svg` | Hero (future), key brand surfaces |
| `vesta-folio-horizontal.svg` | Sticky nav (replaces CSS wordmark stand-in) |
| `vesta-folio-mark.svg` | Watermarks, small spaces |
| `vesta-folio-wordmark.svg` | Footer (replaces CSS wordmark stand-in) |
| `vesta-folio-monogram.svg` | Favicon |
| `favicon.ico` | Browser tab |
| `favicon-192.png` | Apple touch icon |
| `favicon-512.png` | Android maskable icon |
| `og-image.jpg` | Social link previews (1200×630px) |

Then update `index.html` to replace the CSS wordmark stand-ins with `<img>` tags referencing the SVG files.

---

## Adding the hero video

1. Export your loop as `hero.mp4` (H.264, silent, 12-15 seconds, 1920×1080 or 2560×1440)
2. Upload to `public/videos/hero.mp4` via GitHub web UI
3. In `index.html`, find the commented-out `<video>` tag in Section 1 and uncomment it

---

## Phases

- **v0 (current):** Public site, hand-edited `projects.json`, no backend
- **v1 (next):** Admin dashboard, login, project management via browser, inquiry form Worker
- **v2 (later):** Client portal, gallery access, ZIP download

---

## Tech stack

| Layer | Choice |
|---|---|
| Hosting | Cloudflare Pages |
| Frontend | Plain HTML + CSS + JS (no framework, no build step) |
| Data | `projects.json` in repo |
| API (v1+) | Cloudflare Workers |
| Database (v1+) | Cloudflare D1 |

See `SPEC.md` and `CLAUDE.md` for full product and engineering spec.
