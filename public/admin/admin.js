/* ============================================================
   /admin/admin.js — Chunk 7a
   Two-tab dashboard: Portfolio (projects.json) + Client projects (D1).
   ============================================================ */

// ── DOM refs ──────────────────────────────────────────────────

const loadingEl       = document.getElementById('admin-loading');
const authenticatedEl = document.getElementById('admin-authenticated');
const logoutBtn       = document.getElementById('logout-btn');

// Tabs
const tabPortfolio    = document.getElementById('tab-portfolio');
const tabClients      = document.getElementById('tab-clients');
const panelPortfolio  = document.getElementById('panel-portfolio');
const panelClients    = document.getElementById('panel-clients');

// Portfolio tab
const newProjectBtn   = document.getElementById('new-project-btn');
const projectsLoading = document.getElementById('projects-loading');
const projectsError   = document.getElementById('projects-error');
const projectsTableWrap = document.getElementById('projects-table-wrap');
const projectsTbody   = document.getElementById('projects-tbody');
const projectsEmpty   = document.getElementById('projects-empty');

// Portfolio create modal
const modalOverlay    = document.getElementById('modal-overlay');
const modalClose      = document.getElementById('modal-close');
const modalCancel     = document.getElementById('modal-cancel');
const modalError      = document.getElementById('modal-error');
const createForm      = document.getElementById('create-form');
const modalSubmit     = document.getElementById('modal-submit');
const fieldTitle      = document.getElementById('field-title');
const fieldSlug       = document.getElementById('field-slug');
const fieldLocation   = document.getElementById('field-location');
const fieldYear       = document.getElementById('field-year');
const fieldDescription= document.getElementById('field-description');

// Client projects tab
const newCpBtn        = document.getElementById('new-cp-btn');
const cpLoading       = document.getElementById('cp-loading');
const cpError         = document.getElementById('cp-error');
const cpTableWrap     = document.getElementById('cp-table-wrap');
const cpTbody         = document.getElementById('cp-tbody');
const cpEmpty         = document.getElementById('cp-empty');

// Client project create modal
const cpModalOverlay  = document.getElementById('cp-modal-overlay');
const cpModalClose    = document.getElementById('cp-modal-close');
const cpModalCancel   = document.getElementById('cp-modal-cancel');
const cpModalError    = document.getElementById('cp-modal-error');
const cpCreateForm    = document.getElementById('cp-create-form');
const cpModalSubmit   = document.getElementById('cp-modal-submit');
const cpFieldTitle    = document.getElementById('cp-field-title');
const cpFieldSlug     = document.getElementById('cp-field-slug');
const cpFieldLocation = document.getElementById('cp-field-location');
const cpFieldYear     = document.getElementById('cp-field-year');
const cpFieldDesc     = document.getElementById('cp-field-description');

// Delete confirm (shared)
const confirmOverlay  = document.getElementById('confirm-overlay');
const confirmClose    = document.getElementById('confirm-close');
const confirmCancel   = document.getElementById('confirm-cancel');
const confirmDelete   = document.getElementById('confirm-delete');
const confirmBody     = document.getElementById('confirm-body');
const confirmError    = document.getElementById('confirm-error');


// ── State ─────────────────────────────────────────────────────

let portfolioProjects = [];
let clientProjects    = [];
let pendingDelete     = null; // { type: 'portfolio'|'client', id, slug }
let clientsLoaded     = false;


// ── Auth gate ─────────────────────────────────────────────────

(async function init() {
  try {
    const res  = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body?.user) { redirectToLogin(); return; }

    loadingEl.hidden       = true;
    authenticatedEl.hidden = false;

    const params = new URLSearchParams(window.location.search);
    if (params.get('saved'))   { showBanner('Project saved.'); window.history.replaceState({}, '', '/admin'); }
    if (params.get('deleted')) { showBanner('Project deleted.'); window.history.replaceState({}, '', '/admin'); }

    // Check if we should open client tab (e.g. redirected from client project)
    if (params.get('tab') === 'clients') {
      switchTab('clients');
      window.history.replaceState({}, '', '/admin');
    }

    await loadPortfolioProjects();
  } catch { redirectToLogin(); }
})();


// ── Log out ───────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* continue */ }
  finally { window.location.href = '/admin/login'; }
});


// ── Tab switching ─────────────────────────────────────────────

tabPortfolio.addEventListener('click', () => switchTab('portfolio'));
tabClients.addEventListener('click', () => switchTab('clients'));

function switchTab(tab) {
  const isPortfolio = tab === 'portfolio';
  tabPortfolio.classList.toggle('admin__tab--active', isPortfolio);
  tabClients.classList.toggle('admin__tab--active', !isPortfolio);
  panelPortfolio.hidden = !isPortfolio;
  panelClients.hidden   = isPortfolio;

  if (!isPortfolio && !clientsLoaded) {
    clientsLoaded = true;
    loadClientProjects();
  }
}


// ── Banner ────────────────────────────────────────────────────

function showBanner(message) {
  const existing = document.getElementById('admin-banner');
  if (existing) existing.remove();
  const banner = document.createElement('p');
  banner.id = 'admin-banner';
  banner.className = 'admin__success';
  banner.style.marginBottom = 'var(--space-4)';
  banner.textContent = message;
  const header = authenticatedEl.querySelector('.admin__tabs');
  header.insertAdjacentElement('afterend', banner);
  setTimeout(() => banner.remove(), 5000);
}


// ── Portfolio: load & render ──────────────────────────────────

async function loadPortfolioProjects() {
  showPortfolioState('loading');
  try {
    const res  = await fetch('/api/admin/projects', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) { showPortfolioState('error', 'Could not load projects.'); return; }
    portfolioProjects = (body.projects || []).sort((a, b) => a.order - b.order);
    renderPortfolioTable();
  } catch { showPortfolioState('error', 'Could not connect.'); }
}

function renderPortfolioTable() {
  if (portfolioProjects.length === 0) { showPortfolioState('empty'); return; }
  projectsTbody.innerHTML = '';
  portfolioProjects.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'projects__row';
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
        <a class="projects__action" href="/admin/project?slug=${escHtml(p.slug)}">Edit</a>
        <button class="projects__action projects__action--danger" type="button"
                data-action="delete-portfolio" data-slug="${escHtml(p.slug)}">Delete</button>
      </td>
    `;
    projectsTbody.appendChild(tr);
  });
  showPortfolioState('table');
}

function showPortfolioState(state, msg) {
  projectsLoading.hidden   = state !== 'loading';
  projectsError.hidden     = state !== 'error';
  projectsTableWrap.hidden = state !== 'table';
  projectsEmpty.hidden     = state !== 'empty';
  if (state === 'error' && msg) projectsError.textContent = msg;
}

projectsTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="delete-portfolio"]');
  if (btn) openConfirm('portfolio', btn.dataset.slug);
});


// ── Client projects: load & render ────────────────────────────

async function loadClientProjects() {
  showCpState('loading');
  try {
    const res  = await fetch('/api/admin/client-projects', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) { showCpState('error', 'Could not load projects.'); return; }
    clientProjects = body.projects || [];
    renderCpTable();
  } catch { showCpState('error', 'Could not connect.'); }
}

function renderCpTable() {
  if (clientProjects.length === 0) { showCpState('empty'); return; }
  cpTbody.innerHTML = '';
  clientProjects.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'projects__row';
    const services = Array.isArray(p.services) && p.services.length
      ? p.services.map(s => SERVICE_LABELS[s] || s).join(', ') : '—';
    tr.innerHTML = `
      <td class="projects__td projects__td--title">
        <span class="projects__title">${escHtml(p.title)}</span>
        <span class="projects__slug">${escHtml(p.slug)}</span>
      </td>
      <td class="projects__td projects__td--meta">${escHtml(p.location)}</td>
      <td class="projects__td projects__td--meta">${p.year}</td>
      <td class="projects__td projects__td--meta">${escHtml(services)}</td>
      <td class="projects__td projects__td--actions">
        <a class="projects__action" href="/admin/client-project?id=${p.id}">Edit</a>
        <button class="projects__action projects__action--danger" type="button"
                data-action="delete-cp" data-id="${p.id}" data-title="${escHtml(p.title)}">Delete</button>
      </td>
    `;
    cpTbody.appendChild(tr);
  });
  showCpState('table');
}

function showCpState(state, msg) {
  cpLoading.hidden   = state !== 'loading';
  cpError.hidden     = state !== 'error';
  cpTableWrap.hidden = state !== 'table';
  cpEmpty.hidden     = state !== 'empty';
  if (state === 'error' && msg) cpError.textContent = msg;
}

cpTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="delete-cp"]');
  if (btn) openConfirm('client', btn.dataset.id, btn.dataset.title);
});


// ── Portfolio create modal ────────────────────────────────────

newProjectBtn.addEventListener('click', () => {
  createForm.reset(); clearModalError();
  fieldYear.value = new Date().getFullYear();
  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  fieldTitle.focus();
});

modalClose.addEventListener('click', closePortfolioModal);
modalCancel.addEventListener('click', closePortfolioModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closePortfolioModal(); });

fieldTitle.addEventListener('input', () => { fieldSlug.value = slugify(fieldTitle.value); });

function closePortfolioModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = '';
  clearModalError(); createForm.reset();
}

createForm.addEventListener('submit', async (e) => {
  e.preventDefault(); clearModalError();
  const payload = {
    title: fieldTitle.value.trim(), slug: fieldSlug.value.trim(),
    location: fieldLocation.value.trim(), year: Number(fieldYear.value),
    description: fieldDescription.value.trim(), services: [], featured: true,
    order: portfolioProjects.length + 1,
  };
  if (!payload.title)       { showModalError('Title is required.');    return; }
  if (!payload.slug)        { showModalError('Slug is required.');     return; }
  if (!payload.location)    { showModalError('Location is required.'); return; }
  if (!payload.year)        { showModalError('Year is required.');     return; }
  if (!payload.description) { showModalError('Description is required.'); return; }

  const originalLabel = modalSubmit.textContent;
  modalSubmit.disabled = true; modalSubmit.textContent = 'Creating…';
  try {
    const res  = await fetch('/api/admin/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showModalError(body.error || 'Could not create project.'); return; }
    window.location.href = `/admin/project?slug=${payload.slug}&created=1`;
  } catch { showModalError('Could not connect. Try again.'); }
  finally { modalSubmit.disabled = false; modalSubmit.textContent = originalLabel; }
});

function showModalError(msg) { modalError.textContent = msg; modalError.hidden = false; }
function clearModalError()   { modalError.textContent = ''; modalError.hidden = true; }


// ── Client project create modal ───────────────────────────────

newCpBtn.addEventListener('click', () => {
  cpCreateForm.reset(); cpModalError.hidden = true;
  cpFieldYear.value = new Date().getFullYear();
  cpModalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  cpFieldTitle.focus();
});

cpModalClose.addEventListener('click', closeCpModal);
cpModalCancel.addEventListener('click', closeCpModal);
cpModalOverlay.addEventListener('click', (e) => { if (e.target === cpModalOverlay) closeCpModal(); });

cpFieldTitle.addEventListener('input', () => { cpFieldSlug.value = slugify(cpFieldTitle.value); });

function closeCpModal() {
  cpModalOverlay.hidden = true;
  document.body.style.overflow = '';
  cpModalError.hidden = true; cpCreateForm.reset();
}

cpCreateForm.addEventListener('submit', async (e) => {
  e.preventDefault(); cpModalError.hidden = true;
  const payload = {
    title: cpFieldTitle.value.trim(), slug: cpFieldSlug.value.trim(),
    location: cpFieldLocation.value.trim(), year: Number(cpFieldYear.value),
    description: cpFieldDesc.value.trim(), services: [],
  };
  if (!payload.title)       { cpModalError.textContent = 'Title is required.';    cpModalError.hidden = false; return; }
  if (!payload.slug)        { cpModalError.textContent = 'Slug is required.';     cpModalError.hidden = false; return; }
  if (!payload.location)    { cpModalError.textContent = 'Location is required.'; cpModalError.hidden = false; return; }
  if (!payload.year)        { cpModalError.textContent = 'Year is required.';     cpModalError.hidden = false; return; }
  if (!payload.description) { cpModalError.textContent = 'Description is required.'; cpModalError.hidden = false; return; }

  const originalLabel = cpModalSubmit.textContent;
  cpModalSubmit.disabled = true; cpModalSubmit.textContent = 'Creating…';
  try {
    const res  = await fetch('/api/admin/client-projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { cpModalError.textContent = body.error || 'Could not create project.'; cpModalError.hidden = false; return; }
    window.location.href = `/admin/client-project?id=${body.project.id}&created=1`;
  } catch { cpModalError.textContent = 'Could not connect. Try again.'; cpModalError.hidden = false; }
  finally { cpModalSubmit.disabled = false; cpModalSubmit.textContent = originalLabel; }
});


// ── Delete confirmation (shared) ──────────────────────────────

function openConfirm(type, idOrSlug, title) {
  pendingDelete = { type, idOrSlug };
  const project = type === 'portfolio'
    ? portfolioProjects.find(p => p.slug === idOrSlug)
    : clientProjects.find(p => String(p.id) === String(idOrSlug));
  confirmBody.textContent  = `Remove "${title || project?.title || 'this project'}"?`;
  confirmError.hidden      = true;
  confirmOverlay.hidden    = false;
  document.body.style.overflow = 'hidden';
  confirmDelete.focus();
}

function closeConfirm() {
  confirmOverlay.hidden = true;
  document.body.style.overflow = '';
  pendingDelete = null;
}

confirmClose.addEventListener('click', closeConfirm);
confirmCancel.addEventListener('click', closeConfirm);
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) closeConfirm(); });

confirmDelete.addEventListener('click', async () => {
  if (!pendingDelete) return;
  const { type, idOrSlug } = pendingDelete;
  const originalLabel = confirmDelete.textContent;
  confirmDelete.disabled = true; confirmDelete.textContent = 'Deleting…';
  confirmError.hidden = true;

  try {
    const url = type === 'portfolio'
      ? `/api/admin/projects/${idOrSlug}`
      : `/api/admin/client-projects/${idOrSlug}`;
    const res  = await fetch(url, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { confirmError.textContent = body.error || 'Could not delete.'; confirmError.hidden = false; return; }
    closeConfirm();
    if (type === 'portfolio') await loadPortfolioProjects();
    else await loadClientProjects();
  } catch { confirmError.textContent = 'Could not connect.'; confirmError.hidden = false; }
  finally { confirmDelete.disabled = false; confirmDelete.textContent = originalLabel; }
});


// ── Keyboard ──────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!modalOverlay.hidden)   closePortfolioModal();
  if (!cpModalOverlay.hidden) closeCpModal();
  if (!confirmOverlay.hidden) closeConfirm();
});


// ── Helpers ───────────────────────────────────────────────────

function redirectToLogin() { window.location.href = '/admin/login'; }

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const SERVICE_LABELS = {
  hdr: 'HDR Photography', cinematic: 'Cinematic Tour', staging: 'AI Staging',
};
