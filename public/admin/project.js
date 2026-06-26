/* ============================================================
   /admin/project.js — Chunk 6a
   Project edit page: metadata + images + youtube_id.
   Reads slug from URL: /admin/projects/[slug]
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

// Image upload
const uploadZone         = document.getElementById('upload-zone');
const uploadInput        = document.getElementById('upload-input');
const uploadProcessing   = document.getElementById('upload-processing');
const uploadPreviews     = document.getElementById('upload-previews');
const uploadList         = document.getElementById('upload-list');
const uploadSaveBtn      = document.getElementById('upload-save-btn');
const imagesError        = document.getElementById('images-error');
const imagesSuccess      = document.getElementById('images-success');

// Existing images
const existingImagesWrap    = document.getElementById('existing-images-wrap');
const existingImagesContent = document.getElementById('existing-images-content');


// ── State ─────────────────────────────────────────────────────

let currentSlug      = '';
let currentProject   = null;
let pendingImages    = [];
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


// ── Init ──────────────────────────────────────────────────────

(async function init() {
  // Extract slug from query param: /admin/project?slug=[slug]
  const params = new URLSearchParams(window.location.search);
  currentSlug = params.get('slug') || '';

  if (!currentSlug) {
    showPageError('No project specified.');
    return;
  }

  // Auth check
  try {
    const res  = await fetch('/api/auth/me', { method: 'GET', headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body || !body.user) { window.location.href = '/admin/login'; return; }
  } catch {
    window.location.href = '/admin/login';
    return;
  }

  // Load project
  try {
    const res  = await fetch('/api/admin/projects', { method: 'GET', headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body) { showPageError('Could not load projects.'); return; }

    const project = (body.projects || []).find(p => p.slug === currentSlug);
    if (!project) { showPageError('Project not found.'); return; }

    currentProject = project;
    populateForm(project);

    // Show "just created" banner
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('created')) {
      createdBanner.hidden = false;
      window.history.replaceState({}, '', `/admin/project?slug=${currentSlug}`);
    }

    pageLoading.hidden  = true;
    pageContent.hidden  = false;

  } catch (err) {
    console.error('Load project error:', err);
    showPageError('Could not connect. Check your connection and try again.');
  }
})();


// ── Log out ───────────────────────────────────────────────────

logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  try { await fetch('/api/auth/logout', { method: 'POST' }); }
  catch { /* continue */ }
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

  // Existing images
  renderExistingImages(project);
}


// ── Metadata save ─────────────────────────────────────────────

projectForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearPageMessages();

  const services = Array.from(serviceCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
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
  };

  // Only include youtube_id if set (avoids overwriting with empty on old projects)
  if (youtubeId) payload.youtube_id = youtubeId;
  else payload.youtube_id = '';

  if (!payload.title)       { showPageError('Title is required.');       return; }
  if (!payload.slug)        { showPageError('Slug is required.');        return; }
  if (!payload.location)    { showPageError('Location is required.');    return; }
  if (!payload.year)        { showPageError('Year is required.');        return; }
  if (!payload.description) { showPageError('Description is required.'); return; }

  const originalLabel     = saveDetailsBtn.textContent;
  saveDetailsBtn.disabled = true;
  saveDetailsBtn.textContent = 'Saving…';

  try {
    const res  = await fetch(`/api/admin/projects/${currentSlug}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) { showPageError(body.error || 'Could not save project.'); return; }

    // If slug changed, update URL and currentSlug
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


// ── Canvas resize + WebP ──────────────────────────────────────

async function processFiles(files) {
  if (pendingImages.length + files.length > 20) {
    showImagesError('Maximum 20 images per upload.');
    return;
  }

  uploadProcessing.hidden = true;
  uploadZone.style.pointerEvents = 'none';
  uploadProcessing.hidden = false;

  for (const file of files) {
    try {
      const processed = await resizeToWebP(file);
      pendingImages.push(processed);
    } catch (err) {
      console.error('Image processing error:', file.name, err);
      showImagesError(`Could not process ${file.name}. Use JPEG or PNG.`);
    }
  }

  uploadProcessing.hidden = true;
  uploadZone.style.pointerEvents = '';
  assignFilenames();
  renderPendingPreviews();
}

function resizeToWebP(file) {
  return new Promise((resolve, reject) => {
    const img       = new Image();
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
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
        const reader  = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, blob, originalName: file.name });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      }, 'image/webp', WEBP_QUALITY);
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

function assignFilenames() {
  pendingImages.forEach((img, i) => {
    img.filename = i === 0 ? 'hero.webp' : String(i).padStart(2, '0') + '.webp';
  });
}

function renderPendingPreviews() {
  if (pendingImages.length === 0) {
    uploadPreviews.hidden = true;
    uploadList.innerHTML  = '';
    return;
  }

  uploadPreviews.hidden = false;
  uploadList.innerHTML  = '';

  pendingImages.forEach((img, i) => {
    const li    = document.createElement('li');
    li.className     = 'upload__item';
    li.draggable     = true;
    li.dataset.index = i;

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
      uploadList.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over'));
      li.classList.add('upload__item--over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === i) return;
      const moved = pendingImages.splice(dragSrcIndex, 1)[0];
      pendingImages.splice(i, 0, moved);
      assignFilenames();
      renderPendingPreviews();
    });

    uploadList.appendChild(li);
  });

  uploadList.addEventListener('click', (e) => {
    const btn = e.target.closest('.upload__remove');
    if (!btn) return;
    pendingImages.splice(Number(btn.dataset.index), 1);
    assignFilenames();
    renderPendingPreviews();
  });
}


// ── Upload save ───────────────────────────────────────────────

uploadSaveBtn.addEventListener('click', async () => {
  if (pendingImages.length === 0) return;
  clearImagesMessages();

  const originalLabel      = uploadSaveBtn.textContent;
  uploadSaveBtn.disabled   = true;
  uploadSaveBtn.textContent = 'Uploading…';

  try {
    const images = pendingImages.map(img => ({ filename: img.filename, data: img.dataUrl }));

    const res  = await fetch(`/api/admin/projects/${currentSlug}/images`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ images }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) { showImagesError(body.error || 'Could not upload images.'); return; }

    // Update local project state and re-render existing images
    if (currentProject) {
      currentProject.hero_image = body.hero_image || currentProject.hero_image;
      currentProject.gallery    = body.gallery    || currentProject.gallery;
    }

    pendingImages = [];
    renderPendingPreviews();
    renderExistingImages(currentProject);
    showImagesSuccess(`${body.uploaded} image${body.uploaded > 1 ? 's' : ''} uploaded.`);

  } catch (err) {
    console.error('Upload error:', err);
    showImagesError('Could not connect. Check your connection and try again.');
  } finally {
    uploadSaveBtn.disabled    = false;
    uploadSaveBtn.textContent = originalLabel;
  }
});


// ── Existing images: render, reorder, delete ──────────────────

function renderExistingImages(project) {
  if (!project || !project.hero_image) {
    existingImagesWrap.hidden = true;
    existingImages = null;
    return;
  }

  const gallery = Array.isArray(project.gallery) ? project.gallery : [];
  existingImages = [project.hero_image, ...gallery].map(url => ({ url }));

  existingImagesWrap.hidden    = false;
  existingImagesContent.innerHTML = '';

  const list = document.createElement('ul');
  list.className = 'upload__list';
  existingImagesContent.appendChild(list);

  existingImages.forEach((img, i) => {
    const label = i === 0 ? 'Hero' : `Gallery ${i}`;
    const li    = document.createElement('li');
    li.className     = 'upload__item';
    li.draggable     = true;
    li.dataset.index = i;

    li.innerHTML = `
      <span class="upload__drag-handle" aria-hidden="true">⠿</span>
      <img class="upload__thumb" src="${escHtml(img.url)}" alt="${label}">
      <span class="upload__item-meta">
        <span class="upload__item-label">${label}</span>
        <span class="upload__item-name upload__item-name--url">${escHtml(img.url.split('/').pop())}</span>
      </span>
      <button class="upload__remove" type="button" data-index="${i}" aria-label="Remove">&#215;</button>
    `;

    li.addEventListener('dragstart', (e) => {
      existingDragIdx = i;
      li.classList.add('upload__item--dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('upload__item--dragging');
      existingDragIdx = null;
      list.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over'));
    });
    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      list.querySelectorAll('.upload__item').forEach(el => el.classList.remove('upload__item--over'));
      li.classList.add('upload__item--over');
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (existingDragIdx === null || existingDragIdx === i) return;
      const moved = existingImages.splice(existingDragIdx, 1)[0];
      existingImages.splice(i, 0, moved);
      saveExistingImageOrder();
    });

    list.appendChild(li);
  });

  // Remove buttons
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
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ hero_image: heroImage, gallery }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      showImagesError(body.error || 'Could not update image order.');
      // Re-render from server state
      renderExistingImages(currentProject);
      return;
    }

    // Update local state
    if (currentProject) {
      currentProject.hero_image = heroImage;
      currentProject.gallery    = gallery;
    }

    renderExistingImages(currentProject);
    showImagesSuccess('Image order saved.');

  } catch (err) {
    console.error('Reorder error:', err);
    showImagesError('Could not connect. Try again.');
    renderExistingImages(currentProject);
  }
}


// ── Page-level message helpers ────────────────────────────────

// showPageError defined below

function showPageSuccess(message) {
  pageSaveSuccess.textContent = message;
  pageSaveSuccess.hidden      = false;
  pageSaveError.hidden        = true;
  setTimeout(() => { pageSaveSuccess.hidden = true; }, 5000);
}

function clearPageMessages() {
  pageSaveError.hidden   = true;
  pageSaveSuccess.hidden = true;
}

function showImagesError(message) {
  imagesError.textContent = message;
  imagesError.hidden      = false;
  imagesSuccess.hidden    = true;
}

function showImagesSuccess(message) {
  imagesSuccess.textContent = message;
  imagesSuccess.hidden      = false;
  imagesError.hidden        = true;
  setTimeout(() => { imagesSuccess.hidden = true; }, 5000);
}

function clearImagesMessages() {
  imagesError.hidden   = true;
  imagesSuccess.hidden = true;
}

function showPageError(message) {
  pageLoading.hidden  = true;
  pageError.hidden    = false;
  pageContent.hidden  = true;
  pageErrorMsg.textContent = message;
}


// ── Helpers ───────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
