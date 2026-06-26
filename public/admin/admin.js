/* ============================================================
   /admin/admin.js — Chunk 6a
   Project list + slim create modal.
   Edit navigates to /admin/projects/[slug].
   ============================================================ */

// ── DOM refs ──────────────────────────────────────────────────

const loadingEl         = document.getElementById('admin-loading');
const authenticatedEl   = document.getElementById('admin-authenticated');
const logoutBtn         = document.getElementById('logout-btn');

const projectsLoading   = document.getElementById('projects-loading');
const projectsError     = document.getElementById('projects-error');
const projectsTableWrap = document.getElementById('projects-table-wrap');
const projectsTbody     = document.getElementById('projects-tbody');
const projectsEmpty     = document.getElementById('projects-empty');
const newProjectBtn     = document.getElementById('new-project-btn');

// Create modal
const modalOverlay      = document.getElementById('modal-overlay');
const modalClose        = document.getElementById('modal-close');
const modalCancel       = document.getElementById('modal-cancel');
const modalError        = document.getElementById('modal-error');
const createForm        = document.getElementById('create-form');
const modalSubmit       = document.getElementById('modal-submit');
const fieldTitle        = document.getElementById('field-title');
const fieldSlug         = document.getElementById('field-slug');
const fieldLocation     = document.getElementById('field-location');
const fieldYear         = document.getElementById('field-year');
const fieldDescription  = document.getElementById('field-description');

// Delete confirm
const confirmOverlay    = document.getElementById('confirm-overlay');
const confirmClose      = document.getElementById('confirm-close');
const confirmCancel     = document.getElementById('confirm-cancel');
const confirmDelete     = document.getElementById('confirm-delete');
const confirmBody       = document.getElementById('confirm-body');
const confirmError      = document.getElementById('confirm-error');


// ── State ─────────────────────────────────────────────────────

let projects     = [];
let slugToDelete = null;


// ── Auth gate ─────────────────────────────────────────────────

(async function init() {
  try {
    const res  = await fetch('/api/auth/me', { method: 'GET', headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body || !body.user) { redirectToLogin(); return; }

    loadingEl.hidden       = true;
    authenticatedEl.hidden = false;

    // Show success banner if redirected from project edit
    const params = new URLSearchParams(window.location.search);
    if (params.get('saved')) {
      showBanner(`Project saved.`);
      window.history.replaceState({}, '', '/admin');
    }
    if (params.get('deleted')) {
      showBanner(`Project deleted.`);
      window.history.replaceState({}, '', '/admin');
    }

    await loadProjects();
  } catch (err) {
    console.error('Auth check failed:', err);
    redirectToLogin();
  }
})();


// ── Log out ───────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST' }); }
  catch (err) { console.error('Logout error:', err); }
  finally { window.location.href = '/admin/login'; }
});


// ── Load & render project list ────────────────────────────────

async function loadProjects() {
  showProjectsState('loading');
  try {
    const res = await fetch('/api/admin/projects', { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showProjectsState('error', body.error || 'Could not load projects.');
      return;
    }
    const body = await res.json();
    projects = (body.projects || []).sort((a, b) => a.order - b.order);
    renderProjectTable();
  } catch (err) {
    console.error('Load projects error:', err);
    showProjectsState('error', 'Could not connect. Check your connection and try again.');
  }
}

function renderProjectTable() {
  if (projects.length === 0) { showProjectsState('empty'); return; }

  projectsTbody.innerHTML = '';
  projects.forEach(p => {
    const tr = document.createElement('tr');
    tr.className    = 'projects__row';
    tr.dataset.slug = p.slug;

    const services = Array.isArray(p.services) && p.services.length
      ? p.services.map(s => SERVICE_LABELS[s] || s).join(', ') : '—';

    tr.innerHTML = `
      <td class="projects__td projects__td--order">${p.order}</td>
      <td class="projects__td projects__td--title">
        <span class="projects__title">${escHtml(p.title)}</span>
        <span class="projects__slug">${escHtml(p.slug)}</span>
      </td>
      <td class="projects__td projects__td--meta">${escHtml(p.location)}</td>
      <td class="projects__td projects__td--meta">${p.year}</td>
      <td class="projects__td projects__td--meta">${escHtml(services)}</td>
      <td class="projects__td projects__td--meta">${p.featured ? 'Yes' : '—'}</td>
      <td class="projects__td projects__td--actions">
        <a class="projects__action" href="/admin/projects/${escHtml(p.slug)}">Edit</a>
        <button class="projects__action projects__action--danger" type="button"
                data-action="delete" data-slug="${escHtml(p.slug)}">Delete</button>
      </td>
    `;
    projectsTbody.appendChild(tr);
  });

  showProjectsState('table');
}

function showProjectsState(state, message) {
  projectsLoading.hidden   = state !== 'loading';
  projectsError.hidden     = state !== 'error';
  projectsTableWrap.hidden = state !== 'table';
  projectsEmpty.hidden     = state !== 'empty';
  if (state === 'error' && message) projectsError.textContent = message;
}


// ── Banner (success messages from edit page) ──────────────────

function showBanner(message) {
  const existing = document.getElementById('admin-banner');
  if (existing) existing.remove();
  const banner = document.createElement('p');
  banner.id        = 'admin-banner';
  banner.className = 'admin__success';
  banner.style.marginBottom = 'var(--space-4)';
  banner.textContent = message;
  authenticatedEl.insertBefore(banner, authenticatedEl.querySelector('.projects__header').nextSibling);
  setTimeout(() => banner.remove(), 5000);
}


// ── New project button ────────────────────────────────────────

newProjectBtn.addEventListener('click', () => openCreateModal());


// ── Row delete action ─────────────────────────────────────────

projectsTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="delete"]');
  if (btn) openConfirm(btn.dataset.slug);
});


// ── Create modal ──────────────────────────────────────────────

function openCreateModal() {
  createForm.reset();
  clearModalError();
  fieldYear.value = new Date().getFullYear();
  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  fieldTitle.focus();
}

function closeCreateModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = '';
  clearModalError();
  createForm.reset();
}

modalClose.addEventListener('click', closeCreateModal);
modalCancel.addEventListener('click', closeCreateModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeCreateModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalOverlay.hidden)   closeCreateModal();
    if (!confirmOverlay.hidden) closeConfirm();
  }
});

// Auto-derive slug
fieldTitle.addEventListener('input', () => {
  fieldSlug.value = slugify(fieldTitle.value);
});

// Create form submit → create project → redirect to edit page
createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearModalError();

  const payload = {
    title:       fieldTitle.value.trim(),
    slug:        fieldSlug.value.trim(),
    location:    fieldLocation.value.trim(),
    year:        Number(fieldYear.value),
    description: fieldDescription.value.trim(),
    services:    [],
    featured:    true,
    order:       projects.length + 1,
  };

  if (!payload.title)       { showModalError('Title is required.');       return; }
  if (!payload.slug)        { showModalError('Slug is required.');        return; }
  if (!payload.location)    { showModalError('Location is required.');    return; }
  if (!payload.year)        { showModalError('Year is required.');        return; }
  if (!payload.description) { showModalError('Description is required.'); return; }

  const originalLabel     = modalSubmit.textContent;
  modalSubmit.disabled    = true;
  modalSubmit.textContent = 'Creating…';

  try {
    const res  = await fetch('/api/admin/projects', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) { showModalError(body.error || 'Could not create project.'); return; }

    // Redirect to edit page with "just created" flag
    window.location.href = `/admin/projects/${payload.slug}?created=1`;

  } catch (err) {
    console.error('Create error:', err);
    showModalError('Could not connect. Check your connection and try again.');
  } finally {
    modalSubmit.disabled    = false;
    modalSubmit.textContent = originalLabel;
  }
});


// ── Delete confirmation ───────────────────────────────────────

function openConfirm(slug) {
  slugToDelete = slug;
  const project = projects.find(p => p.slug === slug);
  confirmBody.textContent  = project ? `Remove "${project.title}" from the site?` : 'Remove this project?';
  confirmError.hidden      = true;
  confirmError.textContent = '';
  confirmOverlay.hidden    = false;
  document.body.style.overflow = 'hidden';
  confirmDelete.focus();
}

function closeConfirm() {
  confirmOverlay.hidden = true;
  document.body.style.overflow = '';
  slugToDelete = null;
}

confirmClose.addEventListener('click', closeConfirm);
confirmCancel.addEventListener('click', closeConfirm);
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) closeConfirm(); });

confirmDelete.addEventListener('click', async () => {
  if (!slugToDelete) return;
  const slug                = slugToDelete;
  const originalLabel       = confirmDelete.textContent;
  confirmDelete.disabled    = true;
  confirmDelete.textContent = 'Deleting…';
  confirmError.hidden       = true;

  try {
    const res  = await fetch(`/api/admin/projects/${slug}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      confirmError.textContent = body.error || 'Could not delete project.';
      confirmError.hidden      = false;
      return;
    }
    closeConfirm();
    window.location.href = '/admin?deleted=1';
  } catch (err) {
    console.error('Delete error:', err);
    confirmError.textContent = 'Could not connect. Try again.';
    confirmError.hidden      = false;
  } finally {
    confirmDelete.disabled    = false;
    confirmDelete.textContent = originalLabel;
  }
});


// ── Helpers ───────────────────────────────────────────────────

function showModalError(message) {
  modalError.textContent = message;
  modalError.hidden      = false;
}

function clearModalError() {
  modalError.textContent = '';
  modalError.hidden      = true;
}

function redirectToLogin() { window.location.href = '/admin/login'; }

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const SERVICE_LABELS = {
  hdr:       'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:   'AI Staging',
};
