/* ============================================================
   /admin/project.js — Chunk 6d
   Project edit page: details + images + originals + client access.
   ============================================================ */

// ── DOM refs ──────────────────────────────────────────────────

const logoutBtn          = document.getElementById('logout-btn');
const pageLoading        = document.getElementById('page-loading');
const pageError          = document.getElementById('page-error');
const pageErrorMsg       = document.getElementById('page-error-msg');
const pageContent        = document.getElementById('page-content');
const pageTitle          = document.getElementById('page-title');
const createdBanner      = document.getElementById('created-banner');
const pageSaveError      = document.getElementById('page-save-error');
const pageSaveSuccess    = document.getElementById('page-save-success');
const projectForm        = document.getElementById('project-form');
const saveDetailsBtn     = document.getElementById('save-details-btn');

// Metadata fields
const fieldTitle         = document.getElementById('field-title');
const fieldSlug          = document.getElementById('field-slug');
const fieldLocation      = document.getElementById('field-location');
const fieldYear          = document.getElementById('field-year');
const fieldOrder         = document.getElementById('field-order');
const fieldDescription   = document.getElementById('field-description');
const fieldYoutube       = document.getElementById('field-youtube');
const fieldFeatured      = document.getElementById('field-featured');
const serviceCheckboxes  = projectForm.querySelectorAll('input[name="services"]');

// WebP image upload
const uploadZone         = document.getElementById('upload-zone');
const uploadInput        = document.getElementById('upload-input');
const uploadProcessing   = document.getElementById('upload-processing');
const uploadPreviews     = document.getElementById('upload-previews');
const uploadList         = document.getElementById('upload-list');
const uploadSaveBtn      = document.getElementById('upload-save-btn');
const imagesError        = document.getElementById('images-error');
const imagesSuccess      = document.getElementById('images-success');
const existingImagesWrap    = document.getElementById('existing-images-wrap');
const existingImagesContent = document.getElementById('existing-images-content');

// Originals upload
const originalsZone      = document.getElementById('originals-zone');
const originalsInput     = document.getElementById('originals-input');
const originalsProcessing= document.getElementById('originals-processing');
const originalsPreviews  = document.getElementById('originals-previews');
const originalsList      = document.getElementById('originals-list');
const originalsSaveBtn   = document.getElementById('originals-save-btn');
const originalsError     = document.getElementById('originals-error');
const originalsSuccess   = document.getElementById('originals-success');
const existingOriginalsWrap    = document.getElementById('existing-originals-wrap');
const existingOriginalsContent = document.getElementById('existing-originals-content');

// Client access
const inviteForm         = document.getElementById('invite-form');
const inviteName         = document.getElementById('invite-name');
const inviteEmail        = document.getElementById('invite-email');
const inviteSubmit       = document.getElementById('invite-submit');
const inviteError        = document.getElementById('invite-error');
const inviteSuccess      = document.getElementById('invite-success');
const clientsWrap        = document.getElementById('clients-wrap');
const clientsList        = document.getElementById('clients-list');
const clientsEmpty       = document.getElementById('clients-empty');


// ── State ─────────────────────────────────────────────────────

let currentSlug      = '';
let currentProject   = null;
let pendingImages    = [];
let pendingOriginals = [];  // [{ file, name }]
let existingImages   = null;
let dragSrcIndex     = null;
let existingDragIdx  = null;

const MAX_WIDTH    = 1800;
const WEBP_QUALITY = 0.85;

const SERVICE_LABELS = {
  hdr:       'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:   'AI Staging',
};


// ── Three-tab page switching ─────────────────────────────────

const tabDetails   = document.getElementById('tab-details');
const tabImages    = document.getElementById('tab-images');
const tabOriginals = document.getElementById('tab-originals');
const panelDetails   = document.getElementById('panel-details');
const panelImages    = document.getElementById('panel-images');
const panelOriginals = document.getElementById('panel-originals');

const allTabs   = [tabDetails, tabImages, tabOriginals];
const allPanels = [panelDetails, panelImages, panelOriginals];

function switchTab(activeTab) {
  allTabs.forEach(t => {
    const isActive = t === activeTab;
    t.classList.toggle('project-edit__tab--active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  allPanels.forEach((p, i) => {
    p.hidden = allTabs[i] !== activeTab;
  });
}

tabDetails.addEventListener('click',   () => switchTab(tabDetails));
tabImages.addEventListener('click',    () => switchTab(tabImages));
tabOriginals.addEventListener('click', () => switchTab(tabOriginals));


// ── Init ──────────────────────────────────────────────────────

(async function init() {
  const params = new URLSearchParams(window.location.search);
  currentSlug  = params.get('slug') || '';

  if (!currentSlug) { showPageError('No project specified.'); return; }

  try {
    const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    if (!me.ok) { window.location.href = '/admin/login'; return; }
  } catch { window.location.href = '/admin/login'; return; }

  try {
    const res  = await fetch('/api/admin/projects', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) { showPageError('Could not load projects.'); return; }

    const project = (body.projects || []).find(p => p.slug === currentSlug);
    if (!project) { showPageError('Project not found.'); return; }

    currentProject = project;
    populateForm(project);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('created')) {
      createdBanner.hidden = false;
      window.history.replaceState({}, '', `/admin/project?slug=${currentSlug}`);
    }

    pageLoading.hidden = true;
    pageContent.hidden = false;

    // Load clients and originals in parallel
    await Promise.all([loadClients(), loadOriginals()]);

  } catch (err) {
    console.error('Load project error:', err);
    showPageError('Could not connect. Check your connection and try again.');
  }
})();


// ── Log out ───────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* continue */ }
  finally { window.location.href = '/admin/login'; }
});


// ── Populate form ─────────────────────────────────────────────

function populateForm(project) {
  pageTitle.textContent   = project.title;
  fieldTitle.value        = project.title;
  fieldSlug.value         = project.slug;
  fieldLocation.value     = project.location;
  fieldYear.value         = project.year;
  fieldOrder.value        = project.order;
  fieldDescription.value  = project.description;
  fieldYoutube.value      = project.youtube_id || '';
  fieldFeatured.checked   = Boolean(project.featured);
  serviceCheckboxes.forEach(cb => {
    cb.checked = Array.isArray(project.services) && project.services.includes(cb.value);
  });
  renderExistingImages(project);
}


// ── Metadata save ─────────────────────────────────────────────

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearPageMessages();

  const services  = Array.from(serviceCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
  const youtubeId = fieldYoutube.value.trim();

  const payload = {
    title:       fieldTitle.value.trim(),
    slug:        fieldSlug.value.trim(),
    location:    fieldLocation.value.trim(),
    year:        Number(fieldYear.value),
    description: fieldDescription.value.trim(),
    services,
    featured:    fieldFeatured.checked,
    order:       Number(fieldOrder.value) || 1,
    youtube_id:  youtubeId,
  };

  if (!payload.title)       { showPageError('Title is required.');       return; }
  if (!payload.slug)        { showPageError('Slug is required.');        return; }
  if (!payload.location)    { showPageError('Location is required.');    return; }
  if (!payload.year)        { showPageError('Year is required.');        return; }
  if (!payload.description) { showPageError('Description is required.'); return; }

  const originalLabel      = saveDetailsBtn.textContent;
  saveDetailsBtn.disabled  = true;
  saveDetailsBtn.textContent = 'Saving…';

  try {
    const res  = await fetch(`/api/admin/projects/${currentSlug}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showPageError(body.error || 'Could not save project.'); return; }

    const newSlug = body.project?.slug || payload.slug;
    if (newSlug !== currentSlug) {
      currentSlug = newSlug;
      window.history.replaceState({}, '', `/admin/project?slug=${currentSlug}`);
    }
    currentProject = body.project || { ...currentProject, ...payload };
    pageTitle.textContent = currentProject.title;
    showPageSuccess('Details saved.');
  } catch (err) {
    console.error('Save details error:', err);
    showPageError('Could not connect. Check your connection and try again.');
  } finally {
    saveDetailsBtn.disabled    = false;
    saveDetailsBtn.textContent = originalLabel;
  }
});


// ── WebP image upload ─────────────────────────────────────────

uploadZone.addEventListener('click', () => uploadInput.click());
uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') uploadInput.click(); });
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('upload__zone--drag'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('upload__zone--drag'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('upload__zone--drag');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  if (files.length) processImageFiles(files);
});
uploadInput.addEventListener('change', () => {
  if (uploadInput.files.length) processImageFiles(Array.from(uploadInput.files));
  uploadInput.value = '';
});

async function processImageFiles(files) {
  if (pendingImages.length + files.length > 20) { showImagesError('Maximum 20 images per upload.'); return; }
  uploadZone.style.pointerEvents = 'none';
  uploadProcessing.hidden = false;
  for (const file of files) {
    try { pendingImages.push(await resizeToWebP(file)); }
    catch (err) { console.error('Image processing error:', file.name, err); showImagesError(`Could not process ${file.name}.`); }
  }
  uploadProcessing.hidden = true;
  uploadZone.style.pointerEvents = '';
  assignFilenames();
  renderPendingPreviews();
}

function resizeToWebP(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_WIDTH) { height = Math.round(height * MAX_WIDTH / width); width = MAX_WIDTH; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('toBlob failed')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, blob, originalName: file.name });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/webp', WEBP_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
    img.src = url;
  });
}

function assignFilenames() {
  pendingImages.forEach((img, i) => {
    img.filename = i === 0 ? 'hero.webp' : String(i).padStart(2, '0') + '.webp';
  });
}

function renderPendingPreviews() {
  if (pendingImages.length === 0) { uploadPreviews.hidden = true; uploadList.innerHTML = ''; return; }
  uploadPreviews.hidden = false;
  uploadList.innerHTML  = '';
  pendingImages.forEach((img, i) => {
    const li = document.createElement('li');
    li.className = 'upload__item'; li.draggable = true; li.dataset.index = i;
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
      <button class="upload__remove" type="button" data-index="${i}" aria-label="Remove">&#215;</button>
    `;
    li.addEventListener('dragstart', (e) => { dragSrcIndex = i; li.classList.add('upload__item--dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend',   () => { li.classList.remove('upload__item--dragging'); dragSrcIndex = null; uploadList.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); });
    li.addEventListener('dragover',  (e) => { e.preventDefault(); uploadList.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); li.classList.add('upload__item--over'); });
    li.addEventListener('drop',      (e) => { e.preventDefault(); if (dragSrcIndex === null || dragSrcIndex === i) return; const moved = pendingImages.splice(dragSrcIndex, 1)[0]; pendingImages.splice(i, 0, moved); assignFilenames(); renderPendingPreviews(); });
    uploadList.appendChild(li);
  });
  uploadList.addEventListener('click', (e) => {
    const btn = e.target.closest('.upload__remove');
    if (!btn) return;
    pendingImages.splice(Number(btn.dataset.index), 1);
    assignFilenames(); renderPendingPreviews();
  });
}

uploadSaveBtn.addEventListener('click', async () => {
  if (pendingImages.length === 0) return;
  clearImagesMessages();
  const originalLabel      = uploadSaveBtn.textContent;
  uploadSaveBtn.disabled   = true;
  uploadSaveBtn.textContent = 'Uploading…';
  try {
    const res  = await fetch(`/api/admin/projects/${currentSlug}/images`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ images: pendingImages.map(img => ({ filename: img.filename, data: img.dataUrl })) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showImagesError(body.error || 'Could not upload images.'); return; }
    if (currentProject) { currentProject.hero_image = body.hero_image || currentProject.hero_image; currentProject.gallery = body.gallery || currentProject.gallery; }
    pendingImages = []; renderPendingPreviews(); renderExistingImages(currentProject);
    showImagesSuccess(`${body.uploaded} image${body.uploaded > 1 ? 's' : ''} uploaded.`);
  } catch (err) { console.error('Upload error:', err); showImagesError('Could not connect. Try again.'); }
  finally { uploadSaveBtn.disabled = false; uploadSaveBtn.textContent = originalLabel; }
});

function renderExistingImages(project) {
  if (!project || !project.hero_image) { existingImagesWrap.hidden = true; existingImages = null; return; }
  const gallery = Array.isArray(project.gallery) ? project.gallery : [];
  existingImages = [project.hero_image, ...gallery].map(url => ({ url }));
  existingImagesWrap.hidden = false;
  existingImagesContent.innerHTML = '';
  const list = document.createElement('ul');
  list.className = 'upload__list';
  existingImagesContent.appendChild(list);
  existingImages.forEach((img, i) => {
    const label = i === 0 ? 'Hero' : `Gallery ${i}`;
    const li = document.createElement('li');
    li.className = 'upload__item'; li.draggable = true; li.dataset.index = i;
    li.innerHTML = `
      <span class="upload__drag-handle" aria-hidden="true">⠿</span>
      <img class="upload__thumb" src="${escHtml(img.url)}" alt="${label}">
      <span class="upload__item-meta">
        <span class="upload__item-label">${label}</span>
        <span class="upload__item-name upload__item-name--url">${escHtml(img.url.split('/').pop())}</span>
      </span>
      <button class="upload__remove" type="button" data-index="${i}" aria-label="Remove">&#215;</button>
    `;
    li.addEventListener('dragstart', (e) => { existingDragIdx = i; li.classList.add('upload__item--dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend',   () => { li.classList.remove('upload__item--dragging'); existingDragIdx = null; list.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); });
    li.addEventListener('dragover',  (e) => { e.preventDefault(); list.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); li.classList.add('upload__item--over'); });
    li.addEventListener('drop',      (e) => { e.preventDefault(); if (existingDragIdx === null || existingDragIdx === i) return; const moved = existingImages.splice(existingDragIdx, 1)[0]; existingImages.splice(i, 0, moved); saveExistingImageOrder(); });
    list.appendChild(li);
  });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.upload__remove');
    if (!btn) return;
    existingImages.splice(Number(btn.dataset.index), 1);
    saveExistingImageOrder();
  });
}

async function saveExistingImageOrder() {
  clearImagesMessages();
  const heroImage = existingImages[0]?.url || '';
  const gallery   = existingImages.slice(1).map(img => img.url);
  try {
    const res  = await fetch(`/api/admin/projects/${currentSlug}/images/order`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ hero_image: heroImage, gallery }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showImagesError(body.error || 'Could not update image order.'); renderExistingImages(currentProject); return; }
    if (currentProject) { currentProject.hero_image = heroImage; currentProject.gallery = gallery; }
    renderExistingImages(currentProject);
    showImagesSuccess('Image order saved.');
  } catch (err) { console.error('Reorder error:', err); showImagesError('Could not connect.'); renderExistingImages(currentProject); }
}


// ── Originals upload ──────────────────────────────────────────

originalsZone.addEventListener('click', () => originalsInput.click());
originalsZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') originalsInput.click(); });
originalsZone.addEventListener('dragover', (e) => { e.preventDefault(); originalsZone.classList.add('upload__zone--drag'); });
originalsZone.addEventListener('dragleave', () => originalsZone.classList.remove('upload__zone--drag'));
originalsZone.addEventListener('drop', (e) => {
  e.preventDefault();
  originalsZone.classList.remove('upload__zone--drag');
  if (e.dataTransfer.files.length) queueOriginals(Array.from(e.dataTransfer.files));
});
originalsInput.addEventListener('change', () => {
  if (originalsInput.files.length) queueOriginals(Array.from(originalsInput.files));
  originalsInput.value = '';
});

function queueOriginals(files) {
  if (pendingOriginals.length + files.length > 50) { showOriginalsError('Maximum 50 files per upload.'); return; }
  files.forEach(file => pendingOriginals.push({ file, name: file.name }));
  renderOriginalsPreviews();
}

function renderOriginalsPreviews() {
  if (pendingOriginals.length === 0) { originalsPreviews.hidden = true; originalsList.innerHTML = ''; return; }
  originalsPreviews.hidden = false;
  originalsList.innerHTML  = '';
  pendingOriginals.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'upload__item';
    const mb = (item.file.size / (1024 * 1024)).toFixed(1);
    li.innerHTML = `
      <span class="upload__file-icon" aria-hidden="true">⬜</span>
      <span class="upload__item-meta">
        <span class="upload__item-name">${escHtml(item.name)}</span>
        <span class="upload__item-size">${mb} MB</span>
      </span>
      <button class="upload__remove" type="button" data-index="${i}" aria-label="Remove">&#215;</button>
    `;
    originalsList.appendChild(li);
  });
  originalsList.addEventListener('click', (e) => {
    const btn = e.target.closest('.upload__remove');
    if (!btn) return;
    pendingOriginals.splice(Number(btn.dataset.index), 1);
    renderOriginalsPreviews();
  });
}

originalsSaveBtn.addEventListener('click', async () => {
  if (pendingOriginals.length === 0) return;
  clearOriginalsMessages();

  const originalLabel         = originalsSaveBtn.textContent;
  originalsSaveBtn.disabled   = true;
  originalsSaveBtn.textContent = 'Uploading…';
  originalsProcessing.hidden  = false;

  try {
    // Upload files one at a time via multipart — Workers support up to 128MB
    let uploadedCount = 0;
    for (const item of pendingOriginals) {
      const formData = new FormData();
      formData.append('file', item.file, item.name);

      const res = await fetch(`/api/admin/projects/${currentSlug}/originals`, {
        method: 'POST',
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showOriginalsError(body.error || `Could not upload ${item.name}.`);
        break;
      }
      uploadedCount++;
    }

    pendingOriginals = [];
    renderOriginalsPreviews();
    await loadOriginals();
    if (uploadedCount > 0) showOriginalsSuccess(`${uploadedCount} file${uploadedCount > 1 ? 's' : ''} uploaded.`);

  } catch (err) {
    console.error('Originals upload error:', err);
    showOriginalsError('Could not connect. Try again.');
  } finally {
    originalsSaveBtn.disabled    = false;
    originalsSaveBtn.textContent = originalLabel;
    originalsProcessing.hidden   = true;
  }
});

async function loadOriginals() {
  try {
    const res  = await fetch(`/api/admin/projects/${currentSlug}/originals`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    const files = body.files || [];

    if (files.length === 0) { existingOriginalsWrap.hidden = true; return; }

    existingOriginalsWrap.hidden = false;
    existingOriginalsContent.innerHTML = '';

    const list = document.createElement('ul');
    list.className = 'upload__list upload__list--files';

    files.forEach(f => {
      const li = document.createElement('li');
      li.className = 'upload__item';
      const mb = f.size ? (f.size / (1024 * 1024)).toFixed(1) + ' MB' : '';
      li.innerHTML = `
        <span class="upload__file-icon" aria-hidden="true">⬜</span>
        <span class="upload__item-meta">
          <span class="upload__item-name">${escHtml(f.name)}</span>
          ${mb ? `<span class="upload__item-size">${mb}</span>` : ''}
        </span>
        <button class="upload__remove upload__remove--original" type="button"
                data-key="${escHtml(f.key)}" aria-label="Delete ${escHtml(f.name)}">&#215;</button>
      `;
      list.appendChild(li);
    });

    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.upload__remove--original');
      if (!btn) return;
      const key = btn.dataset.key;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/admin/projects/${currentSlug}/originals`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ key }),
        });
        if (res.ok) await loadOriginals();
        else btn.disabled = false;
      } catch { btn.disabled = false; }
    });

    existingOriginalsContent.appendChild(list);
  } catch (err) {
    console.error('Load originals error:', err);
  }
}


// ── Client access ─────────────────────────────────────────────

async function loadClients() {
  try {
    const res  = await fetch('/api/admin/clients', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) return;

    // Filter to clients who have access to this project
    const projectClients = (body.clients || []).filter(c =>
      c.projects.some(p => p.slug === currentSlug)
    );

    clientsWrap.hidden  = projectClients.length === 0;
    clientsEmpty.hidden = projectClients.length > 0;

    if (projectClients.length === 0) return;

    clientsList.innerHTML = '';
    const list = document.createElement('ul');
    list.className = 'upload__list upload__list--files';

    projectClients.forEach(client => {
      const li = document.createElement('li');
      li.className = 'upload__item';
      const lastLogin = client.last_login_at
        ? `Last sign-in ${new Date(client.last_login_at).toLocaleDateString()}`
        : 'Never signed in';

      li.innerHTML = `
        <span class="upload__item-meta">
          <span class="upload__item-label">${escHtml(client.name || '—')}</span>
          <span class="upload__item-name">${escHtml(client.email)}</span>
          <span class="upload__item-size">${lastLogin}</span>
        </span>
        <div class="project-edit__client-actions">
          <button class="projects__action" type="button"
                  data-action="resend" data-user-id="${client.id}">Resend invite</button>
          <button class="projects__action projects__action--danger" type="button"
                  data-action="revoke" data-user-id="${client.id}">Revoke</button>
        </div>
      `;
      list.appendChild(li);
    });

    list.addEventListener('click', async (e) => {
      const btn    = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const userId = Number(btn.dataset.userId);

      if (action === 'resend') {
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/invite/resend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ user_id: userId }),
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok) {
            showInviteSuccess('Invite resent.');
          } else {
            showInviteError(body.error || 'Could not resend invite.');
          }
        } catch { showInviteError('Could not connect. Try again.'); }
        finally { btn.disabled = false; }
      }

      if (action === 'revoke') {
        if (!confirm(`Remove access for this client?`)) return;
        btn.disabled = true;
        try {
          const res = await fetch(`/api/admin/clients/${userId}/access/${currentSlug}`, {
            method: 'DELETE', headers: { Accept: 'application/json' },
          });
          if (res.ok) await loadClients();
          else btn.disabled = false;
        } catch { btn.disabled = false; }
      }
    });

    clientsList.appendChild(list);
  } catch (err) {
    console.error('Load clients error:', err);
  }
}

inviteForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearInviteMessages();

  const name  = inviteName.value.trim();
  const email = inviteEmail.value.trim();

  if (!email) { showInviteError('Email is required.'); return; }

  const originalLabel      = inviteSubmit.textContent;
  inviteSubmit.disabled    = true;
  inviteSubmit.textContent = 'Sending…';

  try {
    const res  = await fetch('/api/admin/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, email, project_slugs: [currentSlug] }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) { showInviteError(body.error || 'Could not send invite.'); return; }

    inviteForm.reset();
    showInviteSuccess('Invite sent.');
    await loadClients();

  } catch (err) {
    console.error('Invite error:', err);
    showInviteError('Could not connect. Try again.');
  } finally {
    inviteSubmit.disabled    = false;
    inviteSubmit.textContent = originalLabel;
  }
});


// ── Message helpers ───────────────────────────────────────────

function showPageError(message) {
  pageLoading.hidden       = true;
  pageError.hidden         = false;
  pageContent.hidden       = true;
  pageErrorMsg.textContent = message;
}
function showPageSuccess(msg) { pageSaveSuccess.textContent = msg; pageSaveSuccess.hidden = false; pageSaveError.hidden = true; setTimeout(() => pageSaveSuccess.hidden = true, 5000); }
function clearPageMessages() { pageSaveError.hidden = true; pageSaveSuccess.hidden = true; }

function showImagesError(msg)   { imagesError.textContent = msg; imagesError.hidden = false; imagesSuccess.hidden = true; }
function showImagesSuccess(msg) { imagesSuccess.textContent = msg; imagesSuccess.hidden = false; imagesError.hidden = true; setTimeout(() => imagesSuccess.hidden = true, 5000); }
function clearImagesMessages()  { imagesError.hidden = true; imagesSuccess.hidden = true; }

function showOriginalsError(msg)   { originalsError.textContent = msg; originalsError.hidden = false; originalsSuccess.hidden = true; }
function showOriginalsSuccess(msg) { originalsSuccess.textContent = msg; originalsSuccess.hidden = false; originalsError.hidden = true; setTimeout(() => originalsSuccess.hidden = true, 5000); }
function clearOriginalsMessages()  { originalsError.hidden = true; originalsSuccess.hidden = true; }

function showInviteError(msg)   { inviteError.textContent = msg; inviteError.hidden = false; inviteSuccess.hidden = true; }
function showInviteSuccess(msg) { inviteSuccess.textContent = msg; inviteSuccess.hidden = false; inviteError.hidden = true; setTimeout(() => inviteSuccess.hidden = true, 5000); }
function clearInviteMessages()  { inviteError.hidden = true; inviteSuccess.hidden = true; }

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
