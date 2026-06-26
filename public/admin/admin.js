/* ============================================================
   /admin/admin.js — Chunk 5b
   Project list, new/edit/delete CRUD, image upload with
   client-side Canvas resize to WebP.
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

const modalOverlay      = document.getElementById('modal-overlay');
const modalTitle        = document.getElementById('modal-title');
const modalClose        = document.getElementById('modal-close');
const modalCancel       = document.getElementById('modal-cancel');
const modalError        = document.getElementById('modal-error');
const modalSuccess      = document.getElementById('modal-success');
const projectForm       = document.getElementById('project-form');
const modalSubmit       = document.getElementById('modal-submit');
const editingSlugInput  = document.getElementById('editing-slug');

const fieldTitle        = document.getElementById('field-title');
const fieldSlug         = document.getElementById('field-slug');
const fieldLocation     = document.getElementById('field-location');
const fieldYear         = document.getElementById('field-year');
const fieldDescription  = document.getElementById('field-description');
const fieldOrder        = document.getElementById('field-order');
const fieldFeatured     = document.getElementById('field-featured');
const serviceCheckboxes = projectForm.querySelectorAll('input[name="services"]');

const uploadZone        = document.getElementById('upload-zone');
const uploadInput       = document.getElementById('upload-input');
const uploadProcessing  = document.getElementById('upload-processing');
const uploadPreviews    = document.getElementById('upload-previews');
const uploadList        = document.getElementById('upload-list');
const uploadExisting    = document.getElementById('upload-existing');
const uploadExistingHero= document.getElementById('upload-existing-hero');

const confirmOverlay    = document.getElementById('confirm-overlay');
const confirmClose      = document.getElementById('confirm-close');
const confirmCancel     = document.getElementById('confirm-cancel');
const confirmDelete     = document.getElementById('confirm-delete');
const confirmBody       = document.getElementById('confirm-body');
const confirmError      = document.getElementById('confirm-error');


// ── State ─────────────────────────────────────────────────────

let projects        = [];
let slugToDelete    = null;
// Processed image queue: [{ filename, dataUrl, blob }]
// filename: 'hero.webp' for index 0, '01.webp', '02.webp'... for the rest
let pendingImages   = [];
// Drag-and-drop reorder state
let dragSrcIndex    = null;


// ── Auth gate ─────────────────────────────────────────────────

(async function init() {
  try {
    const res  = await fetch('/api/auth/me', { method: 'GET', headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body || !body.user) { redirectToLogin(); return; }

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
    tr.className  = 'projects__row';
    tr.dataset.slug = p.slug;

    const services = Array.isArray(p.services) && p.services.length
      ? p.services.map(s => SERVICE_LABELS[s] || s).join(', ') : '—';

    const hasImages = p.hero_image ? '✓' : '—';

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
  if (state === 'error' && message) projectsError.textContent = message;
}


// ── New project button ────────────────────────────────────────

newProjectBtn.addEventListener('click', () => openModal());


// ── Row actions ───────────────────────────────────────────────

projectsTbody.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const slug   = btn.dataset.slug;
  const action = btn.dataset.action;
  if (action === 'edit') {
    const project = projects.find(p => p.slug === slug);
    if (project) openModal(project);
  }
  if (action === 'delete') openConfirm(slug);
});


// ── Project modal ─────────────────────────────────────────────

function openModal(project) {
  clearModalMessages();
  projectForm.reset();
  pendingImages = [];
  renderImagePreviews();

  if (project) {
    modalTitle.textContent  = 'Edit project';
    modalSubmit.textContent = 'Save changes';
    editingSlugInput.value  = project.slug;
    fieldTitle.value        = project.title;
    fieldSlug.value         = project.slug;
    fieldLocation.value     = project.location;
    fieldYear.value         = project.year;
    fieldDescription.value  = project.description;
    fieldOrder.value        = project.order;
    fieldFeatured.checked   = Boolean(project.featured);
    serviceCheckboxes.forEach(cb => {
      cb.checked = Array.isArray(project.services) && project.services.includes(cb.value);
    });
    // Show existing images
    showExistingImages(project);
  } else {
    modalTitle.textContent  = 'New project';
    modalSubmit.textContent = 'Save project';
    editingSlugInput.value  = '';
    fieldYear.value         = new Date().getFullYear();
    fieldOrder.value        = projects.length + 1;
    fieldFeatured.checked   = true;
    uploadExisting.hidden   = true;
    uploadExistingHero.innerHTML = '';
  }

  modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
  fieldTitle.focus();
}

function closeModal() {
  modalOverlay.hidden = true;
  document.body.style.overflow = '';
  clearModalMessages();
  projectForm.reset();
  pendingImages = [];
  renderImagePreviews();
}

function showExistingImages(project) {
  if (!project.hero_image) {
    uploadExisting.hidden = true;
    return;
  }
  uploadExisting.hidden = false;
  const galleryCount = Array.isArray(project.gallery) ? project.gallery.length : 0;
  uploadExistingHero.innerHTML = `
    <img class="upload__existing-thumb" src="${escHtml(project.hero_image)}" alt="Current hero image">
    ${galleryCount > 0 ? `<p class="admin__hint">${galleryCount} gallery image${galleryCount > 1 ? 's' : ''} stored.</p>` : ''}
  `;
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!modalOverlay.hidden)   closeModal();
    if (!confirmOverlay.hidden) closeConfirm();
  }
});


// ── Auto-derive slug ──────────────────────────────────────────

fieldTitle.addEventListener('input', () => {
  if (editingSlugInput.value) return;
  fieldSlug.value = slugify(fieldTitle.value);
});


// ── Image upload zone ─────────────────────────────────────────

uploadZone.addEventListener('click', () => uploadInput.click());
uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') uploadInput.click(); });

uploadZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadZone.classList.add('upload__zone--drag');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('upload__zone--drag'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('upload__zone--drag');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) processFiles(files);
});

uploadInput.addEventListener('change', () => {
  const files = Array.from(uploadInput.files);
  if (files.length) processFiles(files);
  uploadInput.value = '';
});


// ── Canvas resize + WebP encode ───────────────────────────────

const MAX_WIDTH    = 1800;
const WEBP_QUALITY = 0.85;

async function processFiles(files) {
  if (pendingImages.length + files.length > 20) {
    showModalError('Maximum 20 images per upload.');
    return;
  }

  uploadProcessing.hidden = false;
  uploadZone.style.pointerEvents = 'none';

  for (const file of files) {
    try {
      const processed = await resizeToWebP(file);
      pendingImages.push(processed);
    } catch (err) {
      console.error('Image processing error:', file.name, err);
      showModalError(`Could not process ${file.name}. Use JPEG or PNG.`);
    }
  }

  uploadProcessing.hidden = true;
  uploadZone.style.pointerEvents = '';
  assignFilenames();
  renderImagePreviews();
}

function resizeToWebP(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_WIDTH) {
        height = Math.round(height * MAX_WIDTH / width);
        width  = MAX_WIDTH;
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, blob, originalName: file.name });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/webp', WEBP_QUALITY);
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

// Assign filenames: first = hero.webp, rest = 01.webp, 02.webp...
function assignFilenames() {
  pendingImages.forEach((img, i) => {
    img.filename = i === 0 ? 'hero.webp' : String(i).padStart(2, '0') + '.webp';
  });
}


// ── Image preview list + drag reorder ────────────────────────

function renderImagePreviews() {
  if (pendingImages.length === 0) {
    uploadPreviews.hidden = true;
    uploadList.innerHTML  = '';
    return;
  }

  uploadPreviews.hidden = false;
  uploadList.innerHTML  = '';

  pendingImages.forEach((img, i) => {
    const li = document.createElement('li');
    li.className      = 'upload__item';
    li.draggable      = true;
    li.dataset.index  = i;

    const label = i === 0 ? 'Hero' : `Gallery ${i}`;
    const kb    = Math.round(img.blob.size / 1024);

    li.innerHTML = `
      <span class="upload__drag-handle" aria-hidden="true">⠿</span>
      <img class="upload__thumb" src="${img.dataUrl}" alt="${escHtml(img.originalName)}">
      <span class="upload__item-meta">
        <span class="upload__item-label">${label}</span>
        <span class="upload__item-name">${escHtml(img.originalName)}</span>
        <span class="upload__item-size">${kb} KB</span>
      </span>
      <button class="upload__remove" type="button" data-index="${i}" aria-label="Remove image">&#215;</button>
    `;

    // Drag events
    li.addEventListener('dragstart', (e) => {
      dragSrcIndex = i;
      li.classList.add('upload__item--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('upload__item--dragging');
      dragSrcIndex = null;
      uploadList.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      uploadList.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over'));
      li.classList.add('upload__item--over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === i) return;
      const moved = pendingImages.splice(dragSrcIndex, 1)[0];
      pendingImages.splice(i, 0, moved);
      assignFilenames();
      renderImagePreviews();
    });

    uploadList.appendChild(li);
  });

  // Remove buttons
  uploadList.addEventListener('click', (e) => {
    const btn = e.target.closest('.upload__remove');
    if (!btn) return;
    const idx = Number(btn.dataset.index);
    pendingImages.splice(idx, 1);
    assignFilenames();
    renderImagePreviews();
  });
}


// ── Form submit ───────────────────────────────────────────────

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearModalMessages();

  const editingSlug = editingSlugInput.value.trim();
  const isEdit      = Boolean(editingSlug);

  const services = Array.from(serviceCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

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

  if (!payload.title)       { showModalError('Title is required.');       return; }
  if (!payload.slug)        { showModalError('Slug is required.');        return; }
  if (!payload.location)    { showModalError('Location is required.');    return; }
  if (!payload.year)        { showModalError('Year is required.');        return; }
  if (!payload.description) { showModalError('Description is required.'); return; }

  const originalLabel     = modalSubmit.textContent;
  modalSubmit.disabled    = true;
  modalSubmit.textContent = 'Saving…';

  try {
    // Step 1: save metadata
    const url    = isEdit ? `/api/admin/projects/${editingSlug}` : '/api/admin/projects';
    const method = isEdit ? 'PATCH' : 'POST';

    const res  = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) { showModalError(body.error || 'Could not save project.'); return; }

    // Determine the slug to use for image upload (may have changed on rename)
    const savedSlug = body.project?.slug || payload.slug;

    // Step 2: upload images if any pending
    if (pendingImages.length > 0) {
      modalSubmit.textContent = 'Uploading images…';

      const images = pendingImages.map(img => ({
        filename: img.filename,
        // Send raw base64 (strip data URI prefix — Worker handles both)
        data:     img.dataUrl,
      }));

      const imgRes  = await fetch(`/api/admin/projects/${savedSlug}/images`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ images }),
      });
      const imgBody = await imgRes.json().catch(() => ({}));

      if (!imgRes.ok) {
        // Metadata saved but images failed — tell the user
        showModalError(imgBody.error || 'Project saved, but images could not be uploaded. Try again from the edit screen.');
        await loadProjects();
        return;
      }
    }

    closeModal();
    await loadProjects();

    // Brief published notice
    projectsError.hidden = true;

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
  const slug = slugToDelete;
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
    await loadProjects();
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
  modalSuccess.hidden    = true;
}

function clearModalMessages() {
  modalError.textContent   = '';
  modalError.hidden        = true;
  modalSuccess.textContent = '';
  modalSuccess.hidden      = true;
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
