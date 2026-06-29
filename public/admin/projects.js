/* /admin/projects.js -- Chunk 9 update: status badges on client tab, Clients + Team nav links */
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
const CP_STATUS_CLASS = { Booked:'gold', Filming:'gold', Editing:'gold', Delivered:'green', Archived:'neutral' };

let portfolioProjects = [];
let clientProjects    = [];
let clientsLoaded     = false;
let pendingDelete     = null;

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9\s-]/g,'').trim().replace(/\s+/g,'-').replace(/-+/g,'-'); }

(async () => {
  try {
    const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    if (!me.ok) { window.location.href = '/admin/login'; return; }
    const meData = await me.json();
    if (meData.user.role === 'super_admin') {
      const navTeam = document.getElementById('nav-team');
      if (navTeam) navTeam.hidden = false;
    }
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
  panelPortfolio.hidden = !isPf;
  panelClients.hidden   = isPf;
  if (!isPf && !clientsLoaded) loadClientProjects();
}

// -- Portfolio --

async function loadPortfolioProjects() {
  projectsLoading.hidden = false; projectsError.hidden = true; projectsTableWrap.hidden = true; projectsEmpty.hidden = true;
  try {
    const res  = await fetch('/api/admin/projects', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    portfolioProjects = body?.projects || [];
    projectsLoading.hidden = true;
    if (!portfolioProjects.length) { projectsEmpty.hidden = false; return; }
    projectsTbody.innerHTML = portfolioProjects.map(p => `
      <tr class="projects__row">
        <td class="projects__td projects__td--title">
          <a class="projects__title" href="/admin/project?slug=${esc(p.slug)}">${esc(p.title)}</a>
          <span class="projects__slug">${esc(p.slug)}</span>
        </td>
        <td class="projects__td">${esc(p.slug)}</td>
        <td class="projects__td projects__td--meta">${esc(p.location)}</td>
        <td class="projects__td projects__td--order">${p.order ?? '-'}</td>
        <td class="projects__td projects__td--actions">
          <a class="projects__action" href="/admin/project?slug=${esc(p.slug)}">Edit</a>
          <button class="projects__action projects__action--danger"
                  data-slug="${esc(p.slug)}" data-title="${esc(p.title)}" type="button">Delete</button>
        </td>
      </tr>`).join('');
    projectsTbody.querySelectorAll('.projects__action--danger').forEach(btn => {
      btn.addEventListener('click', () => openConfirm(btn.dataset.slug, btn.dataset.title, 'portfolio'));
    });
    projectsTableWrap.hidden = false;
  } catch { projectsLoading.hidden = true; projectsError.textContent = 'Could not load projects.'; projectsError.hidden = false; }
}

// -- Client projects --

async function loadClientProjects() {
  clientsLoaded = true;
  cpLoading.hidden = false; cpError.hidden = true; cpTableWrap.hidden = true; cpEmpty.hidden = true;
  try {
    const res  = await fetch('/api/admin/client-projects', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    clientProjects = body?.projects || [];
    cpLoading.hidden = true;
    if (!clientProjects.length) { cpEmpty.hidden = false; return; }
    cpTbody.innerHTML = clientProjects.map(p => {
      const status = p.status || 'Booked';
      const cls = CP_STATUS_CLASS[status] || 'gold';
      return `<tr class="projects__row">
        <td class="projects__td projects__td--title">
          <a class="projects__title" href="/admin/client-project?id=${p.id}">${esc(p.title)}</a>
        </td>
        <td class="projects__td projects__td--meta">${esc(p.location)}</td>
        <td class="projects__td projects__td--meta">${p.year}</td>
        <td class="projects__td projects__td--meta">
          <span class="dash__badge dash__badge--${cls}">${esc(status)}</span>
        </td>
        <td class="projects__td projects__td--actions">
          <a class="projects__action" href="/admin/client-project?id=${p.id}">Edit</a>
          <button class="projects__action projects__action--danger"
                  data-id="${p.id}" data-title="${esc(p.title)}" type="button">Delete</button>
        </td>
      </tr>`;
    }).join('');
    cpTbody.querySelectorAll('.projects__action--danger').forEach(btn => {
      btn.addEventListener('click', () => openConfirm(btn.dataset.id, btn.dataset.title, 'client'));
    });
    cpTableWrap.hidden = false;
  } catch { cpLoading.hidden = true; cpError.textContent = 'Could not load projects.'; cpError.hidden = false; }
}

// -- Portfolio modal --

newProjectBtn.addEventListener('click', () => { createForm.reset(); fieldSlug.value = ''; modalError.hidden = true; modalOverlay.hidden = false; fieldTitle.focus(); });
modalClose.addEventListener('click',  () => { modalOverlay.hidden = true; });
modalCancel.addEventListener('click', () => { modalOverlay.hidden = true; });
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.hidden = true; });

fieldTitle.addEventListener('input', () => { fieldSlug.value = slugify(fieldTitle.value); });

createForm.addEventListener('submit', async e => {
  e.preventDefault(); modalError.hidden = true;
  const payload = { title: fieldTitle.value.trim(), slug: fieldSlug.value.trim(), location: fieldLocation.value.trim(), year: Number(fieldYear.value), description: fieldDescription.value.trim() };
  if (!payload.title || !payload.slug || !payload.location || !payload.year) { modalError.textContent = 'All fields except description are required.'; modalError.hidden = false; return; }
  const orig = modalSubmit.textContent; modalSubmit.disabled = true; modalSubmit.textContent = 'Creating...';
  try {
    const res  = await fetch('/api/admin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { modalError.textContent = body.error || 'Could not create project.'; modalError.hidden = false; return; }
    modalOverlay.hidden = true;
    window.location.href = `/admin/project?slug=${payload.slug}`;
  } catch { modalError.textContent = 'Could not connect.'; modalError.hidden = false; }
  finally { modalSubmit.disabled = false; modalSubmit.textContent = orig; }
});

// -- Client project modal --

newCpBtn.addEventListener('click', () => { cpCreateForm.reset(); cpFieldSlug.value = ''; cpModalError.hidden = true; cpModalOverlay.hidden = false; cpFieldTitle.focus(); });
cpModalClose.addEventListener('click',  () => { cpModalOverlay.hidden = true; });
cpModalCancel.addEventListener('click', () => { cpModalOverlay.hidden = true; });
cpModalOverlay.addEventListener('click', e => { if (e.target === cpModalOverlay) cpModalOverlay.hidden = true; });

cpFieldTitle.addEventListener('input', () => { cpFieldSlug.value = slugify(cpFieldTitle.value); });

cpCreateForm.addEventListener('submit', async e => {
  e.preventDefault(); cpModalError.hidden = true;
  const payload = { title: cpFieldTitle.value.trim(), slug: cpFieldSlug.value.trim(), location: cpFieldLocation.value.trim(), year: Number(cpFieldYear.value), description: cpFieldDesc.value.trim() };
  if (!payload.title || !payload.slug || !payload.location || !payload.year || !payload.description) { cpModalError.textContent = 'All fields are required.'; cpModalError.hidden = false; return; }
  const orig = cpModalSubmit.textContent; cpModalSubmit.disabled = true; cpModalSubmit.textContent = 'Creating...';
  try {
    const res  = await fetch('/api/admin/client-projects', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { cpModalError.textContent = body.error || 'Could not create project.'; cpModalError.hidden = false; return; }
    cpModalOverlay.hidden = true;
    window.location.href = `/admin/client-project?id=${body.project?.id || body.id}`;
  } catch { cpModalError.textContent = 'Could not connect.'; cpModalError.hidden = false; }
  finally { cpModalSubmit.disabled = false; cpModalSubmit.textContent = orig; }
});

// -- Delete confirm --

let deleteType = null;

function openConfirm(key, title, type) {
  pendingDelete = key; deleteType = type;
  confirmBody.textContent = `Delete "${title}"? This cannot be undone.`;
  confirmError.hidden = true;
  confirmOverlay.hidden = false;
}

confirmClose.addEventListener('click',  () => { confirmOverlay.hidden = true; });
confirmCancel.addEventListener('click', () => { confirmOverlay.hidden = true; });
confirmOverlay.addEventListener('click', e => { if (e.target === confirmOverlay) confirmOverlay.hidden = true; });

confirmDelete.addEventListener('click', async () => {
  if (!pendingDelete) return;
  confirmError.hidden = true;
  const orig = confirmDelete.textContent; confirmDelete.disabled = true; confirmDelete.textContent = 'Deleting...';
  try {
    const url = deleteType === 'portfolio' ? `/api/admin/projects/${pendingDelete}` : `/api/admin/client-projects/${pendingDelete}`;
    const res  = await fetch(url, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { confirmError.textContent = body.error || 'Could not delete.'; confirmError.hidden = false; return; }
    confirmOverlay.hidden = true;
    if (deleteType === 'portfolio') { portfolioProjects = portfolioProjects.filter(p => p.slug !== pendingDelete); await loadPortfolioProjects(); }
    else { clientProjects = clientProjects.filter(p => String(p.id) !== String(pendingDelete)); await loadClientProjects(); }
  } catch { confirmError.textContent = 'Could not connect.'; confirmError.hidden = false; }
  finally { confirmDelete.disabled = false; confirmDelete.textContent = orig; }
});
