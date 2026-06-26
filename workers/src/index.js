// workers/src/index.js
// Vesta Folio API Worker
//
// Routes:
//   POST /api/inquiries                        → inquiry form + email
//   POST /api/auth/login                       → session login
//   POST /api/auth/logout                      → session logout
//   GET  /api/auth/me                          → session check
//   POST /api/auth/change-password             → change password (session required)
//   POST /api/auth/forgot-password             → send reset email
//   POST /api/auth/reset-password              → set new password from token
//   GET  /api/admin/projects                   → list projects.json (admin only)
//   POST /api/admin/projects                   → create project in projects.json (admin only)
//   PATCH  /api/admin/projects/:slug           → update project metadata (admin only)
//   DELETE /api/admin/projects/:slug           → delete project (admin only)
//   POST /api/admin/projects/:slug/images      → upload images to R2, update projects.json (admin only)
//
// Env bindings:
//   Secrets:  RESEND_API_KEY, TURNSTILE_SECRET_KEY, GITHUB_TOKEN
//   Text vars (wrangler.jsonc): INQUIRY_FROM, INQUIRY_TO, GITHUB_OWNER, GITHUB_REPO,
//                               GITHUB_BRANCH, PROJECTS_JSON_PATH, IMAGES_BASE_URL
//   D1: DB (vestafolioco-db)
//   R2: IMAGES (vestafolioco-images)

import bcrypt from 'bcryptjs';

const ALLOWED_ORIGIN = 'https://vestafolioco.com';

const SESSION_COOKIE  = 'vf_session';
const SESSION_DAYS    = 30;
const DUMMY_HASH      = '$2b$12$e56ICJijxIJPH4INvT2Hfu/Q0dp1mRrLXqktHBz6c32LdZF5Kk/9O';

const PASSWORD_RESET_HOURS = 24;
const MIN_PASSWORD_LENGTH  = 8;

const SERVICE_LABELS = {
  hdr:       'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:   'AI Staging',
};

const BRAND = {
  forest: '#1F2E2A',
  cream:  '#F2EDE3',
  gold:   '#A8884E',
  sage:   '#4A5C57',
  serif:  "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  sans:   "'Inter', Helvetica, Arial, sans-serif",
};


export default {
  async fetch(request, env) {
    const url  = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/inquiries') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleInquiry(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/auth/login') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleLogin(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/auth/logout') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleLogout(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/auth/me') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleMe(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/auth/change-password') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleChangePassword(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/auth/forgot-password') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleForgotPassword(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/auth/reset-password') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleResetPassword(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/admin/projects') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListProjects(request, env));
      if (request.method === 'POST')    return cors(await handleCreateProject(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const projectSlugMatch = path.match(/^\/api\/admin\/projects\/([^/]+)$/);
    if (projectSlugMatch) {
      const slug = projectSlugMatch[1];
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'PATCH')   return cors(await handleUpdateProject(request, env, slug));
      if (request.method === 'DELETE')  return cors(await handleDeleteProject(request, env, slug));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const imagesMatch = path.match(/^\/api\/admin\/projects\/([^/]+)\/images$/);
    if (imagesMatch) {
      const slug = imagesMatch[1];
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleUploadImages(request, env, slug));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const imagesOrderMatch = path.match(/^\/api\/admin\/projects\/([^/]+)\/images\/order$/);
    if (imagesOrderMatch) {
      const slug = imagesOrderMatch[1];
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'PATCH')   return cors(await handleReorderImages(request, env, slug));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    return cors(new Response('Not found', { status: 404 }));
  },
};


/* ----------------------------------------------------------
   ADMIN: PROJECT CRUD
   ---------------------------------------------------------- */

async function requireAdmin(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== 'admin') return { user: null, response: json({ error: 'Not authorized.' }, 401) };
  return { user, response: null };
}

async function handleListProjects(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  try {
    const { projects } = await ghReadProjects(env);
    return json({ ok: true, projects });
  } catch (err) {
    console.error('List projects error:', err);
    return json({ error: 'Could not load projects.' }, 500);
  }
}

async function handleCreateProject(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const validation = validateProjectPayload(data, true);
  if (validation.error) return json({ error: validation.error }, 400);

  try {
    const { projects, sha } = await ghReadProjects(env);
    if (projects.some(p => p.slug === data.slug)) {
      return json({ error: 'A project with that slug already exists.' }, 409);
    }

    const now = new Date().toISOString().slice(0, 10);
    const newProject = {
      slug:         data.slug,
      title:        data.title.trim(),
      location:     data.location.trim(),
      year:         Number(data.year),
      description:  data.description.trim(),
      hero_image:   '',
      gallery:      [],
      services:     data.services || [],
      featured:     Boolean(data.featured),
      order:        Number(data.order) || (projects.length + 1),
      published_at: now,
    };

    projects.push(newProject);
    await ghWriteProjects(env, projects, sha, `Add project: ${newProject.slug}`);
    return json({ ok: true, project: newProject }, 201);
  } catch (err) {
    console.error('Create project error:', err);
    if (err.status === 409) return json({ error: 'This project was updated in another tab. Please reload and try again.' }, 409);
    return json({ error: 'Could not save project.' }, 500);
  }
}

async function handleUpdateProject(request, env, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const validation = validateProjectPayload(data, false);
  if (validation.error) return json({ error: validation.error }, 400);

  try {
    const { projects, sha } = await ghReadProjects(env);
    const idx = projects.findIndex(p => p.slug === slug);
    if (idx === -1) return json({ error: 'Project not found.' }, 404);

    const existing = projects[idx];

    if (data.slug && data.slug !== slug) {
      if (projects.some(p => p.slug === data.slug)) {
        return json({ error: 'A project with that slug already exists.' }, 409);
      }
    }

    projects[idx] = {
      ...existing,
      slug:        data.slug        !== undefined ? data.slug               : existing.slug,
      title:       data.title       !== undefined ? data.title.trim()       : existing.title,
      location:    data.location    !== undefined ? data.location.trim()    : existing.location,
      year:        data.year        !== undefined ? Number(data.year)       : existing.year,
      description: data.description !== undefined ? data.description.trim() : existing.description,
      services:    data.services    !== undefined ? data.services           : existing.services,
      featured:    data.featured    !== undefined ? Boolean(data.featured)  : existing.featured,
      order:       data.order       !== undefined ? Number(data.order)      : existing.order,
    };

    await ghWriteProjects(env, projects, sha, `Update project: ${slug}`);
    return json({ ok: true, project: projects[idx] });
  } catch (err) {
    console.error('Update project error:', err);
    if (err.status === 409) return json({ error: 'This project was updated in another tab. Please reload and try again.' }, 409);
    return json({ error: 'Could not update project.' }, 500);
  }
}

async function handleDeleteProject(request, env, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;

  try {
    const { projects, sha } = await ghReadProjects(env);
    const idx = projects.findIndex(p => p.slug === slug);
    if (idx === -1) return json({ error: 'Project not found.' }, 404);

    projects.splice(idx, 1);
    await ghWriteProjects(env, projects, sha, `Delete project: ${slug}`);
    return json({ ok: true });
  } catch (err) {
    console.error('Delete project error:', err);
    if (err.status === 409) return json({ error: 'This project was updated in another tab. Please reload and try again.' }, 409);
    return json({ error: 'Could not delete project.' }, 500);
  }
}


/* ----------------------------------------------------------
   ADMIN: IMAGE UPLOAD (5b)

   Receives { images: [{ data: '<base64 WebP>', filename: 'hero.webp' }, ...] }
   Writes each image to R2 at projects/[slug]/[filename].
   Updates projects.json: hero_image = first image URL, gallery = rest.
   Commits projects.json to GitHub.

   Images are pre-resized and WebP-encoded client-side.
   Worker only handles storage and JSON update.
   ---------------------------------------------------------- */

async function handleUploadImages(request, env, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;

  if (!env.IMAGES) {
    console.error('R2 IMAGES binding not set');
    return json({ error: 'Image storage is not configured.' }, 500);
  }

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const images = data.images;
  if (!Array.isArray(images) || images.length === 0) {
    return json({ error: 'No images provided.' }, 400);
  }
  if (images.length > 20) {
    return json({ error: 'Maximum 20 images per upload.' }, 400);
  }

  // Validate each image entry
  for (const img of images) {
    if (!img.data || typeof img.data !== 'string') {
      return json({ error: 'Each image must have a base64 data field.' }, 400);
    }
    if (!img.filename || typeof img.filename !== 'string') {
      return json({ error: 'Each image must have a filename.' }, 400);
    }
    // Only allow safe filenames: hero.webp, 01.webp, 02.webp, etc.
    if (!/^(hero|\d{2})\.webp$/.test(img.filename)) {
      return json({ error: `Invalid filename: ${img.filename}` }, 400);
    }
    // Rough size check: base64 of 5MB = ~6.8M chars
    if (img.data.length > 7_000_000) {
      return json({ error: `Image ${img.filename} is too large.` }, 400);
    }
  }

  const imagesBaseUrl = env.IMAGES_BASE_URL || 'https://images.vestafolioco.com';
  const uploadedUrls  = [];

  // Write each image to R2
  for (const img of images) {
    const key = `projects/${slug}/${img.filename}`;

    // Decode base64 → binary
    let binary;
    try {
      binary = base64ToUint8Array(img.data);
    } catch (err) {
      console.error('Base64 decode error:', err);
      return json({ error: `Could not decode image ${img.filename}.` }, 400);
    }

    try {
      await env.IMAGES.put(key, binary, {
        httpMetadata: { contentType: 'image/webp' },
      });
    } catch (err) {
      console.error('R2 put error:', key, err);
      return json({ error: `Could not store image ${img.filename}.` }, 500);
    }

    uploadedUrls.push({
      filename: img.filename,
      url:      `${imagesBaseUrl}/${key}`,
    });
  }

  // Update projects.json: set hero_image and gallery
  try {
    const { projects, sha } = await ghReadProjects(env);
    const idx = projects.findIndex(p => p.slug === slug);
    if (idx === -1) {
      return json({ error: 'Project not found in projects.json.' }, 404);
    }

    const heroEntry    = uploadedUrls.find(u => u.filename === 'hero.webp');
    const galleryEntries = uploadedUrls
      .filter(u => u.filename !== 'hero.webp')
      .sort((a, b) => a.filename.localeCompare(b.filename));

    // Merge: preserve existing images if not being replaced
    if (heroEntry) {
      projects[idx].hero_image = heroEntry.url;
    }
    if (galleryEntries.length > 0) {
      projects[idx].gallery = galleryEntries.map(u => u.url);
    }

    await ghWriteProjects(env, projects, sha, `Upload images: ${slug}`);

    return json({
      ok: true,
      hero_image: projects[idx].hero_image,
      gallery:    projects[idx].gallery,
      uploaded:   uploadedUrls.length,
    });
  } catch (err) {
    console.error('Image upload projects.json update error:', err);
    // Images already in R2 — don't fail silently on the JSON update
    if (err.status === 409) return json({ error: 'This project was updated in another tab. Please reload and try again.' }, 409);
    return json({ error: 'Images uploaded but could not update projects.json. Please reload and try again.' }, 500);
  }
}

// PATCH /api/admin/projects/:slug/images/order — reorder or delete existing images
// Receives { hero_image: string, gallery: string[] }
// Updates projects.json only — no R2 interaction.
async function handleReorderImages(request, env, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const heroImage = typeof data.hero_image === 'string' ? data.hero_image.trim() : '';
  const gallery   = Array.isArray(data.gallery) ? data.gallery.filter(u => typeof u === 'string' && u.trim()) : [];

  try {
    const { projects, sha } = await ghReadProjects(env);
    const idx = projects.findIndex(p => p.slug === slug);
    if (idx === -1) return json({ error: 'Project not found.' }, 404);

    projects[idx].hero_image = heroImage;
    projects[idx].gallery    = gallery;

    await ghWriteProjects(env, projects, sha, `Reorder images: ${slug}`);
    return json({ ok: true, hero_image: heroImage, gallery });
  } catch (err) {
    console.error('Reorder images error:', err);
    if (err.status === 409) return json({ error: 'This project was updated in another tab. Please reload and try again.' }, 409);
    return json({ error: 'Could not update image order.' }, 500);
  }
}

// Decode a base64 string (with or without data URI prefix) to Uint8Array
function base64ToUint8Array(b64) {
  // Strip data URI prefix if present: data:image/webp;base64,...
  const raw = b64.includes(',') ? b64.split(',')[1] : b64;
  const binary = atob(raw);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}


/* ----------------------------------------------------------
   GITHUB CONTENTS API WRAPPER
   ---------------------------------------------------------- */

function ghHeaders(env) {
  if (!env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not set');
  return {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept':        'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':  'application/json',
    'User-Agent':    'vestafolioco-worker',
  };
}

function ghApiUrl(env, filePath) {
  const owner  = env.GITHUB_OWNER  || 'caseyv22';
  const repo   = env.GITHUB_REPO   || 'vestafolioco';
  const branch = env.GITHUB_BRANCH || 'main';
  return `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
}

async function ghReadProjects(env) {
  const filePath = env.PROJECTS_JSON_PATH || 'public/data/projects.json';
  const res = await fetch(ghApiUrl(env, filePath), { headers: ghHeaders(env) });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('GitHub read error:', res.status, body);
    const err = new Error(`GitHub read failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data     = await res.json();
  const decoded  = atob(data.content.replace(/\n/g, ''));
  const projects = JSON.parse(decoded);
  return { projects, sha: data.sha };
}

async function ghWriteProjects(env, projects, sha, message) {
  const filePath = env.PROJECTS_JSON_PATH || 'public/data/projects.json';
  const owner    = env.GITHUB_OWNER  || 'caseyv22';
  const repo     = env.GITHUB_REPO   || 'vestafolioco';
  const branch   = env.GITHUB_BRANCH || 'main';

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(projects, null, 2) + '\n')));

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method:  'PUT',
      headers: ghHeaders(env),
      body:    JSON.stringify({ message, content, sha, branch }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('GitHub write error:', res.status, body);
    const err = new Error(`GitHub write failed: ${res.status}`);
    err.status = res.status === 409 ? 409 : res.status;
    throw err;
  }

  return res.json();
}


/* ----------------------------------------------------------
   PROJECT PAYLOAD VALIDATION
   ---------------------------------------------------------- */

function validateProjectPayload(data, requireAll) {
  if (requireAll) {
    if (!isNonEmptyString(data.title))       return { error: 'Title is required.' };
    if (!isNonEmptyString(data.slug))        return { error: 'Slug is required.' };
    if (!isNonEmptyString(data.location))    return { error: 'Location is required.' };
    if (!data.year || isNaN(Number(data.year))) return { error: 'Year is required.' };
    if (!isNonEmptyString(data.description)) return { error: 'Description is required.' };
  }

  if (data.slug !== undefined) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
      return { error: 'Slug must be lowercase letters, numbers, and hyphens only.' };
    }
    if (data.slug.length > 80) return { error: 'Slug is too long.' };
  }

  if (data.title       !== undefined && (typeof data.title !== 'string'       || data.title.length > 200))       return { error: 'Title is invalid.' };
  if (data.location    !== undefined && (typeof data.location !== 'string'    || data.location.length > 200))    return { error: 'Location is invalid.' };
  if (data.description !== undefined && (typeof data.description !== 'string' || data.description.length > 2000)) return { error: 'Description is too long.' };
  if (data.year !== undefined) {
    const y = Number(data.year);
    if (isNaN(y) || y < 2000 || y > 2100) return { error: 'Year must be a valid year.' };
  }
  if (data.services !== undefined) {
    if (!Array.isArray(data.services)) return { error: 'Services must be an array.' };
    const allowed = new Set(['hdr', 'cinematic', 'staging']);
    if (data.services.some(s => !allowed.has(s))) return { error: 'Unknown service value.' };
  }

  return { error: null };
}


/* ----------------------------------------------------------
   INQUIRY HANDLER
   ---------------------------------------------------------- */

async function handleInquiry(request, env) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const turnstile = await validateTurnstile(data, request, env);
  if (!turnstile.ok) return json({ error: turnstile.error }, 403);

  const errors = validate(data);
  if (errors.length) return json({ error: errors[0] }, 400);

  const notification = buildNotificationContent(data);
  const nResp = await sendEmail(env, {
    from:     `Vesta Folio Inquiries <${env.INQUIRY_FROM}>`,
    to:       [env.INQUIRY_TO],
    reply_to: data.email,
    subject:  notification.subject,
    html:     notification.html,
    text:     notification.text,
  });

  if (!nResp.ok) {
    const detail = await nResp.text().catch(() => '');
    console.error('Notification email failure:', nResp.status, detail);
    return json({ error: 'Could not deliver inquiry. Please try again, or email vestafolioco@gmail.com directly.' }, 502);
  }

  await logInquiry(data, env);

  const confirmation = buildConfirmationContent(data);
  const cResp = await sendEmail(env, {
    from:     `Vesta Folio <${env.INQUIRY_FROM}>`,
    to:       [data.email],
    reply_to: env.INQUIRY_TO,
    subject:  confirmation.subject,
    html:     confirmation.html,
    text:     confirmation.text,
  });

  if (!cResp.ok) {
    const detail = await cResp.text().catch(() => '');
    console.error('Confirmation email failure (non-blocking):', cResp.status, detail);
  }

  return json({ ok: true }, 200);
}


/* ----------------------------------------------------------
   TURNSTILE
   ---------------------------------------------------------- */

async function validateTurnstile(data, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping.');
    return { ok: true };
  }
  const token = data.turnstile_token;
  if (!isNonEmptyString(token)) return { ok: false, error: "We couldn't verify your request. Please refresh and try again." };

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) body.append('remoteip', clientIp);

  try {
    const resp   = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const result = await resp.json();
    if (result && result.success === true) return { ok: true };
    console.error('Turnstile rejected:', JSON.stringify(result));
    return { ok: false, error: "We couldn't verify your request. Please refresh and try again." };
  } catch (err) {
    console.error('Turnstile network error:', err);
    return { ok: false, error: 'Could not verify your request. Please try again.' };
  }
}


/* ----------------------------------------------------------
   INQUIRY LOGGING
   ---------------------------------------------------------- */

async function logInquiry(d, env) {
  if (!env.DB) { console.warn('DB binding not set — skipping inquiry log.'); return; }
  try {
    const services = Array.isArray(d.services) ? d.services.join(',') : null;
    await env.DB
      .prepare(`INSERT INTO inquiries (name, email, brokerage, property_address, listing_date, services, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(d.name, d.email, d.brokerage || null, d.property_address, d.listing_date || null, services, d.notes || null)
      .run();
  } catch (err) {
    console.error('D1 inquiry log failure (non-blocking):', err);
  }
}


/* ----------------------------------------------------------
   VALIDATION
   ---------------------------------------------------------- */

function validate(d) {
  const errors = [];
  if (!isNonEmptyString(d.name) || d.name.length > 200)          errors.push('Name is required.');
  if (!isNonEmptyString(d.email) || !isEmail(d.email) || d.email.length > 320) errors.push('A valid email is required.');
  if (!isNonEmptyString(d.property_address) || d.property_address.length > 500) errors.push('Property address is required.');
  if (d.brokerage && d.brokerage.length > 200) errors.push('Brokerage is too long.');
  if (d.notes     && d.notes.length > 5000)    errors.push('Notes are too long.');
  if (d.services) {
    if (!Array.isArray(d.services)) errors.push('Services must be an array.');
    else {
      const allowed = new Set(['hdr', 'cinematic', 'staging']);
      if (d.services.some(s => !allowed.has(s))) errors.push('Unknown service value.');
    }
  }
  return errors;
}

function isNonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function isEmail(v)          { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }


/* ----------------------------------------------------------
   EMAIL BUILDERS
   ---------------------------------------------------------- */

function buildNotificationContent(d) {
  const services  = formatServices(d.services);
  const timestamp = new Date().toUTCString();
  const subject   = `New inquiry — ${d.name} — ${d.property_address}`;

  const html = renderShell({ title: 'New inquiry', bodyTable: `
      <tr><td align="center" style="padding-bottom:16px;"><p style="font-family:${BRAND.sans};font-size:11px;font-weight:500;letter-spacing:0.22em;color:${BRAND.sage};margin:0;text-transform:uppercase;">New inquiry</p></td></tr>
      <tr><td align="center" style="padding-bottom:32px;"><p style="font-family:${BRAND.serif};font-size:30px;font-weight:400;line-height:1.3;color:${BRAND.forest};margin:0;">${esc(d.property_address)}</p></td></tr>
      <tr><td align="center" style="padding-bottom:32px;"><div style="width:48px;height:1px;background:${BRAND.gold};font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
      <tr><td style="padding-bottom:32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${detailRow('Name', esc(d.name))}
        ${detailRow('Email', `<a href="mailto:${esc(d.email)}" style="color:${BRAND.gold};text-decoration:none;">${esc(d.email)}</a>`)}
        ${detailRow('Brokerage', esc(d.brokerage) || '—')}
        ${detailRow('Property', esc(d.property_address))}
        ${detailRow('Listing date', esc(d.listing_date) || '—')}
        ${detailRow('Services', esc(services))}
        ${detailRow('Notes', esc(d.notes) || '—', true)}
      </table></td></tr>
      <tr><td align="center" style="padding:24px 0 8px 0;border-top:1px solid ${BRAND.gold};"><p style="font-family:${BRAND.sans};font-size:13px;font-weight:400;color:${BRAND.sage};margin:0;line-height:1.6;">Reply to this email to respond directly to the inquirer.</p></td></tr>
      <tr><td align="center" style="padding-top:8px;"><p style="font-family:${BRAND.sans};font-size:11px;font-weight:400;color:${BRAND.sage};margin:0;">Received ${esc(timestamp)}</p></td></tr>
  `});

  const text = `NEW INQUIRY — vestafolioco.com\n\n${d.property_address}\n\nName: ${d.name}\nEmail: ${d.email}\nBrokerage: ${d.brokerage || '—'}\nProperty: ${d.property_address}\nListing date: ${d.listing_date || '—'}\nServices: ${services}\n\nNotes:\n${d.notes || '—'}\n\n---\nReply to this email to respond directly to the inquirer.\nReceived ${timestamp}\n`;

  return { subject, html, text };
}

function buildConfirmationContent(d) {
  const firstName = (d.name || '').trim().split(/\s+/)[0] || '';
  const greeting  = firstName ? `Thank you, ${esc(firstName)}.` : 'Thank you.';
  const subject   = 'We received your inquiry — Vesta Folio';

  const html = renderShell({ title: 'Vesta Folio', bodyTable: `
      <tr><td style="padding-bottom:20px;"><p style="font-family:${BRAND.serif};font-size:32px;font-weight:400;line-height:1.3;color:${BRAND.forest};margin:0;">${greeting}</p></td></tr>
      <tr><td style="padding-bottom:32px;"><p style="font-family:${BRAND.sans};font-size:15px;font-weight:400;line-height:1.75;color:${BRAND.sage};margin:0 0 16px 0;">We've received your inquiry about ${esc(d.property_address)} and will reply within 24 hours.</p><p style="font-family:${BRAND.sans};font-size:15px;font-weight:400;line-height:1.75;color:${BRAND.sage};margin:0;">If anything has changed in the meantime, just reply to this email and we'll see it.</p></td></tr>
      <tr><td style="padding-bottom:40px;"><p style="font-family:${BRAND.serif};font-size:18px;font-weight:400;color:${BRAND.forest};margin:0;font-style:italic;">— Vesta Folio</p></td></tr>
      <tr><td align="center" style="padding-bottom:24px;"><div style="width:48px;height:1px;background:${BRAND.gold};font-size:1px;line-height:1px;">&nbsp;</div></td></tr>
      <tr><td align="center"><p style="font-family:${BRAND.sans};font-size:10px;font-weight:500;letter-spacing:0.22em;color:${BRAND.sage};margin:0 0 12px 0;text-transform:uppercase;">Estate film and photography</p><p style="font-family:${BRAND.sans};font-size:11px;font-weight:400;color:${BRAND.sage};margin:0;line-height:1.7;"><a href="https://vestafolioco.com" style="color:${BRAND.sage};text-decoration:none;">vestafolioco.com</a><br>Los Angeles</p></td></tr>
  `});

  const text = `${firstName ? `Thank you, ${firstName}.` : 'Thank you.'}\n\nWe've received your inquiry about ${d.property_address} and will reply within 24 hours.\n\nIf anything has changed in the meantime, just reply to this email and we'll see it.\n\n— Vesta Folio\n\n---\nvestafolioco.com\nLos Angeles\n`;

  return { subject, html, text };
}

function renderShell({ title, bodyTable }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.cream};-webkit-font-smoothing:antialiased;">
<center style="width:100%;background:${BRAND.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};">
  <tr><td align="center" style="padding:56px 24px;">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
      <tr><td align="center" style="padding-bottom:48px;"><p style="font-family:${BRAND.serif};font-size:22px;font-weight:400;letter-spacing:0.2em;color:${BRAND.gold};margin:0;text-transform:uppercase;">Vesta Folio</p></td></tr>
      ${bodyTable}
    </table>
  </td></tr>
</table>
</center>
</body></html>`;
}

function detailRow(label, value, isLast = false) {
  const p = isLast ? '0' : '14px';
  return `<tr><td width="32%" valign="top" style="padding:0 16px ${p} 0;font-family:${BRAND.sans};font-size:10px;font-weight:500;letter-spacing:0.18em;color:${BRAND.sage};text-transform:uppercase;line-height:1.6;">${label}</td><td valign="top" style="padding:0 0 ${p} 0;font-family:${BRAND.sans};font-size:15px;font-weight:400;color:${BRAND.forest};line-height:1.6;word-break:break-word;">${value}</td></tr>`;
}

function formatServices(services) {
  if (!Array.isArray(services) || services.length === 0) return '—';
  return services.map(s => SERVICE_LABELS[s] || s).join(', ');
}

function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}


/* ----------------------------------------------------------
   RESEND
   ---------------------------------------------------------- */

async function sendEmail(env, opts) {
  return fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(opts),
  });
}


/* ----------------------------------------------------------
   AUTH
   ---------------------------------------------------------- */

async function handleLogin(request, env) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const email    = isNonEmptyString(data?.email)    ? data.email.trim().toLowerCase() : '';
  const password = isNonEmptyString(data?.password) ? data.password : '';

  if (!email || !password) return json({ error: 'Email and password are required.' }, 400);
  if (!env.DB)             return json({ error: 'Authentication is unavailable.' }, 500);

  try {
    const user        = await env.DB.prepare('SELECT id, email, password_hash, role, name FROM users WHERE email = ?').bind(email).first();
    const hashToCheck = user?.password_hash || DUMMY_HASH;
    const valid       = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid) return json({ error: 'Invalid email or password.' }, 401);

    const token     = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run();

    try { await env.DB.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").bind(user.id).run(); }
    catch (err) { console.error('last_login_at update failed:', err); }

    const cookie   = buildSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
    const redirect = user.role === 'admin' ? '/admin' : '/portal';
    return new Response(JSON.stringify({ ok: true, redirect, user: { email: user.email, role: user.role, name: user.name } }), {
      status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
    });
  } catch (err) {
    console.error('Login error:', err);
    return json({ error: 'Authentication failed.' }, 500);
  }
}

async function handleLogout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (token && env.DB) {
    try { await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run(); }
    catch (err) { console.error('Logout DB error:', err); }
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': buildSessionCookie('', 0) },
  });
}

async function handleMe(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);
  return json({ user });
}

async function handleChangePassword(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const oldPassword = isNonEmptyString(data?.old_password) ? data.old_password : '';
  const newPassword = isNonEmptyString(data?.new_password) ? data.new_password : '';

  if (!oldPassword || !newPassword)             return json({ error: 'Current and new passwords are required.' }, 400);
  if (newPassword.length < MIN_PASSWORD_LENGTH) return json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  if (newPassword === oldPassword)              return json({ error: 'New password must be different from the current password.' }, 400);
  if (!env.DB)                                  return json({ error: 'Service unavailable.' }, 500);

  try {
    const row = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    if (!row) return json({ error: 'Not authenticated.' }, 401);

    const valid = await bcrypt.compare(oldPassword, row.password_hash);
    if (!valid) return json({ error: 'Current password is incorrect.' }, 401);

    const newHash = await bcrypt.hash(newPassword, 12);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();

    const currentToken = getCookie(request, SESSION_COOKIE);
    if (currentToken) {
      try { await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').bind(user.id, currentToken).run(); }
      catch (err) { console.error('Session revocation failed:', err); }
    }
    return json({ ok: true });
  } catch (err) {
    console.error('Change-password error:', err);
    return json({ error: 'Could not change password.' }, 500);
  }
}

async function handleForgotPassword(request, env) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const email = isNonEmptyString(data?.email) ? data.email.trim().toLowerCase() : '';
  if (!email) return json({ error: 'Email is required.' }, 400);

  const genericResponse = json({ ok: true, message: 'If an account exists with that email, a reset link has been sent.' });
  if (!env.DB) { console.error('DB binding not set.'); return genericResponse; }

  try {
    const user = await env.DB.prepare('SELECT id, email, name FROM users WHERE email = ?').bind(email).first();
    if (!user) return genericResponse;

    const token     = generateSessionToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_HOURS * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run();

    try { await sendResetEmail(env, user.email, user.name, token); }
    catch (err) { console.error('Reset email send failed:', err); }

    return genericResponse;
  } catch (err) {
    console.error('Forgot-password error:', err);
    return genericResponse;
  }
}

async function handleResetPassword(request, env) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const token       = isNonEmptyString(data?.token)        ? data.token.trim() : '';
  const newPassword = isNonEmptyString(data?.new_password) ? data.new_password : '';

  if (!token || !newPassword)                   return json({ error: 'Reset token and new password are required.' }, 400);
  if (newPassword.length < MIN_PASSWORD_LENGTH) return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  if (!env.DB)                                  return json({ error: 'Reset is unavailable.' }, 500);

  try {
    const reset = await env.DB.prepare('SELECT token, user_id, expires_at, used_at FROM password_resets WHERE token = ?').bind(token).first();
    if (!reset)        return json({ error: 'This reset link is invalid.' }, 400);
    if (reset.used_at) return json({ error: 'This reset link has already been used.' }, 400);
    if (new Date(reset.expires_at) < new Date()) return json({ error: 'This reset link has expired. Please request a new one.' }, 400);

    const newHash = await bcrypt.hash(newPassword, 12);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, reset.user_id).run();
    await env.DB.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token = ?").bind(token).run();

    try { await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(reset.user_id).run(); }
    catch (err) { console.error('Session revocation on reset failed:', err); }

    return json({ ok: true, redirect: '/admin/login' });
  } catch (err) {
    console.error('Reset-password error:', err);
    return json({ error: 'Reset failed.' }, 500);
  }
}

async function sendResetEmail(env, recipientEmail, recipientName, token) {
  if (!env.RESEND_API_KEY) { console.warn('RESEND_API_KEY not set.'); return; }

  const fromAddress = env.INQUIRY_FROM || 'hello@vestafolioco.com';
  const resetLink   = `https://vestafolioco.com/admin/reset-password?token=${encodeURIComponent(token)}`;
  const firstName   = recipientName ? String(recipientName).trim().split(/\s+/)[0] : null;
  const greeting    = firstName ? `Hello, ${esc(firstName)}.` : 'Hello.';
  const safeLink    = esc(resetLink);

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><title>Reset your password</title></head>
<body style="margin:0;padding:0;background-color:#F2EDE3;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F2EDE3;"><tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#F2EDE3;">
<tr><td align="left" style="padding-bottom:32px;"><span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:400;letter-spacing:0.18em;color:#1F2E2A;text-transform:uppercase;">VESTA FOLIO</span></td></tr>
<tr><td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:40px 0 16px 0;"><h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;color:#1F2E2A;">Reset your password.</h1></td></tr>
<tr><td style="padding:0 0 24px 0;"><p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;color:#1F2E2A;">${greeting}</p><p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;color:#1F2E2A;">A password reset was requested for your Vesta Folio account. Use the link below to set a new password. The link expires in 24 hours.</p><p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;color:#4A5C57;">If you didn't request this, you can ignore this email.</p></td></tr>
<tr><td style="padding:0 0 32px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#A8884E;"><a href="${safeLink}" style="display:inline-block;padding:16px 32px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:#1F2E2A;text-decoration:none;">Reset password</a></td></tr></table></td></tr>
<tr><td style="padding:0 0 32px 0;"><p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;color:#4A5C57;">Or paste this link: <span style="color:#1F2E2A;word-break:break-all;">${safeLink}</span></p></td></tr>
<tr><td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 0 0 0;"><p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;color:#4A5C57;">— Vesta Folio</p></td></tr>
</table></td></tr></table></body></html>`;

  const text = `${firstName ? `Hello, ${firstName}.` : 'Hello.'}\n\nA password reset was requested. Use the link below to set a new password. Expires in 24 hours.\n\n${resetLink}\n\nIf you didn't request this, ignore this email.\n\n— Vesta Folio\n`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Vesta Folio <${fromAddress}>`, to: [recipientEmail], subject: 'Reset your password', html, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}


/* ----------------------------------------------------------
   AUTH HELPERS
   ---------------------------------------------------------- */

async function getCurrentUser(request, env) {
  if (!env.DB) return null;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  try {
    const row = await env.DB
      .prepare(`SELECT users.id, users.email, users.role, users.name, sessions.expires_at FROM sessions JOIN users ON sessions.user_id = users.id WHERE sessions.token = ?`)
      .bind(token).first();

    if (!row) return null;
    if (new Date(row.expires_at) < new Date()) {
      try { await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run(); } catch { /* non-blocking */ }
      return null;
    }
    return { id: row.id, email: row.email, role: row.role, name: row.name };
  } catch (err) {
    console.error('Session lookup error:', err);
    return null;
  }
}

function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const c of header.split(';')) {
    const idx = c.indexOf('=');
    if (idx < 0) continue;
    if (c.slice(0, idx).trim() === name) return c.slice(idx + 1).trim();
  }
  return null;
}

function buildSessionCookie(value, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}


/* ----------------------------------------------------------
   RESPONSE HELPERS
   ---------------------------------------------------------- */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin',      ALLOWED_ORIGIN);
  headers.set('Access-Control-Allow-Methods',     'GET, POST, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers',     'Content-Type');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}
