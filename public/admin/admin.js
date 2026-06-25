/* ============================================================
   /admin/admin.js
   Chunk 5a — project list, new/edit/delete CRUD.
   Auth gate pattern matches account.js (chunk 4b).
   ============================================================ */

// ── DOM refs ──────────────────────────────────────────────────

const loadingEl        = document.getElementById('admin-loading');
const authenticatedEl  = document.getElementById('admin-authenticated');
const logoutBtn        = document.getElementById('logout-btn');

const projectsLoading  = document.getElementById('projects-loading');
const projectsError    = document.getElementById('projects-error');
const projectsTableWrap= document.getElementById('projects-table-wrap');
const projectsTbody    = document.getElementById('projects-tbody');
const projectsEmpty    = document.getElementById('projects-empty');
const newProjectBtn    = document.getElementById('new-project-btn');

// Project modal
const modalOverlay     = document.getElementById('modal-overlay');
const modalTitle       = document.getElementById('modal-title');
const modalClose       = document.getElementById('modal-close');
const modalCancel      = document.getElementById('modal-cancel');
const modalError       = document.getElementById('modal-error');
const projectForm      = document.getElementById('project-form');
const modalSubmit      = document.getElementById('modal-submit');
const editingSlugInput = document.getElementById('editing-slug');

// Form fields
const fieldTitle       = document.getElementById('field-title');
const fieldSlug        = document.getElementById('field-slug');
const fieldLocation    = document.getElementById('field-location');
const fieldYear        = document.getElementById('field-year');
const fieldDescription = document.getElementById('field-description');
const fieldOrder       = document.getElementById('field-order');
const fieldFeatured    = document.getElementById('field-featured');
const serviceCheckboxes= projectForm.querySelectorAll('input[name="services"]');

// Delete confirm modal
const confirmOverlay   = document.getElementById('confirm-overlay');
const confirmClose     = document.getElementById('confirm-close');
const confirmCancel    = document.getElementById('confirm-cancel');
const confirmDelete    = document.getElementById('confirm-delete');
const confirmBody      = document.getElementById('confirm-body');
const confirmError     = document.getElementById('confirm-error');


// ── State ─────────────────────────────────────────────────────

let projects        = [];     // local cache of projects array
let slugToDelete    = null;   // slug pending deletion confirmation


// ── Auth gate ─────────────────────────────────────────────────

(async function init() {
  try {
    const res  = await fetch('/api/auth/me', { method: 'GET', headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;

    if (!body || !body.user) {
      redirectToLogin();
      return;
    }

    loadingEl.hidden       = true;
    authenticatedEl.hidden = false;

    await loadProjects();

  } catch (err) {
    console.error('Auth check failed:', err);
    redirectToLogin();
  }
})();


// ── Log out ───────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error (continuing):', err);
  } finally {
    window.location.href = '/admin/login';
  }
});


// ── Load & render project list ────────────────────────────────

async function loadProjects() {
  showProjectsState('loading');

  try {
    const res = await fetch('/api/admin/projects', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

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
  if (projects.length === 0) {
    showProjectsState('empty');
    return;
  }

  projectsTbody.innerHTML = '';
  projects.forEach(p => {
    const tr = document.createElement('tr');
    tr.className = 'projects__row';
    tr.dataset.slug = p.slug;

    const services = Array.isArray(p.services) && p.services.length
      ? p.services.map(s => SERVICE_LABELS[s] || s).join(', ')
      : '—';

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
        <button class="projects__action" type="button" data-action="edit" data-slug="${escHtml(p.slug)}">Edit</button>
        <button class="projects__action projects__action--danger" type="button" data-action="delete" data-slug="${escHtml(p.slug)}">Delete</button>
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

  if (state === 'error' && message) {
    projectsError.textContent = message;
  }
}


// ── New project button ────────────────────────────────────────

newProjectBtn.addEventListener('click', () => openModal());


// ── Edit / delete row actions ─────────────────────────────────

document.getElementById('projects-tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const slug   = btn.dataset.slug;
  const action = btn.dataset.action;

  if (action === 'edit') {
    const project = projects.find(p => p.slug === slug);
    if (project) openModal(project);
  }

  if (action === 'delete') {
    openConfirm(slug);
  }
});


// ── Project modal ─────────────────────────────────────────────

function openModal(project) {
  clearModalError();
  projectForm.reset();

  if (project) {
    // Edit mode
    modalTitle.textContent     = 'Edit project';
    modalSubmit.textContent    = 'Save changes';
    editingSlugInput.value     = project.slug;
    fieldTitle.value           = project.title;
    fieldSlug.value            = project.slug;
    fieldLocation.value        = project.location;
    fieldYear.value            = project.year;
    fieldDescription.value     = project.description;
    fieldOrder.value           = project.order;
    fieldFeatured.checked      = Boolean(project.featured);

    serviceCheckboxes.forEach(cb => {
      cb.checked = Array.isArray(project.services) && project.services.includes(cb.value);
    });
  } else {
    // New mode
    modalTitle.textContent     = 'New project';
    modalSubmit.textContent    = 'Save project';
    editingSlugInput.value     = '';
    fieldYear.value            = new Date().getFullYear();
    fieldOrder.value           = projects.length + 1;
    fieldFeatured.checked      = true;
  }

  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  fieldTitle.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = '';
  clearModalError();
  projectForm.reset();
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalOverlay.hidden)   closeModal();
    if (!confirmOverlay.hidden) closeConfirm();
  }
});


// ── Auto-derive slug from title ───────────────────────────────

fieldTitle.addEventListener('input', () => {
  // Only auto-derive when not in edit mode (editing-slug is empty)
  if (editingSlugInput.value) return;
  fieldSlug.value = slugify(fieldTitle.value);
});


// ── Form submit ───────────────────────────────────────────────

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearModalError();

  const editingSlug = editingSlugInput.value.trim();
  const isEdit      = Boolean(editingSlug);

  const services = Array.from(serviceCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  const payload = {
    title:       fieldTitle.value.trim(),
    slug:        fieldSlug.value.trim(),
    location:    fieldLocation.value.trim(),
    year:        Number(fieldYear.value),
    description: fieldDescription.value.trim(),
    services,
    featured:    fieldFeatured.checked,
    order:       Number(fieldOrder.value) || (projects.length + 1),
  };

  // Client-side required check
  if (!payload.title)       { showModalError('Title is required.');       return; }
  if (!payload.slug)        { showModalError('Slug is required.');        return; }
  if (!payload.location)    { showModalError('Location is required.');    return; }
  if (!payload.year)        { showModalError('Year is required.');        return; }
  if (!payload.description) { showModalError('Description is required.'); return; }

  const originalLabel = modalSubmit.textContent;
  modalSubmit.disabled = true;
  modalSubmit.textContent = 'Saving…';

  try {
    const url    = isEdit ? `/api/admin/projects/${editingSlug}` : '/api/admin/projects';
    const method = isEdit ? 'PATCH' : 'POST';

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      showModalError(body.error || 'Could not save project.');
      return;
    }

    closeModal();
    await loadProjects();

  } catch (err) {
    console.error('Save project error:', err);
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
  confirmBody.textContent = project
    ? `Remove "${project.title}" from the site?`
    : 'Remove this project from the site?';
  confirmError.hidden     = true;
  confirmError.textContent= '';
  confirmOverlay.hidden   = false;
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
confirmOverlay.addEventListener('click', (e) => {
  if (e.target === confirmOverlay) closeConfirm();
});

confirmDelete.addEventListener('click', async () => {
  if (!slugToDelete) return;

  const slug                = slugToDelete;
  const originalLabel       = confirmDelete.textContent;
  confirmDelete.disabled    = true;
  confirmDelete.textContent = 'Deleting…';
  confirmError.hidden       = true;

  try {
    const res  = await fetch(`/api/admin/projects/${slug}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      confirmError.textContent = body.error || 'Could not delete project.';
      confirmError.hidden      = false;
      return;
    }

    closeConfirm();
    await loadProjects();

  } catch (err) {
    console.error('Delete project error:', err);
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

function redirectToLogin() {
  window.location.href = '/admin/login';
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SERVICE_LABELS = {
  hdr:       'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:   'AI Staging',
};
