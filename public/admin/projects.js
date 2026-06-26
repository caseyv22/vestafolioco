/* /admin/projects.js — two-tab portfolio + client projects */
const loadingEl = document.getElementById('admin-loading');
const authEl    = document.getElementById('admin-authenticated');
const logoutBtn = document.getElementById('logout-btn');
const tabPortfolio = document.getElementById('tab-portfolio');
const tabClients   = document.getElementById('tab-clients');
const panelPortfolio = document.getElementById('panel-portfolio');
const panelClients   = document.getElementById('panel-clients');

// Portfolio
const newProjectBtn      = document.getElementById('new-project-btn');
const projectsLoading    = document.getElementById('projects-loading');
const projectsError      = document.getElementById('projects-error');
const projectsTableWrap  = document.getElementById('projects-table-wrap');
const projectsTbody      = document.getElementById('projects-tbody');
const projectsEmpty      = document.getElementById('projects-empty');
const modalOverlay       = document.getElementById('modal-overlay');
const modalClose         = document.getElementById('modal-close');
const modalCancel        = document.getElementById('modal-cancel');
const modalError         = document.getElementById('modal-error');
const createForm         = document.getElementById('create-form');
const modalSubmit        = document.getElementById('modal-submit');
const fieldTitle         = document.getElementById('field-title');
const fieldSlug          = document.getElementById('field-slug');
const fieldLocation      = document.getElementById('field-location');
const fieldYear          = document.getElementById('field-year');
const fieldDescription   = document.getElementById('field-description');

// Client projects
const newCpBtn     = document.getElementById('new-cp-btn');
const cpLoading    = document.getElementById('cp-loading');
const cpError      = document.getElementById('cp-error');
const cpTableWrap  = document.getElementById('cp-table-wrap');
const cpTbody      = document.getElementById('cp-tbody');
const cpEmpty      = document.getElementById('cp-empty');
const cpModalOverlay = document.getElementById('cp-modal-overlay');
const cpModalClose   = document.getElementById('cp-modal-close');
const cpModalCancel  = document.getElementById('cp-modal-cancel');
const cpModalError   = document.getElementById('cp-modal-error');
const cpCreateForm   = document.getElementById('cp-create-form');
const cpModalSubmit  = document.getElementById('cp-modal-submit');
const cpFieldTitle   = document.getElementById('cp-field-title');
const cpFieldSlug    = document.getElementById('cp-field-slug');
const cpFieldLocation= document.getElementById('cp-field-location');
const cpFieldYear    = document.getElementById('cp-field-year');
const cpFieldDesc    = document.getElementById('cp-field-description');

// Confirm
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmClose   = document.getElementById('confirm-close');
const confirmCancel  = document.getElementById('confirm-cancel');
const confirmDelete  = document.getElementById('confirm-delete');
const confirmBody    = document.getElementById('confirm-body');
const confirmError   = document.getElementById('confirm-error');

const SERVICE_LABELS = { hdr:'HDR Photography', cinematic:'Cinematic Tour', staging:'AI Staging' };
let portfolioProjects = [];
let clientProjects    = [];
let clientsLoaded     = false;
let pendingDelete     = null;

(async () => {
  try {
    const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    if (!me.ok) { window.location.href = '/admin/login'; return; }
    loadingEl.hidden = true; authEl.hidden = false;
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'clients') { switchTab('clients'); window.history.replaceState({}, '', '/admin/projects'); }
    await loadPortfolioProjects();
  } catch { window.location.href = '/admin/login'; }
})();

logoutBtn.addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/admin/login'; });
tabPortfolio.addEventListener('click', () => switchTab('portfolio'));
tabClients.addEventListener('click',   () => switchTab('clients'));

function switchTab(tab) {
  const isPf = tab === 'portfolio';
  tabPortfolio.classList.toggle('admin__tab--active', isPf);
  tabClients.classList.toggle('admin__tab--active', !isPf);
  panelPortfolio.hidden = !isPf; panelClients.hidden = isPf;
  if (!isPf && !clientsLoaded) { clientsLoaded = true; loadClientProjects(); }
}

async function loadPortfolioProjects() {
  showPfState('loading');
  try {
    const res  = await fetch('/api/admin/projects', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) { showPfState('error', 'Could not load projects.'); return; }
    portfolioProjects = (body.projects || []).sort((a, b) => a.order - b.order);
    renderPortfolioTable();
  } catch { showPfState('error', 'Could not connect.'); }
}

function renderPortfolioTable() {
  if (portfolioProjects.length === 0) { showPfState('empty'); return; }
  projectsTbody.innerHTML = '';
  portfolioProjects.forEach(p => {
    const tr = document.createElement('tr'); tr.className = 'projects__row';
    tr.innerHTML = `
      <td class="projects__td projects__td--order">${p.order}</td>
      <td class="projects__td projects__td--title">
        <span class="projects__title">${esc(p.title)}</span>
        <span class="projects__slug">${esc(p.slug)}</span>
      </td>
      <td class="projects__td projects__td--meta">${esc(p.location)}</td>
      <td class="projects__td projects__td--meta">${p.year}</td>
      <td class="projects__td projects__td--actions">
        <a class="projects__action" href="/admin/project?slug=${esc(p.slug)}">Edit</a>
        <button class="projects__action projects__action--danger" type="button"
                data-action="delete-portfolio" data-slug="${esc(p.slug)}" data-title="${esc(p.title)}">Delete</button>
      </td>`;
    projectsTbody.appendChild(tr);
  });
  showPfState('table');
}

function showPfState(s, msg) {
  projectsLoading.hidden   = s !== 'loading';
  projectsError.hidden     = s !== 'error';
  projectsTableWrap.hidden = s !== 'table';
  projectsEmpty.hidden     = s !== 'empty';
  if (s === 'error' && msg) projectsError.textContent = msg;
}

projectsTbody.addEventListener('click', e => {
  const btn = e.target.closest('[data-action="delete-portfolio"]');
  if (btn) openConfirm('portfolio', btn.dataset.slug, btn.dataset.title);
});

async function loadClientProjects() {
  showCpState('loading');
  try {
    const res  = await fetch('/api/admin/client-projects', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) { showCpState('error', 'Could not load.'); return; }
    clientProjects = body.projects || [];
    renderCpTable();
  } catch { showCpState('error', 'Could not connect.'); }
}

function renderCpTable() {
  if (clientProjects.length === 0) { showCpState('empty'); return; }
  cpTbody.innerHTML = '';
  clientProjects.forEach(p => {
    const tr = document.createElement('tr'); tr.className = 'projects__row';
    tr.innerHTML = `
      <td class="projects__td projects__td--title">
        <span class="projects__title">${esc(p.title)}</span>
        <span class="projects__slug">${esc(p.slug)}</span>
      </td>
      <td class="projects__td projects__td--meta">${esc(p.location)}</td>
      <td class="projects__td projects__td--meta">${p.year}</td>
      <td class="projects__td projects__td--actions">
        <a class="projects__action" href="/admin/client-project?id=${p.id}">Edit</a>
        <button class="projects__action projects__action--danger" type="button"
                data-action="delete-cp" data-id="${p.id}" data-title="${esc(p.title)}">Delete</button>
      </td>`;
    cpTbody.appendChild(tr);
  });
  showCpState('table');
}

function showCpState(s, msg) {
  cpLoading.hidden   = s !== 'loading';
  cpError.hidden     = s !== 'error';
  cpTableWrap.hidden = s !== 'table';
  cpEmpty.hidden     = s !== 'empty';
  if (s === 'error' && msg) cpError.textContent = msg;
}

cpTbody.addEventListener('click', e => {
  const btn = e.target.closest('[data-action="delete-cp"]');
  if (btn) openConfirm('client', btn.dataset.id, btn.dataset.title);
});

// Portfolio modal
newProjectBtn.addEventListener('click', () => { createForm.reset(); modalError.hidden = true; fieldYear.value = new Date().getFullYear(); modalOverlay.hidden = false; document.body.style.overflow = 'hidden'; fieldTitle.focus(); });
modalClose.addEventListener('click', closePfModal);
modalCancel.addEventListener('click', closePfModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closePfModal(); });
fieldTitle.addEventListener('input', () => { fieldSlug.value = slugify(fieldTitle.value); });
function closePfModal() { modalOverlay.hidden = true; document.body.style.overflow = ''; modalError.hidden = true; createForm.reset(); }
createForm.addEventListener('submit', async e => {
  e.preventDefault(); modalError.hidden = true;
  const p = { title: fieldTitle.value.trim(), slug: fieldSlug.value.trim(), location: fieldLocation.value.trim(), year: Number(fieldYear.value), description: fieldDescription.value.trim(), services: [], featured: true, order: portfolioProjects.length + 1 };
  if (!p.title || !p.slug || !p.location || !p.year || !p.description) { modalError.textContent = 'All fields are required.'; modalError.hidden = false; return; }
  const orig = modalSubmit.textContent; modalSubmit.disabled = true; modalSubmit.textContent = 'Creating…';
  try {
    const res = await fetch('/api/admin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(p) });
    const b   = await res.json().catch(() => ({}));
    if (!res.ok) { modalError.textContent = b.error || 'Could not create.'; modalError.hidden = false; return; }
    window.location.href = `/admin/project?slug=${p.slug}&created=1`;
  } catch { modalError.textContent = 'Could not connect.'; modalError.hidden = false; }
  finally { modalSubmit.disabled = false; modalSubmit.textContent = orig; }
});

// Client project modal
newCpBtn.addEventListener('click', () => { cpCreateForm.reset(); cpModalError.hidden = true; cpFieldYear.value = new Date().getFullYear(); cpModalOverlay.hidden = false; document.body.style.overflow = 'hidden'; cpFieldTitle.focus(); });
cpModalClose.addEventListener('click', closeCpModal);
cpModalCancel.addEventListener('click', closeCpModal);
cpModalOverlay.addEventListener('click', e => { if (e.target === cpModalOverlay) closeCpModal(); });
cpFieldTitle.addEventListener('input', () => { cpFieldSlug.value = slugify(cpFieldTitle.value); });
function closeCpModal() { cpModalOverlay.hidden = true; document.body.style.overflow = ''; cpModalError.hidden = true; cpCreateForm.reset(); }
cpCreateForm.addEventListener('submit', async e => {
  e.preventDefault(); cpModalError.hidden = true;
  const p = { title: cpFieldTitle.value.trim(), slug: cpFieldSlug.value.trim(), location: cpFieldLocation.value.trim(), year: Number(cpFieldYear.value), description: cpFieldDesc.value.trim(), services: [] };
  if (!p.title || !p.slug || !p.location || !p.year || !p.description) { cpModalError.textContent = 'All fields are required.'; cpModalError.hidden = false; return; }
  const orig = cpModalSubmit.textContent; cpModalSubmit.disabled = true; cpModalSubmit.textContent = 'Creating…';
  try {
    const res = await fetch('/api/admin/client-projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(p) });
    const b   = await res.json().catch(() => ({}));
    if (!res.ok) { cpModalError.textContent = b.error || 'Could not create.'; cpModalError.hidden = false; return; }
    window.location.href = `/admin/client-project?id=${b.project.id}&created=1`;
  } catch { cpModalError.textContent = 'Could not connect.'; cpModalError.hidden = false; }
  finally { cpModalSubmit.disabled = false; cpModalSubmit.textContent = orig; }
});

// Confirm delete
function openConfirm(type, idOrSlug, title) { pendingDelete = { type, idOrSlug }; confirmBody.textContent = `Remove "${title}"?`; confirmError.hidden = true; confirmOverlay.hidden = false; document.body.style.overflow = 'hidden'; confirmDelete.focus(); }
function closeConfirm() { confirmOverlay.hidden = true; document.body.style.overflow = ''; pendingDelete = null; }
confirmClose.addEventListener('click', closeConfirm);
confirmCancel.addEventListener('click', closeConfirm);
confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) closeConfirm(); });
confirmDelete.addEventListener('click', async () => {
  if (!pendingDelete) return;
  const { type, idOrSlug } = pendingDelete;
  const orig = confirmDelete.textContent; confirmDelete.disabled = true; confirmDelete.textContent = 'Deleting…'; confirmError.hidden = true;
  try {
    const url = type === 'portfolio' ? `/api/admin/projects/${idOrSlug}` : `/api/admin/client-projects/${idOrSlug}`;
    const res = await fetch(url, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const b   = await res.json().catch(() => ({}));
    if (!res.ok) { confirmError.textContent = b.error || 'Could not delete.'; confirmError.hidden = false; return; }
    closeConfirm();
    if (type === 'portfolio') await loadPortfolioProjects(); else await loadClientProjects();
  } catch { confirmError.textContent = 'Could not connect.'; confirmError.hidden = false; }
  finally { confirmDelete.disabled = false; confirmDelete.textContent = orig; }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!modalOverlay.hidden) closePfModal();
  if (!cpModalOverlay.hidden) closeCpModal();
  if (!confirmOverlay.hidden) closeConfirm();
});

function slugify(t) { return t.toString().toLowerCase().trim().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
