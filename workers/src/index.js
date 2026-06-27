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

    // ── Admin: clients ───────────────────────────────────────
    if (path === '/api/admin/clients') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListClients(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // /api/admin/invite
    if (path === '/api/admin/invite') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleInviteClient(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // /api/admin/invite/resend
    if (path === '/api/admin/invite/resend') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleResendInvite(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // /api/admin/clients/:userId/access/:slug  (revoke access)
    const revokeMatch = path.match(/^\/api\/admin\/clients\/(\d+)\/access\/([^/]+)$/);
    if (revokeMatch) {
      const [, userId, slug] = revokeMatch;
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'DELETE')  return cors(await handleRevokeAccess(request, env, Number(userId), slug));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // ── Portal ────────────────────────────────────────────────
    if (path === '/api/portal/accept-invite') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleAcceptInvite(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/portal/projects') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handlePortalProjects(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const portalProjectMatch = path.match(/^\/api\/portal\/projects\/([^/]+)$/);
    if (portalProjectMatch) {
      const slug = portalProjectMatch[1];
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handlePortalProject(request, env, slug));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const portalDownloadMatch = path.match(/^\/api\/portal\/projects\/([^/]+)\/download$/);
    if (portalDownloadMatch) {
      const slug = portalDownloadMatch[1];
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handlePortalDownload(request, env, slug));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // ── Admin: leads ─────────────────────────────────────────
    if (path === '/api/admin/leads') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListLeads(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const leadMatch = path.match(/^\/api\/admin\/leads\/(\d+)$/);
    if (leadMatch) {
      const id = Number(leadMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleGetLead(request, env, id));
      if (request.method === 'PATCH')   return cors(await handleUpdateLead(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (path === '/api/admin/dashboard') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleDashboard(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // ── Admin: client projects ───────────────────────────────
    if (path === '/api/admin/client-projects') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListClientProjects(request, env));
      if (request.method === 'POST')    return cors(await handleCreateClientProject(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const cpMatch = path.match(/^\/api\/admin\/client-projects\/(\d+)$/);
    if (cpMatch) {
      const id = Number(cpMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleGetClientProject(request, env, id));
      if (request.method === 'PATCH')   return cors(await handleUpdateClientProject(request, env, id));
      if (request.method === 'DELETE')  return cors(await handleDeleteClientProject(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const cpImagesMatch = path.match(/^\/api\/admin\/client-projects\/(\d+)\/images$/);
    if (cpImagesMatch) {
      const id = Number(cpImagesMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleUploadClientImages(request, env, id));
      if (request.method === 'PATCH')   return cors(await handleReorderClientImages(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const cpOriginalsMatch = path.match(/^\/api\/admin\/client-projects\/(\d+)\/originals$/);
    if (cpOriginalsMatch) {
      const id = Number(cpOriginalsMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListClientOriginals(request, env, id));
      if (request.method === 'POST')    return cors(await handleUploadClientOriginal(request, env, id));
      if (request.method === 'DELETE')  return cors(await handleDeleteClientOriginal(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const cpInviteMatch = path.match(/^\/api\/admin\/client-projects\/(\d+)\/invite$/);
    if (cpInviteMatch) {
      const id = Number(cpInviteMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleInviteToClientProject(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const cpClientsMatch = path.match(/^\/api\/admin\/client-projects\/(\d+)\/clients$/);
    if (cpClientsMatch) {
      const id = Number(cpClientsMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListClientProjectClients(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const revokeV2Match = path.match(/^\/api\/admin\/clients\/(\d+)\/access\/cp\/(\d+)$/);
    if (revokeV2Match) {
      const [, userId, projectId] = revokeV2Match;
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'DELETE')  return cors(await handleRevokeClientProjectAccess(request, env, Number(userId), Number(projectId)));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // /api/admin/projects/:slug/originals
    const originalsMatch = path.match(/^\/api\/admin\/projects\/([^/]+)\/originals$/);
    if (originalsMatch) {
      const slug = originalsMatch[1];
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListOriginals(request, env, slug));
      if (request.method === 'POST')    return cors(await handleUploadOriginal(request, env, slug));
      if (request.method === 'DELETE')  return cors(await handleDeleteOriginal(request, env, slug));
      return cors(new Response('Method not allowed', { status: 405 }));
    }


    // ── Admin: team management (super_admin only) ────────────
    if (path === '/api/admin/team') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListTeam(request, env));
      if (request.method === 'POST')    return cors(await handleCreateTeamMember(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const teamMemberMatch = path.match(/^\/api\/admin\/team\/(\d+)$/);
    if (teamMemberMatch) {
      const id = Number(teamMemberMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'DELETE')  return cors(await handleDeleteTeamMember(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // ── Admin: all clients page ───────────────────────────────
    if (path === '/api/admin/all-clients') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListAllClients(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const clientDetailMatch = path.match(/^\/api\/admin\/all-clients\/(\d+)$/);
    if (clientDetailMatch) {
      const id = Number(clientDetailMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleGetAllClientDetail(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    // ── Admin: client project videos ─────────────────────────
    const cpVideosMatch = path.match(/^\/api\/admin\/client-projects\/(\d+)\/videos$/);
    if (cpVideosMatch) {
      const id = Number(cpVideosMatch[1]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleListClientProjectVideos(request, env, id));
      if (request.method === 'POST')    return cors(await handleAddClientProjectVideo(request, env, id));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    const cpVideoDelMatch = path.match(/^\/api\/admin\/client-projects\/(\d+)\/videos\/(\d+)$/);
    if (cpVideoDelMatch) {
      const id = Number(cpVideoDelMatch[1]);
      const vid = Number(cpVideoDelMatch[2]);
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'DELETE')  return cors(await handleDeleteClientProjectVideo(request, env, id, vid));
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
  if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return { user: null, response: json({ error: 'Not authorized.' }, 401) };
  return { user, response: null };
}

async function requireSuperAdmin(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user || user.role !== 'super_admin') return { user: null, response: json({ error: 'Not authorized.' }, 401) };
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
      youtube_id:  data.youtube_id  !== undefined ? (data.youtube_id || '') : (existing.youtube_id || ''),
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
   ADMIN: ORIGINALS (private R2 bucket)
   ---------------------------------------------------------- */

// GET /api/admin/projects/:slug/originals — list files
async function handleListOriginals(request, env, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.ORIGINALS) return json({ error: 'Originals storage not configured.' }, 500);

  try {
    const listed = await env.ORIGINALS.list({ prefix: `originals/${slug}/` });
    const files  = (listed.objects || [])
      .filter(o => !o.key.endsWith('/'))
      .map(o => ({
        key:  o.key,
        name: o.key.split('/').pop(),
        size: o.size,
      }));
    return json({ ok: true, files });
  } catch (err) {
    console.error('List originals error:', err);
    return json({ error: 'Could not list originals.' }, 500);
  }
}

// POST /api/admin/projects/:slug/originals — upload one file (multipart/form-data)
async function handleUploadOriginal(request, env, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.ORIGINALS) return json({ error: 'Originals storage not configured.' }, 500);

  try {
    const formData = await request.formData();
    const file     = formData.get('file');
    if (!file) return json({ error: 'No file provided.' }, 400);

    const filename = file.name || 'upload';
    // Sanitize filename: strip path components, allow only safe chars
    const safeName = filename.split(/[\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_');
    const key      = `originals/${slug}/${safeName}`;

    const bytes = await file.arrayBuffer();
    await env.ORIGINALS.put(key, bytes, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' },
    });

    return json({ ok: true, key, name: safeName });
  } catch (err) {
    console.error('Upload original error:', err);
    return json({ error: 'Could not upload file.' }, 500);
  }
}

// DELETE /api/admin/projects/:slug/originals — delete one file
// Body: { key }
async function handleDeleteOriginal(request, env, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.ORIGINALS) return json({ error: 'Originals storage not configured.' }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const key = data?.key || '';
  // Only allow deleting keys that belong to this slug
  if (!key || !key.startsWith(`originals/${slug}/`)) {
    return json({ error: 'Invalid key.' }, 400);
  }

  try {
    await env.ORIGINALS.delete(key);
    return json({ ok: true });
  } catch (err) {
    console.error('Delete original error:', err);
    return json({ error: 'Could not delete file.' }, 500);
  }
}


/* ----------------------------------------------------------
   ADMIN: CLIENT INVITE & ACCESS MANAGEMENT
   ---------------------------------------------------------- */

const INVITE_DAYS = 7;

// POST /api/admin/invite
// Body: { email, name, project_slugs: [slug, ...] }
// Creates client user if not exists, grants project access, sends invite email.
async function handleInviteClient(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const email = isNonEmptyString(data?.email) ? data.email.trim().toLowerCase() : '';
  const name  = isNonEmptyString(data?.name)  ? data.name.trim() : '';
  const slugs = Array.isArray(data?.project_slugs) ? data.project_slugs.filter(s => isNonEmptyString(s)) : [];

  if (!email)         return json({ error: 'Email is required.' }, 400);
  if (!isEmail(email)) return json({ error: 'A valid email is required.' }, 400);
  if (slugs.length === 0) return json({ error: 'At least one project must be selected.' }, 400);
  if (!env.DB)        return json({ error: 'Service unavailable.' }, 500);

  try {
    // Find or create client user
    let user = await env.DB
      .prepare('SELECT id, email, name, role FROM users WHERE email = ?')
      .bind(email).first();

    if (user && user.role === 'admin') {
      return json({ error: 'This email belongs to a studio admin account and cannot be invited as a client.' }, 400);
    }

    if (!user) {
      // Create new client user with a random placeholder password (they set their own via invite link)
      const placeholderHash = await bcrypt.hash(generateSessionToken(), 12);
      const result = await env.DB
        .prepare('INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)')
        .bind(email, placeholderHash, 'client', name || null)
        .run();
      user = { id: result.meta.last_row_id, email, name: name || null };
    } else if (name && !user.name) {
      // Update name if provided and not already set
      await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
    }

    // Grant project access (upsert)
    for (const slug of slugs) {
      await env.DB
        .prepare('INSERT OR IGNORE INTO client_project_access (user_id, project_slug) VALUES (?, ?)')
        .bind(user.id, slug).run();
    }

    // Generate invite token (reuses password_resets table — client sets password via this link)
    const token     = generateSessionToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Invalidate any existing unused tokens for this user
    await env.DB
      .prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`)
      .bind(user.id).run();

    await env.DB
      .prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, user.id, expiresAt).run();

    // Send invite email
    try {
      await sendInviteEmail(env, user.email, user.name, token, slugs);
    } catch (err) {
      console.error('Invite email send failed:', err);
      // Don't fail the request — access is granted, they can resend
    }

    return json({ ok: true, user_id: user.id });
  } catch (err) {
    console.error('Invite client error:', err);
    return json({ error: 'Could not send invite.' }, 500);
  }
}

// POST /api/admin/invite/resend
// Body: { user_id }
// Invalidates old token, generates new one, resends email.
async function handleResendInvite(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const userId = Number(data?.user_id);
  if (!userId) return json({ error: 'user_id is required.' }, 400);
  if (!env.DB)  return json({ error: 'Service unavailable.' }, 500);

  try {
    const user = await env.DB
      .prepare('SELECT id, email, name FROM users WHERE id = ? AND role = ?')
      .bind(userId, 'client').first();
    if (!user) return json({ error: 'Client not found.' }, 404);

    // Get their project slugs
    const accessRows = await env.DB
      .prepare('SELECT project_slug FROM client_project_access WHERE user_id = ?')
      .bind(userId).all();
    const slugs = (accessRows.results || []).map(r => r.project_slug);

    // Invalidate old tokens
    await env.DB
      .prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`)
      .bind(userId).run();

    // New token
    const token     = generateSessionToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB
      .prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, userId, expiresAt).run();

    try {
      await sendInviteEmail(env, user.email, user.name, token, slugs);
    } catch (err) {
      console.error('Resend invite email failed:', err);
      return json({ error: 'Could not send email. Try again.' }, 500);
    }

    return json({ ok: true });
  } catch (err) {
    console.error('Resend invite error:', err);
    return json({ error: 'Could not resend invite.' }, 500);
  }
}

// GET /api/admin/clients
// Returns all client users with their project access.
async function handleListClients(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  try {
    const usersRows = await env.DB
      .prepare('SELECT id, email, name, created_at, last_login_at FROM users WHERE role = ? ORDER BY created_at DESC')
      .bind('client').all();

    const users = usersRows.results || [];

    // Get project access for all clients in one query
    const accessRows = await env.DB
      .prepare('SELECT user_id, project_slug, granted_at FROM client_project_access ORDER BY granted_at DESC')
      .all();
    const accessByUser = {};
    for (const row of (accessRows.results || [])) {
      if (!accessByUser[row.user_id]) accessByUser[row.user_id] = [];
      accessByUser[row.user_id].push({ slug: row.project_slug, granted_at: row.granted_at });
    }

    const clients = users.map(u => ({
      id:            u.id,
      email:         u.email,
      name:          u.name,
      created_at:    u.created_at,
      last_login_at: u.last_login_at,
      projects:      accessByUser[u.id] || [],
    }));

    return json({ ok: true, clients });
  } catch (err) {
    console.error('List clients error:', err);
    return json({ error: 'Could not load clients.' }, 500);
  }
}

// DELETE /api/admin/clients/:userId/access/:slug
async function handleRevokeAccess(request, env, userId, slug) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  try {
    await env.DB
      .prepare('DELETE FROM client_project_access WHERE user_id = ? AND project_slug = ?')
      .bind(userId, slug).run();
    return json({ ok: true });
  } catch (err) {
    console.error('Revoke access error:', err);
    return json({ error: 'Could not revoke access.' }, 500);
  }
}


/* ----------------------------------------------------------
   PORTAL: CLIENT-FACING ENDPOINTS
   ---------------------------------------------------------- */

// POST /api/portal/accept-invite
// Body: { token, password }
// Validates invite token, sets password, issues session, redirects to /portal
async function handleAcceptInvite(request, env) {
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const token    = isNonEmptyString(data?.token)    ? data.token.trim() : '';
  const password = isNonEmptyString(data?.password) ? data.password     : '';

  if (!token || !password)                   return json({ error: 'Token and password are required.' }, 400);
  if (password.length < MIN_PASSWORD_LENGTH) return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  if (!env.DB)                               return json({ error: 'Service unavailable.' }, 500);

  try {
    const reset = await env.DB
      .prepare('SELECT token, user_id, expires_at, used_at FROM password_resets WHERE token = ?')
      .bind(token).first();

    if (!reset)        return json({ error: 'This invite link is invalid.' }, 400);
    if (reset.used_at) return json({ error: 'This invite link has already been used.' }, 400);
    if (new Date(reset.expires_at) < new Date()) {
      return json({ error: 'This invite link has expired. Ask Vesta Folio to send a new one.' }, 400);
    }

    // Verify user is a client
    const user = await env.DB
      .prepare('SELECT id, email, role FROM users WHERE id = ?')
      .bind(reset.user_id).first();
    if (!user || user.role !== 'client') return json({ error: 'This invite link is invalid.' }, 400);

    // Set password
    const newHash = await bcrypt.hash(password, 12);
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run();
    await env.DB.prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token = ?").bind(token).run();

    // Issue session immediately — no need to make them log in again
    const sessionToken = generateSessionToken();
    const expiresAt    = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB
      .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionToken, user.id, expiresAt).run();

    const cookie = buildSessionCookie(sessionToken, SESSION_DAYS * 24 * 60 * 60);

    return new Response(JSON.stringify({ ok: true, redirect: '/portal' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
    });
  } catch (err) {
    console.error('Accept invite error:', err);
    return json({ error: 'Could not accept invite.' }, 500);
  }
}

// Require client (or admin) session
async function requireClient(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return { user: null, response: json({ error: 'Not authenticated.' }, 401) };
  if (user.role !== 'client' && user.role !== 'admin') {
    return { user: null, response: json({ error: 'Not authorized.' }, 403) };
  }
  return { user, response: null };
}

// GET /api/portal/projects — reads from D1 client_projects
async function handlePortalProjects(request, env) {
  const { user, response } = await requireClient(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  try {
    const rows = await env.DB
      .prepare(`SELECT cp.* FROM client_projects cp
                JOIN client_project_access_v2 cpa ON cpa.client_project_id = cp.id
                WHERE cpa.user_id = ?
                ORDER BY cp.created_at DESC`)
      .bind(user.id).all();

    const projects = (rows.results || []).map(r => parseClientProject(r));
    return json({ ok: true, projects });
  } catch (err) {
    console.error('Portal projects error:', err);
    return json({ error: 'Could not load projects.' }, 500);
  }
}

// GET /api/portal/projects/:id (id is numeric)
async function handlePortalProject(request, env, slug) {
  const { user, response } = await requireClient(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  // slug param may be numeric id or slug string
  const isId = /^\d+$/.test(slug);

  try {
    const col    = isId ? 'cp.id' : 'cp.slug';
    const val    = isId ? Number(slug) : slug;
    const access = await env.DB
      .prepare(`SELECT cp.* FROM client_projects cp
                JOIN client_project_access_v2 cpa ON cpa.client_project_id = cp.id
                WHERE ${col} = ? AND cpa.user_id = ?`)
      .bind(val, user.id).first();

    if (!access) return json({ error: 'Project not found.' }, 404);
    const p = parseClientProject(access);
    // Attach videos
    const vRows = await env.DB.prepare(
      'SELECT id, platform, video_id, title FROM client_project_videos WHERE client_project_id = ? ORDER BY created_at ASC'
    ).bind(access.id).all();
    p.videos = vRows.results || [];
    return json({ ok: true, project: p });
  } catch (err) {
    console.error('Portal project error:', err);
    return json({ error: 'Could not load project.' }, 500);
  }
}

// GET /api/portal/projects/:id/download
async function handlePortalDownload(request, env, slug) {
  const { user, response } = await requireClient(request, env);
  if (response) return response;
  if (!env.ORIGINALS) return json({ error: 'Originals storage not configured.' }, 500);
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  const isId = /^\d+$/.test(slug);
  try {
    const col    = isId ? 'cp.id' : 'cp.slug';
    const val    = isId ? Number(slug) : slug;
    const access = await env.DB
      .prepare(`SELECT cp.id, cp.slug FROM client_projects cp
                JOIN client_project_access_v2 cpa ON cpa.client_project_id = cp.id
                WHERE ${col} = ? AND cpa.user_id = ?`)
      .bind(val, user.id).first();

    if (!access) return json({ error: 'Not authorized.' }, 403);

    const listed = await env.ORIGINALS.list({ prefix: `originals/${access.slug}/` });
    const keys   = (listed.objects || []).map(o => o.key).filter(k => !k.endsWith('/'));

    if (keys.length === 0) return json({ error: 'No originals available yet.' }, 404);

    const files = [];
    for (const key of keys) {
      const obj = await env.ORIGINALS.get(key);
      if (!obj) continue;
      files.push({ filename: key.split('/').pop(), bytes: await obj.arrayBuffer() });
    }

    const zipBytes = buildZip(files);
    return new Response(zipBytes, {
      status: 200,
      headers: {
        'Content-Type':        'application/zip',
        'Content-Disposition': `attachment; filename="${access.slug}-originals.zip"`,
        'Content-Length':      String(zipBytes.byteLength),
      },
    });
  } catch (err) {
    console.error('Portal download error:', err);
    return json({ error: 'Could not generate download.' }, 500);
  }
}


/* ----------------------------------------------------------
   ADMIN: DASHBOARD
   ---------------------------------------------------------- */

async function handleDashboard(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  try {
    const now       = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [inquiriesMonth, unassigned, activeProjects, deliveredMonth, recentLeads, activeProjectsList] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as count FROM inquiries WHERE received_at >= ?`).bind(monthStart).first(),
      env.DB.prepare(`SELECT COUNT(*) as count FROM inquiries WHERE status = 'Unassigned'`).first(),
      env.DB.prepare(`SELECT COUNT(*) as count FROM client_projects cp JOIN client_project_access_v2 cpa ON cpa.client_project_id = cp.id WHERE cp.id IN (SELECT DISTINCT client_project_id FROM client_project_access_v2)`).first(),
      env.DB.prepare(`SELECT COUNT(*) as count FROM inquiries WHERE status = 'Delivered' AND received_at >= ?`).bind(monthStart).first(),
      env.DB.prepare(`SELECT id, name, email, property_address, status, received_at FROM inquiries ORDER BY received_at DESC LIMIT 5`).all(),
      env.DB.prepare(`SELECT id, title, slug, status, updated_at FROM client_projects WHERE status NOT IN ('Delivered','Archived') ORDER BY updated_at DESC LIMIT 5`).all(),
    ]);

    return json({
      ok: true,
      stats: {
        inquiries_this_month: inquiriesMonth?.count || 0,
        unassigned_leads:     unassigned?.count || 0,
        active_projects:      activeProjects?.count || 0,
        delivered_this_month: deliveredMonth?.count || 0,
      },
      recent_leads:    recentLeads.results || [],
      active_client_projects: (activeProjectsList.results || []).map(p => ({ id: p.id, title: p.title, slug: p.slug, status: p.status || 'Booked', updated_at: p.updated_at })),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return json({ error: 'Could not load dashboard.' }, 500);
  }
}


/* ----------------------------------------------------------
   ADMIN: LEADS
   ---------------------------------------------------------- */

const LEAD_STATUSES = ['Unassigned', 'Contacted', 'Booked', 'Filming', 'Editing', 'Delivered', 'Archived'];

// GET /api/admin/leads?status=&search=&limit=&offset=
async function handleListLeads(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  const url    = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const search = url.searchParams.get('search') || '';
  const limit  = Math.min(Number(url.searchParams.get('limit') || 50), 100);
  const offset = Number(url.searchParams.get('offset') || 0);

  try {
    let where  = '1=1';
    const binds = [];

    if (status && LEAD_STATUSES.includes(status)) {
      where += ' AND status = ?';
      binds.push(status);
    }
    if (search) {
      where += ' AND (name LIKE ? OR email LIKE ? OR property_address LIKE ?)';
      const q = `%${search}%`;
      binds.push(q, q, q);
    }

    const rows = await env.DB
      .prepare(`SELECT id, name, email, brokerage, property_address, listing_date, services, status, received_at, sq_ft, bedrooms, bathrooms, listing_price, client_project_id FROM inquiries WHERE ${where} ORDER BY received_at DESC LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset).all();

    const total = await env.DB
      .prepare(`SELECT COUNT(*) as count FROM inquiries WHERE ${where}`)
      .bind(...binds).first();

    return json({ ok: true, leads: rows.results || [], total: total?.count || 0 });
  } catch (err) {
    console.error('List leads error:', err);
    return json({ error: 'Could not load leads.' }, 500);
  }
}

// GET /api/admin/leads/:id
async function handleGetLead(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  try {
    const row = await env.DB
      .prepare(`SELECT * FROM inquiries WHERE id = ?`)
      .bind(id).first();
    if (!row) return json({ error: 'Lead not found.' }, 404);
    return json({ ok: true, lead: row });
  } catch (err) {
    console.error('Get lead error:', err);
    return json({ error: 'Could not load lead.' }, 500);
  }
}

// PATCH /api/admin/leads/:id
// Body: { status?, notes_internal?, client_project_id? }
async function handleUpdateLead(request, env, id) {
  const { response, user } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const updates = [];
  const binds   = [];

  if (data.status !== undefined) {
    if (!LEAD_STATUSES.includes(data.status)) return json({ error: 'Invalid status.' }, 400);
    updates.push('status = ?'); binds.push(data.status);
  }
  if (data.notes_internal !== undefined) {
    updates.push('notes_internal = ?'); binds.push(data.notes_internal || null);
  }
  if (data.client_project_id !== undefined) {
    updates.push('client_project_id = ?'); binds.push(data.client_project_id || null);
  }

  // Stamp audit fields
  updates.push('last_edited_by = ?'); binds.push(user ? user.id : null);
  updates.push("last_edited_at = datetime('now')");

  if (updates.length === 0) return json({ error: 'Nothing to update.' }, 400);

  binds.push(id);
  try {
    await env.DB.prepare(`UPDATE inquiries SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();
    const updated = await env.DB.prepare('SELECT * FROM inquiries WHERE id = ?').bind(id).first();
    return json({ ok: true, lead: updated });
  } catch (err) {
    console.error('Update lead error:', err);
    return json({ error: 'Could not update lead.' }, 500);
  }
}


/* ----------------------------------------------------------
   ADMIN: CLIENT PROJECT CRUD (D1-backed)
   ---------------------------------------------------------- */

function parseClientProject(row) {
  return {
    id:          row.id,
    slug:        row.slug,
    title:       row.title,
    location:    row.location,
    year:        row.year,
    description: row.description,
    youtube_id:  row.youtube_id || '',
    services:    row.services ? row.services.split(',') : [],
    hero_image:  row.hero_image || '',
    gallery:     row.gallery ? JSON.parse(row.gallery) : [],
    created_at:  row.created_at,
    updated_at:  row.updated_at,
    status:      row.status || 'Booked',
    last_edited_by: row.last_edited_by || null,
    last_edited_at: row.last_edited_at || null,
  };
}

function validateClientProjectPayload(data, requireAll) {
  if (requireAll) {
    if (!isNonEmptyString(data.title))       return { error: 'Title is required.' };
    if (!isNonEmptyString(data.slug))        return { error: 'Slug is required.' };
    if (!isNonEmptyString(data.location))    return { error: 'Location is required.' };
    if (!data.year || isNaN(Number(data.year))) return { error: 'Year is required.' };
    if (!isNonEmptyString(data.description)) return { error: 'Description is required.' };
  }
  if (data.slug !== undefined) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) return { error: 'Slug must be lowercase letters, numbers, and hyphens only.' };
    if (data.slug.length > 80) return { error: 'Slug is too long.' };
  }
  if (data.youtube_id !== undefined && data.youtube_id !== '' &&
      (typeof data.youtube_id !== 'string' || data.youtube_id.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(data.youtube_id))) {
    return { error: 'YouTube ID is invalid.' };
  }
  if (data.services !== undefined) {
    if (!Array.isArray(data.services)) return { error: 'Services must be an array.' };
    const allowed = new Set(['hdr', 'cinematic', 'staging']);
    if (data.services.some(s => !allowed.has(s))) return { error: 'Unknown service value.' };
  }
  return { error: null };
}

// GET /api/admin/client-projects
async function handleListClientProjects(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    const rows = await env.DB.prepare('SELECT * FROM client_projects ORDER BY created_at DESC').all();
    return json({ ok: true, projects: (rows.results || []).map(parseClientProject) });
  } catch (err) {
    console.error('List client projects error:', err);
    return json({ error: 'Could not load projects.' }, 500);
  }
}

// POST /api/admin/client-projects
async function handleCreateClientProject(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const v = validateClientProjectPayload(data, true);
  if (v.error) return json({ error: v.error }, 400);

  try {
    const existing = await env.DB.prepare('SELECT id FROM client_projects WHERE slug = ?').bind(data.slug).first();
    if (existing) return json({ error: 'A project with that slug already exists.' }, 409);

    const services = Array.isArray(data.services) ? data.services.join(',') : '';
    const result   = await env.DB
      .prepare('INSERT INTO client_projects (slug, title, location, year, description, youtube_id, services, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(data.slug, data.title.trim(), data.location.trim(), Number(data.year), data.description.trim(), data.youtube_id || '', services, 'Booked')
      .run();

    const project = await env.DB.prepare('SELECT * FROM client_projects WHERE id = ?').bind(result.meta.last_row_id).first();
    return json({ ok: true, project: parseClientProject(project) }, 201);
  } catch (err) {
    console.error('Create client project error:', err);
    return json({ error: 'Could not create project.' }, 500);
  }
}

// GET /api/admin/client-projects/:id
async function handleGetClientProject(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    const row = await env.DB.prepare('SELECT * FROM client_projects WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'Project not found.' }, 404);
    return json({ ok: true, project: parseClientProject(row) });
  } catch (err) {
    console.error('Get client project error:', err);
    return json({ error: 'Could not load project.' }, 500);
  }
}

// PATCH /api/admin/client-projects/:id
async function handleUpdateClientProject(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const v = validateClientProjectPayload(data, false);
  if (v.error) return json({ error: v.error }, 400);

  try {
    const existing = await env.DB.prepare('SELECT * FROM client_projects WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Project not found.' }, 404);

    if (data.slug && data.slug !== existing.slug) {
      const collision = await env.DB.prepare('SELECT id FROM client_projects WHERE slug = ? AND id != ?').bind(data.slug, id).first();
      if (collision) return json({ error: 'A project with that slug already exists.' }, 409);
    }

    const CP_STATUSES = ['Booked', 'Filming', 'Editing', 'Delivered', 'Archived'];
    if (data.status !== undefined && !CP_STATUSES.includes(data.status)) {
      return json({ error: 'Invalid status.' }, 400);
    }

    const slug        = data.slug        !== undefined ? data.slug                : existing.slug;
    const title       = data.title       !== undefined ? data.title.trim()        : existing.title;
    const location    = data.location    !== undefined ? data.location.trim()     : existing.location;
    const year        = data.year        !== undefined ? Number(data.year)        : existing.year;
    const description = data.description !== undefined ? data.description.trim()  : existing.description;
    const youtube_id  = data.youtube_id  !== undefined ? (data.youtube_id || '')  : (existing.youtube_id || '');
    const services    = data.services    !== undefined ? data.services.join(',')  : (existing.services || '');
    const status      = data.status      !== undefined ? data.status              : (existing.status || 'Booked');
    const last_edited_by = data.last_edited_by !== undefined ? data.last_edited_by : existing.last_edited_by;

    await env.DB
      .prepare(`UPDATE client_projects SET slug=?, title=?, location=?, year=?, description=?, youtube_id=?, services=?, status=?, last_edited_by=?, last_edited_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
      .bind(slug, title, location, year, description, youtube_id, services, status, last_edited_by || null, id).run();

    const updated = await env.DB.prepare('SELECT * FROM client_projects WHERE id = ?').bind(id).first();
    return json({ ok: true, project: parseClientProject(updated) });
  } catch (err) {
    console.error('Update client project error:', err);
    return json({ error: 'Could not update project.' }, 500);
  }
}

// DELETE /api/admin/client-projects/:id
async function handleDeleteClientProject(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    await env.DB.prepare('DELETE FROM client_projects WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (err) {
    console.error('Delete client project error:', err);
    return json({ error: 'Could not delete project.' }, 500);
  }
}

// POST /api/admin/client-projects/:id/images
async function handleUploadClientImages(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.IMAGES) return json({ error: 'Image storage not configured.' }, 500);
  if (!env.DB)    return json({ error: 'Service unavailable.' }, 500);

  const project = await env.DB.prepare('SELECT slug FROM client_projects WHERE id = ?').bind(id).first();
  if (!project) return json({ error: 'Project not found.' }, 404);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const images = data.images;
  if (!Array.isArray(images) || images.length === 0) return json({ error: 'No images provided.' }, 400);
  if (images.length > 20) return json({ error: 'Maximum 20 images per upload.' }, 400);

  const imagesBaseUrl = env.IMAGES_BASE_URL || 'https://images.vestafolioco.com';
  const uploadedUrls  = [];

  for (const img of images) {
    if (!img.data || !img.filename || !/^(hero|[0-9]{2})\.webp$/.test(img.filename)) {
      return json({ error: `Invalid image entry.` }, 400);
    }
    const key    = `client-projects/${project.slug}/${img.filename}`;
    const binary = base64ToUint8Array(img.data);
    await env.IMAGES.put(key, binary, { httpMetadata: { contentType: 'image/webp' } });
    uploadedUrls.push({ filename: img.filename, url: `${imagesBaseUrl}/${key}` });
  }

  const heroEntry    = uploadedUrls.find(u => u.filename === 'hero.webp');
  const galleryEntries = uploadedUrls.filter(u => u.filename !== 'hero.webp').sort((a,b) => a.filename.localeCompare(b.filename));

  const existingRow = await env.DB.prepare('SELECT hero_image, gallery FROM client_projects WHERE id = ?').bind(id).first();
  const heroImage   = heroEntry ? heroEntry.url : (existingRow?.hero_image || '');
  const gallery     = galleryEntries.length > 0 ? galleryEntries.map(u => u.url) : (existingRow?.gallery ? JSON.parse(existingRow.gallery) : []);

  await env.DB
    .prepare(`UPDATE client_projects SET hero_image=?, gallery=?, updated_at=datetime('now') WHERE id=?`)
    .bind(heroImage, JSON.stringify(gallery), id).run();

  return json({ ok: true, hero_image: heroImage, gallery, uploaded: uploadedUrls.length });
}

// PATCH /api/admin/client-projects/:id/images — reorder/delete
async function handleReorderClientImages(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const heroImage = typeof data.hero_image === 'string' ? data.hero_image.trim() : '';
  const gallery   = Array.isArray(data.gallery) ? data.gallery.filter(u => typeof u === 'string') : [];

  try {
    await env.DB
      .prepare(`UPDATE client_projects SET hero_image=?, gallery=?, updated_at=datetime('now') WHERE id=?`)
      .bind(heroImage, JSON.stringify(gallery), id).run();
    return json({ ok: true, hero_image: heroImage, gallery });
  } catch (err) {
    console.error('Reorder client images error:', err);
    return json({ error: 'Could not update image order.' }, 500);
  }
}

// GET /api/admin/client-projects/:id/originals
async function handleListClientOriginals(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.ORIGINALS || !env.DB) return json({ error: 'Storage not configured.' }, 500);
  const project = await env.DB.prepare('SELECT slug FROM client_projects WHERE id = ?').bind(id).first();
  if (!project) return json({ error: 'Project not found.' }, 404);
  try {
    const listed = await env.ORIGINALS.list({ prefix: `originals/${project.slug}/` });
    const files  = (listed.objects || []).filter(o => !o.key.endsWith('/')).map(o => ({ key: o.key, name: o.key.split('/').pop(), size: o.size }));
    return json({ ok: true, files });
  } catch (err) {
    console.error('List client originals error:', err);
    return json({ error: 'Could not list originals.' }, 500);
  }
}

// POST /api/admin/client-projects/:id/originals
async function handleUploadClientOriginal(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.ORIGINALS || !env.DB) return json({ error: 'Storage not configured.' }, 500);
  const project = await env.DB.prepare('SELECT slug FROM client_projects WHERE id = ?').bind(id).first();
  if (!project) return json({ error: 'Project not found.' }, 404);
  try {
    const formData = await request.formData();
    const file     = formData.get('file');
    if (!file) return json({ error: 'No file provided.' }, 400);
    const safeName = (file.name || 'upload').split(/[/\]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_');
    const key      = `originals/${project.slug}/${safeName}`;
    await env.ORIGINALS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
    return json({ ok: true, key, name: safeName });
  } catch (err) {
    console.error('Upload client original error:', err);
    return json({ error: 'Could not upload file.' }, 500);
  }
}

// DELETE /api/admin/client-projects/:id/originals
async function handleDeleteClientOriginal(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.ORIGINALS || !env.DB) return json({ error: 'Storage not configured.' }, 500);
  const project = await env.DB.prepare('SELECT slug FROM client_projects WHERE id = ?').bind(id).first();
  if (!project) return json({ error: 'Project not found.' }, 404);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const key = data?.key || '';
  if (!key || !key.startsWith(`originals/${project.slug}/`)) return json({ error: 'Invalid key.' }, 400);
  try {
    await env.ORIGINALS.delete(key);
    return json({ ok: true });
  } catch (err) {
    console.error('Delete client original error:', err);
    return json({ error: 'Could not delete file.' }, 500);
  }
}

// POST /api/admin/client-projects/:id/invite
async function handleInviteToClientProject(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }

  const email = isNonEmptyString(data?.email) ? data.email.trim().toLowerCase() : '';
  const name  = isNonEmptyString(data?.name)  ? data.name.trim() : '';

  if (!email || !isEmail(email)) return json({ error: 'A valid email is required.' }, 400);

  const project = await env.DB.prepare('SELECT id, slug, title FROM client_projects WHERE id = ?').bind(id).first();
  if (!project) return json({ error: 'Project not found.' }, 404);

  try {
    let user = await env.DB.prepare('SELECT id, email, name, role FROM users WHERE email = ?').bind(email).first();
    if (user && user.role === 'admin') {
      return json({ error: 'This email belongs to a studio admin account and cannot be invited as a client.' }, 400);
    }
    if (!user) {
      const ph     = await bcrypt.hash(generateSessionToken(), 12);
      const result = await env.DB.prepare('INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)').bind(email, ph, 'client', name || null).run();
      user = { id: result.meta.last_row_id, email, name: name || null };
    } else if (name && !user.name) {
      await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, user.id).run();
    }

    await env.DB.prepare('INSERT OR IGNORE INTO client_project_access_v2 (user_id, client_project_id) VALUES (?, ?)').bind(user.id, id).run();

    // Invalidate old tokens + generate new
    await env.DB.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`).bind(user.id).run();
    const token     = generateSessionToken();
    const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run();

    try { await sendClientProjectInviteEmail(env, user.email, user.name, token, project.title); }
    catch (err) { console.error('Client project invite email failed:', err); }

    return json({ ok: true, user_id: user.id });
  } catch (err) {
    console.error('Invite to client project error:', err);
    return json({ error: 'Could not send invite.' }, 500);
  }
}

// GET /api/admin/client-projects/:id/clients
async function handleListClientProjectClients(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    const rows = await env.DB
      .prepare(`SELECT u.id, u.email, u.name, u.last_login_at, cpa.granted_at
                FROM client_project_access_v2 cpa
                JOIN users u ON u.id = cpa.user_id
                WHERE cpa.client_project_id = ?
                ORDER BY cpa.granted_at DESC`)
      .bind(id).all();
    return json({ ok: true, clients: rows.results || [] });
  } catch (err) {
    console.error('List project clients error:', err);
    return json({ error: 'Could not load clients.' }, 500);
  }
}

// DELETE /api/admin/clients/:userId/access/cp/:projectId
async function handleRevokeClientProjectAccess(request, env, userId, projectId) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    await env.DB.prepare('DELETE FROM client_project_access_v2 WHERE user_id = ? AND client_project_id = ?').bind(userId, projectId).run();
    return json({ ok: true });
  } catch (err) {
    console.error('Revoke client project access error:', err);
    return json({ error: 'Could not revoke access.' }, 500);
  }
}

async function sendClientProjectInviteEmail(env, recipientEmail, recipientName, token, projectTitle) {
  if (!env.RESEND_API_KEY) { console.warn('RESEND_API_KEY not set.'); return; }
  const fromAddress = env.INQUIRY_FROM || 'hello@vestafolioco.com';
  const inviteLink  = `https://vestafolioco.com/portal/accept-invite?token=${encodeURIComponent(token)}`;
  const firstName   = recipientName ? String(recipientName).trim().split(/\s+/)[0] : null;
  const greeting    = firstName ? `Hello, ${esc(firstName)}.` : 'Hello.';
  const safeLink    = esc(inviteLink);
  const safeTitle   = esc(projectTitle);

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><title>Your project gallery is ready</title></head>
<body style="margin:0;padding:0;background-color:#F2EDE3;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F2EDE3;"><tr><td align="center" style="padding:48px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#F2EDE3;">
<tr><td style="padding-bottom:32px;"><span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:400;letter-spacing:0.18em;color:#1F2E2A;text-transform:uppercase;">VESTA FOLIO</span></td></tr>
<tr><td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:40px 0 16px 0;"><h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;color:#1F2E2A;">Your gallery is ready.</h1></td></tr>
<tr><td style="padding:0 0 32px 0;">
<p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;color:#1F2E2A;">${greeting}</p>
<p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;color:#1F2E2A;">Your project <strong>${safeTitle}</strong> is ready to view. Use the link below to set your password and access your gallery.</p>
<p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:15px;color:#4A5C57;">The link expires in ${INVITE_DAYS} days.</p>
</td></tr>
<tr><td style="padding:0 0 32px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="background-color:#A8884E;"><a href="${safeLink}" style="display:inline-block;padding:16px 32px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:#1F2E2A;text-decoration:none;">Access your gallery</a></td></tr></table></td></tr>
<tr><td style="padding:0 0 32px 0;"><p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;color:#4A5C57;">Or paste this link:<br/><span style="color:#1F2E2A;word-break:break-all;">${safeLink}</span></p></td></tr>
<tr><td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:24px 0 0 0;"><p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;color:#4A5C57;">— Vesta Folio<br/>vestafolioco.com · Los Angeles</p></td></tr>
</table></td></tr></table></body></html>`;

  const text = `${greeting}

Your project "${projectTitle}" is ready to view. Use the link below to set your password and access your gallery.

${inviteLink}

The link expires in ${INVITE_DAYS} days.

— Vesta Folio
vestafolioco.com · Los Angeles
`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `Vesta Folio <${fromAddress}>`, to: [recipientEmail], subject: `Your gallery is ready — ${projectTitle}`, html, text }),
  });
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`Resend error ${res.status}: ${b}`); }
}


/* ----------------------------------------------------------
   ZIP BUILDER
   Minimal ZIP implementation — no compression (stored),
   suitable for already-compressed image files (JPEG/WebP).
   Handles files up to ~128MB total (Workers limit).
   ---------------------------------------------------------- */

function buildZip(files) {
  const encoder    = new TextEncoder();
  const localHeaders  = [];
  const centralDir    = [];
  let offset = 0;

  for (const { filename, bytes } of files) {
    const nameBytes = encoder.encode(filename);
    const crc       = crc32(bytes);
    const size      = bytes.byteLength;

    // Local file header
    const local = new Uint8Array(30 + nameBytes.length);
    const dv    = new DataView(local.buffer);
    dv.setUint32(0,  0x04034b50, true); // signature
    dv.setUint16(4,  20,         true); // version needed
    dv.setUint16(6,  0,          true); // flags
    dv.setUint16(8,  0,          true); // compression: stored
    dv.setUint16(10, 0,          true); // mod time
    dv.setUint16(12, 0,          true); // mod date
    dv.setUint32(14, crc,        true); // crc-32
    dv.setUint32(18, size,       true); // compressed size
    dv.setUint32(22, size,       true); // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0,          true); // extra field length
    local.set(nameBytes, 30);

    // Central directory entry
    const central = new Uint8Array(46 + nameBytes.length);
    const cdv     = new DataView(central.buffer);
    cdv.setUint32(0,  0x02014b50, true); // signature
    cdv.setUint16(4,  20,         true); // version made by
    cdv.setUint16(6,  20,         true); // version needed
    cdv.setUint16(8,  0,          true); // flags
    cdv.setUint16(10, 0,          true); // compression
    cdv.setUint16(12, 0,          true); // mod time
    cdv.setUint16(14, 0,          true); // mod date
    cdv.setUint32(16, crc,        true); // crc-32
    cdv.setUint32(20, size,       true); // compressed size
    cdv.setUint32(24, size,       true); // uncompressed size
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0,          true); // extra
    cdv.setUint16(32, 0,          true); // comment
    cdv.setUint16(34, 0,          true); // disk start
    cdv.setUint16(36, 0,          true); // internal attr
    cdv.setUint32(38, 0,          true); // external attr
    cdv.setUint32(42, offset,     true); // local header offset
    central.set(nameBytes, 46);

    localHeaders.push(local);
    localHeaders.push(new Uint8Array(bytes));
    centralDir.push(central);

    offset += local.byteLength + size;
  }

  // End of central directory
  const cdSize   = centralDir.reduce((s, b) => s + b.byteLength, 0);
  const eocd     = new Uint8Array(22);
  const edv      = new DataView(eocd.buffer);
  edv.setUint32(0,  0x06054b50,       true); // signature
  edv.setUint16(4,  0,                true); // disk number
  edv.setUint16(6,  0,                true); // disk with cd
  edv.setUint16(8,  files.length,     true); // entries on disk
  edv.setUint16(10, files.length,     true); // total entries
  edv.setUint32(12, cdSize,           true); // cd size
  edv.setUint32(16, offset,           true); // cd offset
  edv.setUint16(20, 0,                true); // comment length

  // Concatenate everything
  const all   = [...localHeaders, ...centralDir, eocd];
  const total = all.reduce((s, b) => s + b.byteLength, 0);
  const out   = new Uint8Array(total);
  let pos     = 0;
  for (const buf of all) {
    out.set(buf, pos);
    pos += buf.byteLength;
  }
  return out.buffer;
}

// CRC-32 implementation
function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  const bytes = new Uint8Array(buf);
  let crc = 0xFFFFFFFF;
  for (const b of bytes) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}


/* ----------------------------------------------------------
   INVITE EMAIL
   ---------------------------------------------------------- */

async function sendInviteEmail(env, recipientEmail, recipientName, token, slugs) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping invite email.');
    return;
  }

  const fromAddress = env.INQUIRY_FROM || 'hello@vestafolioco.com';
  const inviteLink  = `https://vestafolioco.com/portal/accept-invite?token=${encodeURIComponent(token)}`;
  const firstName   = recipientName ? String(recipientName).trim().split(/\s+/)[0] : null;
  const greeting    = firstName ? `Hello, ${esc(firstName)}.` : 'Hello.';
  const safeLink    = esc(inviteLink);
  const projectCount = slugs.length;

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/><title>Your project gallery is ready</title></head>
<body style="margin:0;padding:0;background-color:#F2EDE3;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F2EDE3;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#F2EDE3;">

      <tr><td align="left" style="padding-bottom:32px;">
        <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:400;letter-spacing:0.18em;color:#1F2E2A;text-transform:uppercase;">VESTA FOLIO</span>
      </td></tr>

      <tr><td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td></tr>

      <tr><td style="padding:40px 0 16px 0;">
        <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;color:#1F2E2A;">Your project ${projectCount > 1 ? 'galleries are' : 'gallery is'} ready.</h1>
      </td></tr>

      <tr><td style="padding:0 0 32px 0;">
        <p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;line-height:1.75;color:#1F2E2A;">${greeting}</p>
        <p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;line-height:1.75;color:#1F2E2A;">Vesta Folio has shared ${projectCount > 1 ? `${projectCount} projects` : 'a project'} with you. Use the link below to set your password and access your ${projectCount > 1 ? 'galleries' : 'gallery'}.</p>
        <p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:15px;font-weight:400;line-height:1.75;color:#4A5C57;">The link expires in ${INVITE_DAYS} days.</p>
      </td></tr>

      <tr><td style="padding:0 0 32px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="background-color:#A8884E;">
            <a href="${safeLink}" style="display:inline-block;padding:16px 32px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:#1F2E2A;text-decoration:none;">Access your gallery</a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:0 0 32px 0;">
        <p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;font-weight:400;line-height:1.6;color:#4A5C57;">Or paste this link into your browser:<br/><span style="color:#1F2E2A;word-break:break-all;">${safeLink}</span></p>
      </td></tr>

      <tr><td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td></tr>

      <tr><td style="padding:24px 0 0 0;">
        <p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;font-weight:400;line-height:1.6;color:#4A5C57;">— Vesta Folio<br/>vestafolioco.com · Los Angeles</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  const text = `${greeting}

Vesta Folio has shared ${projectCount > 1 ? `${projectCount} projects` : 'a project'} with you. Use the link below to set your password and access your ${projectCount > 1 ? 'galleries' : 'gallery'}.

${inviteLink}

The link expires in ${INVITE_DAYS} days.

— Vesta Folio
vestafolioco.com · Los Angeles
`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    `Vesta Folio <${fromAddress}>`,
      to:      [recipientEmail],
      subject: `Your project ${projectCount > 1 ? 'galleries are' : 'gallery is'} ready — Vesta Folio`,
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
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
  if (data.youtube_id  !== undefined && data.youtube_id !== '' && (typeof data.youtube_id !== 'string' || data.youtube_id.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(data.youtube_id))) {
    return { error: 'YouTube ID is invalid.' };
  }
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
      .prepare(`INSERT INTO inquiries (name, email, brokerage, property_address, listing_date, services, notes, sq_ft, bedrooms, bathrooms, listing_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        d.name, d.email, d.brokerage || null, d.property_address,
        d.listing_date || null, services, d.notes || null,
        d.sq_ft ? Number(d.sq_ft) : null,
        d.bedrooms ? Number(d.bedrooms) : null,
        d.bathrooms ? Number(d.bathrooms) : null,
        d.listing_price ? Number(d.listing_price) : null
      )
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


/* ----------------------------------------------------------
   CHUNK 9 ADDITIONS: Team, All Clients, Videos
   ---------------------------------------------------------- */

async function handleListTeam(request, env) {
  const { response } = await requireSuperAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    const rows = await env.DB.prepare(
      "SELECT id, name, email, role, created_at, last_login_at FROM users WHERE role IN ('admin','super_admin') ORDER BY created_at ASC"
    ).all();
    return json({ ok: true, team: rows.results || [] });
  } catch (err) {
    console.error('List team error:', err);
    return json({ error: 'Could not load team.' }, 500);
  }
}

async function handleCreateTeamMember(request, env) {
  const { response, user } = await requireSuperAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const { name, email } = data;
  if (!name || !email) return json({ error: 'Name and email are required.' }, 400);
  try {
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (existing) return json({ error: 'An account with this email already exists.' }, 409);
    const tempHash = await bcrypt.hash(crypto.randomUUID(), 12);
    const result = await env.DB.prepare(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')"
    ).bind(name, email.toLowerCase(), tempHash).run();
    const userId = result.meta.last_row_id;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2,'0')).join('');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, userId, expires).run();
    const link = `https://vestafolioco.com/admin/reset-password?token=${token}`;
    const html = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F2EDE3;font-family:Georgia,serif;"><tr><td style="padding:40px 32px;"><p style="font-size:11px;letter-spacing:0.2em;color:#4A5C57;text-transform:uppercase;margin:0 0 24px;">Vesta Folio</p><h1 style="font-size:28px;font-weight:400;color:#1F2E2A;margin:0 0 16px;">Admin access</h1><p style="font-size:15px;color:#4A5C57;line-height:1.6;margin:0 0 24px;">Hello ${esc(name)}, you have been added as an admin. Set your password to get started.</p><a href="${link}" style="display:inline-block;background:#1F2E2A;color:#F2EDE3;font-size:13px;padding:14px 28px;text-decoration:none;">Set your password</a><p style="font-size:12px;color:#A8884E;margin:24px 0 0;">This link expires in 7 days.</p></td></tr></table>`;
    await sendEmail(env, { from: `Vesta Folio <${env.INQUIRY_FROM}>`, to: [email], subject: 'You have been added to Vesta Folio admin', html, text: `Set your admin password: ${link}` });
    return json({ ok: true, id: userId }, 201);
  } catch (err) {
    console.error('Create team member error:', err);
    return json({ error: 'Could not create team member.' }, 500);
  }
}

async function handleDeleteTeamMember(request, env, id) {
  const { response, user } = await requireSuperAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  if (user.id === id) return json({ error: 'Cannot delete your own account.' }, 400);
  try {
    const target = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(id).first();
    if (!target) return json({ error: 'User not found.' }, 404);
    if (target.role === 'super_admin') return json({ error: 'Cannot delete super admin account.' }, 403);
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (err) {
    console.error('Delete team member error:', err);
    return json({ error: 'Could not delete team member.' }, 500);
  }
}

async function handleListAllClients(request, env) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  try {
    let where = "u.role = 'client'";
    const params = [];
    if (search) {
      where += ' AND (u.name LIKE ? OR u.email LIKE ?)';
      params.push('%' + search + '%', '%' + search + '%');
    }
    const rows = await env.DB.prepare(
      'SELECT u.id, u.name, u.email, u.created_at, u.last_login_at, ' +
      "GROUP_CONCAT(cp.title, '||') as project_titles, GROUP_CONCAT(cp.id, '||') as project_ids, GROUP_CONCAT(cp.status, '||') as project_statuses " +
      'FROM users u ' +
      'LEFT JOIN client_project_access_v2 cpa ON cpa.user_id = u.id ' +
      'LEFT JOIN client_projects cp ON cp.id = cpa.client_project_id ' +
      'WHERE ' + where + ' GROUP BY u.id ORDER BY u.created_at DESC'
    ).bind(...params).all();
    const clients = (rows.results || []).map(r => {
      const titles = r.project_titles ? r.project_titles.split('||') : [];
      const ids = r.project_ids ? r.project_ids.split('||') : [];
      const statuses = r.project_statuses ? r.project_statuses.split('||') : [];
      return {
        id: r.id, name: r.name, email: r.email,
        created_at: r.created_at, last_login_at: r.last_login_at,
        projects: titles.map((t, i) => ({ id: ids[i], title: t, status: statuses[i] })).filter(p => p.title)
      };
    });
    return json({ ok: true, clients });
  } catch (err) {
    console.error('List all clients error:', err);
    return json({ error: 'Could not load clients.' }, 500);
  }
}

async function handleGetAllClientDetail(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    const user = await env.DB.prepare(
      "SELECT id, name, email, created_at, last_login_at FROM users WHERE id = ? AND role = 'client'"
    ).bind(id).first();
    if (!user) return json({ error: 'Client not found.' }, 404);
    const projects = await env.DB.prepare(
      'SELECT cp.id, cp.title, cp.slug, cp.status, cpa.granted_at ' +
      'FROM client_project_access_v2 cpa JOIN client_projects cp ON cp.id = cpa.client_project_id ' +
      'WHERE cpa.user_id = ? ORDER BY cpa.granted_at DESC'
    ).bind(id).all();
    return json({ ok: true, client: { ...user, projects: projects.results || [] } });
  } catch (err) {
    console.error('Get all client detail error:', err);
    return json({ error: 'Could not load client.' }, 500);
  }
}

async function handleListClientProjectVideos(request, env, id) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    const rows = await env.DB.prepare(
      'SELECT v.*, u.name as added_by_name FROM client_project_videos v ' +
      'LEFT JOIN users u ON u.id = v.added_by ' +
      'WHERE v.client_project_id = ? ORDER BY v.created_at ASC'
    ).bind(id).all();
    return json({ ok: true, videos: rows.results || [] });
  } catch (err) {
    console.error('List videos error:', err);
    return json({ error: 'Could not load videos.' }, 500);
  }
}

async function handleAddClientProjectVideo(request, env, id) {
  const { response, user } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  let data;
  try { data = await request.json(); } catch { return json({ error: 'Invalid request body.' }, 400); }
  const { platform, video_id, title } = data;
  if (!platform || !video_id) return json({ error: 'platform and video_id are required.' }, 400);
  const PLATFORMS = ['youtube', 'reels', 'tiktok'];
  if (!PLATFORMS.includes(platform)) return json({ error: 'Invalid platform. Must be youtube, reels, or tiktok.' }, 400);
  try {
    const proj = await env.DB.prepare('SELECT id FROM client_projects WHERE id = ?').bind(id).first();
    if (!proj) return json({ error: 'Project not found.' }, 404);
    const result = await env.DB.prepare(
      'INSERT INTO client_project_videos (client_project_id, platform, video_id, title, added_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, platform, video_id, title || null, user.id).run();
    return json({ ok: true, id: result.meta.last_row_id }, 201);
  } catch (err) {
    console.error('Add video error:', err);
    return json({ error: 'Could not add video.' }, 500);
  }
}

async function handleDeleteClientProjectVideo(request, env, projectId, videoId) {
  const { response } = await requireAdmin(request, env);
  if (response) return response;
  if (!env.DB) return json({ error: 'Service unavailable.' }, 500);
  try {
    await env.DB.prepare('DELETE FROM client_project_videos WHERE id = ? AND client_project_id = ?').bind(videoId, projectId).run();
    return json({ ok: true });
  } catch (err) {
    console.error('Delete video error:', err);
    return json({ error: 'Could not delete video.' }, 500);
  }
}
