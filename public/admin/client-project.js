/* /admin/client-project.js - Chunk 9 update
   Preserves all existing DOM IDs, CSS classes, and fetch patterns.
   Adds: status tracker sidebar, audit trail, video management.
*/

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

const fieldTitle         = document.getElementById('field-title');
const fieldSlug          = document.getElementById('field-slug');
const fieldLocation      = document.getElementById('field-location');
const fieldYear          = document.getElementById('field-year');
const fieldDescription   = document.getElementById('field-description');
const fieldYoutube       = document.getElementById('field-youtube');
const serviceCheckboxes  = projectForm.querySelectorAll('input[name="services"]');

const auditTrailEl       = document.getElementById('audit-trail');

const uploadZone            = document.getElementById('upload-zone');
const uploadInput           = document.getElementById('upload-input');
const uploadProcessing      = document.getElementById('upload-processing');
const uploadPreviews        = document.getElementById('upload-previews');
const uploadList            = document.getElementById('upload-list');
const uploadSaveBtn         = document.getElementById('upload-save-btn');
const imagesError           = document.getElementById('images-error');
const imagesSuccess         = document.getElementById('images-success');
const existingImagesWrap    = document.getElementById('existing-images-wrap');
const existingImagesContent = document.getElementById('existing-images-content');

/* originals removed */

const inviteForm    = document.getElementById('invite-form');
const inviteName    = document.getElementById('invite-name');
const inviteEmail   = document.getElementById('invite-email');
const inviteSubmit  = document.getElementById('invite-submit');
const inviteError   = document.getElementById('invite-error');
const inviteSuccess = document.getElementById('invite-success');
const clientsWrap   = document.getElementById('clients-wrap');
const clientsList   = document.getElementById('clients-list');
const clientsEmpty  = document.getElementById('clients-empty');

// Status sidebar
const statusSelect    = document.getElementById('status-select');
const saveStatusBtn   = document.getElementById('save-status-btn');
const statusError     = document.getElementById('status-error');
const statusSuccess   = document.getElementById('status-success');
const statusStepsEl   = document.getElementById('status-steps');

// Videos
const videosList      = document.getElementById('videos-list');
const videoAddForm    = document.getElementById('video-add-form');
const videoPlatform   = document.getElementById('video-platform');
const videoIdInput    = document.getElementById('video-id-input');
const videoTitleInput = document.getElementById('video-title-input');
const videoAddBtn     = document.getElementById('video-add-btn');
const videosError     = document.getElementById('videos-error');
const videosSuccess   = document.getElementById('videos-success');

let currentId      = null;
let currentProject = null;
let pendingImages  = [];
let pendingVideoFiles = [];
let existingImages = null;
let dragSrcIndex   = null;
let existingDragIdx= null;

const MAX_WIDTH    = 1800;
const WEBP_QUALITY = 0.85;
const CP_STATUSES  = ['Booked', 'Filming', 'Editing', 'Delivered', 'Archived'];
const CP_STATUS_CLASS = { Booked:'gold', Filming:'gold', Editing:'gold', Delivered:'green', Archived:'neutral' };
const PLATFORM_LABELS = { youtube: 'YouTube', reels: 'Reels', tiktok: 'TikTok' };

// -- Three-tab page switching ----------------------------------

const tabDetails     = document.getElementById('tab-details');
const tabImages      = document.getElementById('tab-images');
const panelDetails   = document.getElementById('panel-details');
const panelImages    = document.getElementById('panel-images');

const allTabs   = [tabDetails, tabImages];
const allPanels = [panelDetails, panelImages];

function switchTab(activeTab) {
  allTabs.forEach(t => {
    const isActive = t === activeTab;
    t.classList.toggle('project-edit__tab--active', isActive);
    t.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  allPanels.forEach((p, i) => { p.hidden = allTabs[i] !== activeTab; });
}

tabDetails.addEventListener('click',   () => switchTab(tabDetails));
tabImages.addEventListener('click',    () => switchTab(tabImages));


// -- Init ------------------------------------------------------

(async function init() {
  const params = new URLSearchParams(window.location.search);
  currentId = Number(params.get('id'));
  if (!currentId) { showPageError('No project specified.'); return; }

  try {
    const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    if (!me.ok) { window.location.href = '/admin/login'; return; }
    await me.json();
  } catch { window.location.href = '/admin/login'; return; }

  try {
    const res  = await fetch(`/api/admin/client-projects/${currentId}`, { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body?.project) { showPageError('Project not found.'); return; }

    currentProject = body.project;
    populateForm(currentProject);
    renderStatusSidebar(currentProject.status || 'Booked');
    renderAuditTrail(currentProject);
    renderVideos(currentProject.videos || []);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('created')) {
      createdBanner.hidden = false;
      window.history.replaceState({}, '', `/admin/client-project?id=${currentId}`);
    }

    pageLoading.hidden = true;
    pageContent.hidden = false;

    await Promise.all([loadClients(), loadVideoFiles()]);
  } catch (err) {
    console.error('Load error:', err);
    showPageError('Could not connect.');
  }
})();

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* continue */ }
  finally { window.location.href = '/admin/login'; }
});

function populateForm(p) {
  pageTitle.textContent  = p.title;
  fieldTitle.value       = p.title;
  fieldSlug.value        = p.slug;
  fieldLocation.value    = p.location;
  fieldYear.value        = p.year;
  fieldDescription.value = p.description;
  fieldYoutube.value     = p.youtube_id || '';
  serviceCheckboxes.forEach(cb => { cb.checked = Array.isArray(p.services) && p.services.includes(cb.value); });
  renderExistingImages(p);
}

// -- Status sidebar --------------------------------------------

function renderStatusSidebar(currentStatus) {
  if (!statusStepsEl) return;
  statusStepsEl.innerHTML = CP_STATUSES.map(s => {
    const curIdx  = CP_STATUSES.indexOf(currentStatus);
    const thisIdx = CP_STATUSES.indexOf(s);
    let cls = 'cp9-status-step';
    if (thisIdx < curIdx)  cls += ' cp9-status-step--done';
    if (thisIdx === curIdx) cls += ' cp9-status-step--active';
    return `<div class="${cls}">${s}</div>`;
  }).join('');
  if (statusSelect) statusSelect.value = currentStatus;
}

if (saveStatusBtn) {
  saveStatusBtn.addEventListener('click', async () => {
    statusError.hidden = true; statusSuccess.hidden = true;
    const newStatus = statusSelect.value;
    const orig = saveStatusBtn.textContent; saveStatusBtn.disabled = true; saveStatusBtn.textContent = 'Saving...';
    try {
      const res  = await fetch(`/api/admin/client-projects/${currentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { statusError.textContent = body.error || 'Could not save.'; statusError.hidden = false; return; }
      if (currentProject) currentProject.status = newStatus;
      renderStatusSidebar(newStatus);
      renderAuditTrail(body.project || currentProject);
      statusSuccess.textContent = 'Status updated.'; statusSuccess.hidden = false;
      setTimeout(() => statusSuccess.hidden = true, 4000);
    } catch { statusError.textContent = 'Could not connect.'; statusError.hidden = false; }
    finally { saveStatusBtn.disabled = false; saveStatusBtn.textContent = orig; }
  });
}

// -- Audit trail -----------------------------------------------

function renderAuditTrail(project) {
  if (!auditTrailEl) return;
  if (project && project.last_edited_at) {
    const name = project.last_edited_by_name || 'Admin';
    const when = new Date(project.last_edited_at).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    auditTrailEl.textContent = `Last edited by ${name} on ${when}`;
    auditTrailEl.hidden = false;
  } else {
    auditTrailEl.hidden = true;
  }
}

// -- Details save ----------------------------------------------

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault(); clearPageMessages();
  const services  = Array.from(serviceCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
  const payload   = {
    title: fieldTitle.value.trim(), slug: fieldSlug.value.trim(),
    location: fieldLocation.value.trim(), year: Number(fieldYear.value),
    description: fieldDescription.value.trim(), services,
    youtube_id: fieldYoutube.value.trim(),
  };
  if (!payload.title || !payload.slug || !payload.location || !payload.year || !payload.description) {
    showPageError('All required fields must be filled.'); return;
  }
  const originalLabel = saveDetailsBtn.textContent;
  saveDetailsBtn.disabled = true; saveDetailsBtn.textContent = 'Saving...';
  try {
    const res  = await fetch(`/api/admin/client-projects/${currentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showPageError(body.error || 'Could not save.'); return; }
    currentProject = body.project;
    pageTitle.textContent = currentProject.title;
    renderAuditTrail(currentProject);
    showPageSuccess('Details saved.');
  } catch { showPageError('Could not connect.'); }
  finally { saveDetailsBtn.disabled = false; saveDetailsBtn.textContent = originalLabel; }
});

// -- Videos ----------------------------------------------------

function renderVideos(videos) {
  if (!videosList) return;
  if (!videos.length) {
    videosList.innerHTML = '<p class="cp9-video-empty">No videos added yet.</p>';
    return;
  }
  videosList.innerHTML = videos.map(v => {
    const platform = PLATFORM_LABELS[v.platform] || v.platform;
    let mediaHtml = '';
    if (v.platform === 'youtube') {
      mediaHtml = `<div class="cp9-video-embed"><iframe src="https://www.youtube.com/embed/${escHtml(v.video_id)}" frameborder="0" allowfullscreen loading="lazy"></iframe></div>`;
    } else if (v.platform === 'reels') {
      mediaHtml = `<a href="https://www.instagram.com/reel/${escHtml(v.video_id)}/" target="_blank" rel="noopener" class="cp9-video-link">Watch on Instagram</a>`;
    } else {
      mediaHtml = `<span class="cp9-video-link">TikTok ID: ${escHtml(v.video_id)}</span>`;
    }
    return `<div class="cp9-video-item" data-vid="${v.id}">
      <div class="cp9-video-item__header">
        <span class="cp9-video-platform">${platform}</span>
        ${v.title ? `<span class="cp9-video-title">${escHtml(v.title)}</span>` : ''}
        <button class="projects__action projects__action--danger cp9-video-remove" data-vid="${v.id}" type="button">Remove</button>
      </div>
      ${mediaHtml}
    </div>`;
  }).join('');

  videosList.querySelectorAll('.cp9-video-remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this video?')) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/admin/client-projects/${currentId}/videos/${btn.dataset.vid}`, {
          method: 'DELETE', headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const vRes  = await fetch(`/api/admin/client-projects/${currentId}/videos`, { headers: { Accept: 'application/json' } });
          const vBody = vRes.ok ? await vRes.json() : {};
          renderVideos(vBody.videos || []);
        } else { btn.disabled = false; }
      } catch { btn.disabled = false; }
    });
  });
}

if (videoAddForm) {
  videoAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    videosError.hidden = true; videosSuccess.hidden = true;
    const platform = videoPlatform.value;
    const videoId  = videoIdInput.value.trim();
    const title    = videoTitleInput.value.trim();
    if (!platform || !videoId) { videosError.textContent = 'Platform and video ID are required.'; videosError.hidden = false; return; }
    const orig = videoAddBtn.textContent; videoAddBtn.disabled = true; videoAddBtn.textContent = 'Adding...';
    try {
      const res  = await fetch(`/api/admin/client-projects/${currentId}/videos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ platform, video_id: videoId, title: title || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { videosError.textContent = body.error || 'Could not add video.'; videosError.hidden = false; return; }
      videoAddForm.reset();
      videosSuccess.textContent = 'Video added.'; videosSuccess.hidden = false;
      setTimeout(() => videosSuccess.hidden = true, 4000);
      const vRes  = await fetch(`/api/admin/client-projects/${currentId}/videos`, { headers: { Accept: 'application/json' } });
      const vBody = vRes.ok ? await vRes.json() : {};
      renderVideos(vBody.videos || []);
    } catch { videosError.textContent = 'Could not connect.'; videosError.hidden = false; }
    finally { videoAddBtn.disabled = false; videoAddBtn.textContent = orig; }
  });
}

// -- Image upload ----------------------------------------------

uploadZone.addEventListener('click', () => uploadInput.click());
uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') uploadInput.click(); });
uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('upload__zone--drag'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('upload__zone--drag'));
uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('upload__zone--drag'); const f = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')); if (f.length) processImageFiles(f); });
uploadInput.addEventListener('change', () => { if (uploadInput.files.length) processImageFiles(Array.from(uploadInput.files)); uploadInput.value = ''; });

async function processImageFiles(files) {
  if (pendingImages.length + files.length > 20) { showImagesError('Maximum 20 images.'); return; }
  uploadZone.style.pointerEvents = 'none'; uploadProcessing.hidden = false;
  for (const file of files) {
    try { pendingImages.push(await resizeToWebP(file)); }
    catch { showImagesError(`Could not process ${file.name}.`); }
  }
  uploadProcessing.hidden = true; uploadZone.style.pointerEvents = '';
  assignFilenames(); renderPendingPreviews();
}

function resizeToWebP(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_WIDTH) { height = Math.round(height * MAX_WIDTH / width); width = MAX_WIDTH; }
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('toBlob failed')); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, blob, originalName: file.name });
        reader.onerror = reject; reader.readAsDataURL(blob);
      }, 'image/webp', WEBP_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); }; img.src = url;
  });
}

function assignFilenames() { pendingImages.forEach((img, i) => { img.filename = i === 0 ? 'hero.webp' : String(i).padStart(2, '0') + '.webp'; }); }

function renderPendingPreviews() {
  if (pendingImages.length === 0) { uploadPreviews.hidden = true; uploadList.innerHTML = ''; return; }
  uploadPreviews.hidden = false; uploadList.innerHTML = '';
  pendingImages.forEach((img, i) => {
    const li = document.createElement('li'); li.className = 'upload__item'; li.draggable = true; li.dataset.index = i;
    const label = i === 0 ? 'Hero' : `Gallery ${i}`; const kb = Math.round(img.blob.size / 1024);
    li.innerHTML = `<span class="upload__drag-handle" aria-hidden="true">::</span><img class="upload__thumb" src="${img.dataUrl}" alt=""><span class="upload__item-meta"><span class="upload__item-label">${label}</span><span class="upload__item-name">${escHtml(img.originalName)}</span><span class="upload__item-size">${kb} KB</span></span><button class="upload__remove" type="button" data-index="${i}">&#215;</button>`;
    li.addEventListener('dragstart', (e) => { dragSrcIndex = i; li.classList.add('upload__item--dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend',   () => { li.classList.remove('upload__item--dragging'); dragSrcIndex = null; uploadList.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); });
    li.addEventListener('dragover',  (e) => { e.preventDefault(); uploadList.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); li.classList.add('upload__item--over'); });
    li.addEventListener('drop',      (e) => { e.preventDefault(); if (dragSrcIndex === null || dragSrcIndex === i) return; const m = pendingImages.splice(dragSrcIndex, 1)[0]; pendingImages.splice(i, 0, m); assignFilenames(); renderPendingPreviews(); });
    uploadList.appendChild(li);
  });
  uploadList.addEventListener('click', (e) => { const btn = e.target.closest('.upload__remove'); if (!btn) return; pendingImages.splice(Number(btn.dataset.index), 1); assignFilenames(); renderPendingPreviews(); });
}

uploadSaveBtn.addEventListener('click', async () => {
  if (pendingImages.length === 0) return; clearImagesMessages();
  const originalLabel = uploadSaveBtn.textContent; uploadSaveBtn.disabled = true; uploadSaveBtn.textContent = 'Uploading...';
  try {
    const res  = await fetch(`/api/admin/client-projects/${currentId}/images`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ images: pendingImages.map(img => ({ filename: img.filename, data: img.dataUrl })) }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showImagesError(body.error || 'Could not upload.'); return; }
    if (currentProject) { currentProject.hero_image = body.hero_image || currentProject.hero_image; currentProject.gallery = body.gallery || currentProject.gallery; }
    pendingImages = []; renderPendingPreviews(); renderExistingImages(currentProject);
    showImagesSuccess(`${body.uploaded} image${body.uploaded > 1 ? 's' : ''} uploaded.`);
  } catch { showImagesError('Could not connect.'); }
  finally { uploadSaveBtn.disabled = false; uploadSaveBtn.textContent = originalLabel; }
});

function renderExistingImages(project) {
  if (!project || !project.hero_image) { existingImagesWrap.hidden = true; existingImages = null; return; }
  const gallery = Array.isArray(project.gallery) ? project.gallery : [];
  existingImages = [project.hero_image, ...gallery].map(url => ({ url }));
  existingImagesWrap.hidden = false; existingImagesContent.innerHTML = '';
  const list = document.createElement('ul'); list.className = 'upload__list'; existingImagesContent.appendChild(list);
  existingImages.forEach((img, i) => {
    const label = i === 0 ? 'Hero' : `Gallery ${i}`;
    const li = document.createElement('li'); li.className = 'upload__item'; li.draggable = true; li.dataset.index = i;
    li.innerHTML = `<span class="upload__drag-handle" aria-hidden="true">::</span><img class="upload__thumb" src="${escHtml(img.url)}" alt="${label}"><span class="upload__item-meta"><span class="upload__item-label">${label}</span><span class="upload__item-name upload__item-name--url">${escHtml(img.url.split('/').pop())}</span></span><button class="upload__remove" type="button" data-index="${i}">&#215;</button>`;
    li.addEventListener('dragstart', (e) => { existingDragIdx = i; li.classList.add('upload__item--dragging'); e.dataTransfer.effectAllowed = 'move'; });
    li.addEventListener('dragend',   () => { li.classList.remove('upload__item--dragging'); existingDragIdx = null; list.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); });
    li.addEventListener('dragover',  (e) => { e.preventDefault(); list.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over')); li.classList.add('upload__item--over'); });
    li.addEventListener('drop',      (e) => { e.preventDefault(); if (existingDragIdx === null || existingDragIdx === i) return; const m = existingImages.splice(existingDragIdx, 1)[0]; existingImages.splice(i, 0, m); saveExistingImageOrder(); });
    list.appendChild(li);
  });
  list.addEventListener('click', (e) => { const btn = e.target.closest('.upload__remove'); if (!btn) return; existingImages.splice(Number(btn.dataset.index), 1); saveExistingImageOrder(); });
}

async function saveExistingImageOrder() {
  clearImagesMessages();
  const heroImage = existingImages[0]?.url || '';
  const gallery   = existingImages.slice(1).map(img => img.url);
  try {
    const res  = await fetch(`/api/admin/client-projects/${currentId}/images`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ hero_image: heroImage, gallery }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showImagesError(body.error || 'Could not update order.'); renderExistingImages(currentProject); return; }
    if (currentProject) { currentProject.hero_image = heroImage; currentProject.gallery = gallery; }
    renderExistingImages(currentProject); showImagesSuccess('Image order saved.');
  } catch { showImagesError('Could not connect.'); renderExistingImages(currentProject); }
}

// -- Video files -----------------------------------------------

const vfZone         = document.getElementById('vf-zone');
const vfInput        = document.getElementById('vf-input');
const vfProcessing   = document.getElementById('vf-processing');
const vfPendingWrap  = document.getElementById('vf-pending-wrap');
const vfPendingList  = document.getElementById('vf-pending-list');
const vfUploadBtn    = document.getElementById('vf-upload-btn');
const vfError        = document.getElementById('vf-error');
const vfSuccess      = document.getElementById('vf-success');
const vfExistingWrap = document.getElementById('vf-existing-wrap');
const vfExistingContent = document.getElementById('vf-existing-content');

vfZone.addEventListener('click', () => vfInput.click());
vfZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') vfInput.click(); });
vfZone.addEventListener('dragover', (e) => { e.preventDefault(); vfZone.classList.add('upload__zone--drag'); });
vfZone.addEventListener('dragleave', () => vfZone.classList.remove('upload__zone--drag'));
vfZone.addEventListener('drop', (e) => { e.preventDefault(); vfZone.classList.remove('upload__zone--drag'); if (e.dataTransfer.files.length) queueVideoFiles(Array.from(e.dataTransfer.files)); });
vfInput.addEventListener('change', () => { if (vfInput.files.length) queueVideoFiles(Array.from(vfInput.files)); vfInput.value = ''; });

function queueVideoFiles(files) {
  if (pendingVideoFiles.length + files.length > 5) { showVfError('Maximum 5 video files.'); return; }
  files.forEach(f => pendingVideoFiles.push({ file: f, name: f.name }));
  renderVfPending();
}

function renderVfPending() {
  if (pendingVideoFiles.length === 0) { vfPendingWrap.hidden = true; vfPendingList.innerHTML = ''; return; }
  vfPendingWrap.hidden = false; vfPendingList.innerHTML = '';
  pendingVideoFiles.forEach((item, i) => {
    const li = document.createElement('li'); li.className = 'upload__item';
    const mb = (item.file.size / (1024 * 1024)).toFixed(1);
    li.innerHTML = `<span class="upload__file-icon" aria-hidden="true">[]</span><span class="upload__item-meta"><span class="upload__item-name">${escHtml(item.name)}</span><span class="upload__item-size">${mb} MB</span></span><button class="upload__remove" type="button" data-index="${i}">&#215;</button>`;
    li.querySelector('.upload__remove').addEventListener('click', () => { pendingVideoFiles.splice(i, 1); renderVfPending(); });
    vfPendingList.appendChild(li);
  });
}

vfUploadBtn.addEventListener('click', async () => {
  if (pendingVideoFiles.length === 0) return;
  vfError.hidden = true; vfSuccess.hidden = true;
  const orig = vfUploadBtn.textContent; vfUploadBtn.disabled = true; vfUploadBtn.textContent = 'Uploading...'; vfProcessing.hidden = false;
  let count = 0;
  try {
    for (const item of pendingVideoFiles) {
      const formData = new FormData(); formData.append('file', item.file, item.name);
      const res = await fetch(`/api/admin/client-projects/${currentId}/video-files`, { method: 'POST', body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { showVfError(body.error || `Could not upload ${item.name}.`); break; }
      count++;
    }
    pendingVideoFiles = []; renderVfPending(); await loadVideoFiles();
    if (count > 0) { vfSuccess.textContent = `${count} file${count > 1 ? 's' : ''} uploaded.`; vfSuccess.hidden = false; setTimeout(() => vfSuccess.hidden = true, 5000); }
  } catch { showVfError('Could not connect.'); }
  finally { vfUploadBtn.disabled = false; vfUploadBtn.textContent = orig; vfProcessing.hidden = true; }
});

async function loadVideoFiles() {
  try {
    const res  = await fetch(`/api/admin/client-projects/${currentId}/video-files`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    const files = body.video_files || [];
    vfExistingWrap.hidden = files.length === 0;
    if (!files.length) return;
    vfExistingContent.innerHTML = '';
    const list = document.createElement('ul'); list.className = 'upload__list upload__list--files';
    files.forEach(f => {
      const li = document.createElement('li'); li.className = 'upload__item';
      li.innerHTML = `<span class="upload__file-icon" aria-hidden="true">[]</span><span class="upload__item-meta"><span class="upload__item-name">${escHtml(f.name)}</span></span><button class="upload__remove upload__remove--vf" type="button" data-key="${escHtml(f.key)}">&#215;</button>`;
      list.appendChild(li);
    });
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('.upload__remove--vf'); if (!btn) return;
      btn.disabled = true;
      try {
        const res = await fetch(`/api/admin/client-projects/${currentId}/video-files`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ key: btn.dataset.key }) });
        if (res.ok) await loadVideoFiles(); else btn.disabled = false;
      } catch { btn.disabled = false; }
    });
    vfExistingContent.appendChild(list);
  } catch { /* non-blocking */ }
}

function showVfError(msg) { vfError.textContent = msg; vfError.hidden = false; }

// -- Client access ---------------------------------------------

async function loadClients() {
  try {
    const res  = await fetch(`/api/admin/client-projects/${currentId}/clients`, { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) return;
    const clients = body.clients || [];
    clientsWrap.hidden  = clients.length === 0;
    clientsEmpty.hidden = clients.length > 0;
    if (clients.length === 0) return;
    clientsList.innerHTML = '';
    const list = document.createElement('ul'); list.className = 'upload__list upload__list--files';
    clients.forEach(client => {
      const li = document.createElement('li'); li.className = 'upload__item';
      const lastLogin = client.last_login_at ? `Last sign-in ${new Date(client.last_login_at).toLocaleDateString()}` : 'Never signed in';
      li.innerHTML = `<span class="upload__item-meta"><span class="upload__item-label">${escHtml(client.name || '-')}</span><span class="upload__item-name">${escHtml(client.email)}</span><span class="upload__item-size">${lastLogin}</span></span><div class="project-edit__client-actions"><button class="projects__action" type="button" data-action="resend" data-user-id="${client.id}">Resend invite</button><button class="projects__action projects__action--danger" type="button" data-action="revoke" data-user-id="${client.id}">Revoke</button></div>`;
      list.appendChild(li);
    });
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]'); if (!btn) return;
      const action = btn.dataset.action; const userId = Number(btn.dataset.userId);
      if (action === 'resend') {
        btn.disabled = true;
        try {
          const res = await fetch('/api/admin/invite/resend', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ user_id: userId }) });
          const body = await res.json().catch(() => ({}));
          if (res.ok) showInviteSuccess('Invite resent.'); else showInviteError(body.error || 'Could not resend.');
        } catch { showInviteError('Could not connect.'); }
        finally { btn.disabled = false; }
      }
      if (action === 'revoke') {
        if (!confirm('Remove access for this client?')) return;
        btn.disabled = true;
        try {
          const res = await fetch(`/api/admin/clients/${userId}/access/cp/${currentId}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
          if (res.ok) await loadClients(); else btn.disabled = false;
        } catch { btn.disabled = false; }
      }
    });
    clientsList.appendChild(list);
  } catch { /* non-blocking */ }
}

inviteForm.addEventListener('submit', async (e) => {
  e.preventDefault(); clearInviteMessages();
  const name = inviteName.value.trim(); const email = inviteEmail.value.trim();
  if (!email) { showInviteError('Email is required.'); return; }
  const originalLabel = inviteSubmit.textContent; inviteSubmit.disabled = true; inviteSubmit.textContent = 'Sending...';
  try {
    const res  = await fetch(`/api/admin/client-projects/${currentId}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ name, email }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { showInviteError(body.error || 'Could not send invite.'); return; }
    inviteForm.reset(); showInviteSuccess('Invite sent.'); await loadClients();
  } catch { showInviteError('Could not connect.'); }
  finally { inviteSubmit.disabled = false; inviteSubmit.textContent = originalLabel; }
});

// -- Helpers ---------------------------------------------------

function showPageError(msg)    { pageLoading.hidden = true; pageError.hidden = false; pageContent.hidden = true; pageErrorMsg.textContent = msg; }
function showPageSuccess(msg)  { pageSaveSuccess.textContent = msg; pageSaveSuccess.hidden = false; pageSaveError.hidden = true; setTimeout(() => pageSaveSuccess.hidden = true, 5000); }
function clearPageMessages()   { pageSaveError.hidden = true; pageSaveSuccess.hidden = true; }
function showImagesError(msg)  { imagesError.textContent = msg; imagesError.hidden = false; imagesSuccess.hidden = true; }
function showImagesSuccess(msg){ imagesSuccess.textContent = msg; imagesSuccess.hidden = false; imagesError.hidden = true; setTimeout(() => imagesSuccess.hidden = true, 5000); }
function clearImagesMessages() { imagesError.hidden = true; imagesSuccess.hidden = true; }
function showInviteError(msg)  { inviteError.textContent = msg; inviteError.hidden = false; inviteSuccess.hidden = true; }
function showInviteSuccess(msg){ inviteSuccess.textContent = msg; inviteSuccess.hidden = false; inviteError.hidden = true; setTimeout(() => inviteSuccess.hidden = true, 5000); }
function clearInviteMessages() { inviteError.hidden = true; inviteSuccess.hidden = true; }
function escHtml(str) { return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
