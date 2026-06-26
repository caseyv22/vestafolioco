// public/js/site.js
// Vesta Folio — public site JS
// No dependencies. ES module. Runs as <script type="module">.

'use strict';

/* ----------------------------------------------------------
   CONSTANTS
   ---------------------------------------------------------- */

const SERVICE_LABELS = {
  hdr:       'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:   'AI Staging',
};


/* ----------------------------------------------------------
   UTILITY
   ---------------------------------------------------------- */

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $$(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function pad(n) {
  return String(n).padStart(2, '0');
}


/* ----------------------------------------------------------
   PROJECTS — fetch and render Selected Work grid
   ---------------------------------------------------------- */

async function loadProjects() {
  try {
    const res = await fetch('/data/projects.json');
    if (!res.ok) throw new Error('Failed to load projects');
    return await res.json();
  } catch (err) {
    console.error('Could not load projects:', err);
    return [];
  }
}

function buildProjectCard(project, index) {
  const num     = pad(index + 1);
  const isFirst = index === 0;

  const card = document.createElement('article');
  card.className = 'work__card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View project: ${project.title}`);
  card.dataset.slug = project.slug;

  card.innerHTML = `
    <div class="work__card-image-wrap">
      <div class="work__card-placeholder">
        <span class="work__card-placeholder-num">${num}</span>
      </div>
      <img
        class="work__card-image"
        src="${project.hero_image}"
        alt="${project.title} — ${project.location}"
        ${isFirst ? 'fetchpriority="high"' : 'loading="lazy"'}
      >
    </div>
    <div class="work__card-meta">
      <span class="work__card-number t-micro">${num}</span>
      <h3 class="work__card-title">${project.title}</h3>
      <span class="work__card-location">${project.location}</span>
    </div>
  `;

  return card;
}

function renderWork(projects) {
  const grid = $('.work__grid');
  if (!grid) return;

  const featured = projects
    .filter(p => p.featured)
    .sort((a, b) => a.order - b.order);

  featured.forEach((project, i) => {
    const card = buildProjectCard(project, i);
    grid.appendChild(card);

    card.addEventListener('click', () => openModal(project, i));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(project, i);
      }
    });
  });
}


/* ----------------------------------------------------------
   PROJECT MODAL — hero + thumbnail gallery lightbox
   ---------------------------------------------------------- */

// Currently active large image index within [hero, ...gallery]
let activeImageIndex = 0;
let currentImages    = []; // [hero_url, ...gallery_urls]

function openModal(project, index) {
  const overlay = $('.modal-overlay');
  const modal   = $('.modal');
  if (!overlay || !modal) return;

  const num = pad(index + 1);

  // Build image list: hero first, then gallery
  currentImages = [
    project.hero_image,
    ...(project.gallery || []),
  ].filter(Boolean);

  activeImageIndex = 0;

  const serviceItems = (project.services || [])
    .map(s => `<span class="modal__service-tag">${SERVICE_LABELS[s] || s}</span>`)
    .join('');

  // Thumbnail strip — only shown if there are gallery images
  const thumbsHtml = currentImages.length > 1
    ? `<div class="modal__thumbs" role="list">
        ${currentImages.map((src, i) => `
          <button
            class="modal__thumb${i === 0 ? ' modal__thumb--active' : ''}"
            type="button"
            data-index="${i}"
            aria-label="View image ${i + 1}"
            role="listitem"
          >
            <img src="${src}" alt="${project.title} image ${i + 1}" loading="lazy">
          </button>
        `).join('')}
       </div>`
    : '';

  modal.innerHTML = `
    <button class="modal__close" aria-label="Close project">&#x2715;</button>

    <div class="modal__viewer">
      <div class="modal__hero">
        <img class="modal__hero-image" id="modal-active-image" src="${currentImages[0]}" alt="${project.title}">
      </div>
      ${thumbsHtml}
    </div>

    <div class="modal__body">
      <p class="modal__number t-micro">${num}</p>
      <h2 class="modal__title">${project.title}</h2>
      <p class="modal__location">${project.location} · ${project.year}</p>
      <p class="modal__description">${project.description}</p>
      ${serviceItems ? `<div class="modal__services">${serviceItems}</div>` : ''}
    </div>
  `;

  // Close button
  $('.modal__close', modal).addEventListener('click', closeModal);

  // Thumbnail clicks
  $$('.modal__thumb', modal).forEach(btn => {
    btn.addEventListener('click', () => {
      const idx   = Number(btn.dataset.index);
      const img   = $('#modal-active-image', modal);
      const thumbs = $$('.modal__thumb', modal);

      activeImageIndex = idx;
      img.src          = currentImages[idx];

      thumbs.forEach((t, i) => t.classList.toggle('modal__thumb--active', i === idx));
    });
  });

  // Keyboard: left/right arrow navigation
  modal._keyHandler = (e) => {
    if (currentImages.length <= 1) return;
    if (e.key === 'ArrowRight') cycleImage(modal, 1);
    if (e.key === 'ArrowLeft')  cycleImage(modal, -1);
  };
  document.addEventListener('keydown', modal._keyHandler);

  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  modal.setAttribute('tabindex', '-1');
  modal.focus();
}

function cycleImage(modal, direction) {
  activeImageIndex = (activeImageIndex + direction + currentImages.length) % currentImages.length;
  const img    = $('#modal-active-image', modal);
  const thumbs = $$('.modal__thumb', modal);
  img.src      = currentImages[activeImageIndex];
  thumbs.forEach((t, i) => t.classList.toggle('modal__thumb--active', i === activeImageIndex));
}

function closeModal() {
  const overlay = $('.modal-overlay');
  const modal   = $('.modal');
  if (!overlay) return;

  // Remove keyboard handler
  if (modal && modal._keyHandler) {
    document.removeEventListener('keydown', modal._keyHandler);
    modal._keyHandler = null;
  }

  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
  currentImages    = [];
  activeImageIndex = 0;
}

function initModal() {
  const overlay = $('.modal-overlay');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    const overlay = $('.modal-overlay');
    if (overlay && overlay.classList.contains('is-open') && e.key === 'Escape') {
      closeModal();
    }
  });
}


/* ----------------------------------------------------------
   STICKY NAV
   ---------------------------------------------------------- */

function initNav() {
  const nav  = $('.nav');
  const hero = $('.hero');
  if (!nav || !hero) return;

  function applyFilled() {
    nav.classList.toggle('is-filled', hero.getBoundingClientRect().bottom <= 0);
  }

  applyFilled();

  const observer = new IntersectionObserver(
    ([entry]) => nav.classList.toggle('is-filled', !entry.isIntersecting),
    { threshold: 0 }
  );

  observer.observe(hero);
}


/* ----------------------------------------------------------
   MOBILE MENU
   ---------------------------------------------------------- */

function initMobileMenu() {
  const hamburger = $('.nav__hamburger');
  const menu      = $('.mobile-menu');
  const closeBtn  = $('.mobile-menu__close');
  if (!hamburger || !menu) return;

  const open  = () => { menu.classList.add('is-open');    document.body.style.overflow = 'hidden'; };
  const close = () => { menu.classList.remove('is-open'); document.body.style.overflow = ''; };

  hamburger.addEventListener('click', open);
  if (closeBtn) closeBtn.addEventListener('click', close);

  $$('.mobile-menu__link', menu).forEach(link => link.addEventListener('click', close));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) close();
  });
}


/* ----------------------------------------------------------
   INQUIRY FORM
   ---------------------------------------------------------- */

function initInquiryForm() {
  const form    = $('.inquire__form');
  const success = $('.inquire__success');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn      = $('[type="submit"]', form);
    const originalLabel  = submitBtn ? submitBtn.textContent : '';

    clearError(form);

    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.services = $$('input[name="services"]:checked', form).map(cb => cb.value);
    if (payload['cf-turnstile-response']) {
      payload.turnstile_token = payload['cf-turnstile-response'];
      delete payload['cf-turnstile-response'];
    }

    try {
      const res = await fetch('/api/inquiries', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        form.style.display = 'none';
        if (success) success.classList.add('is-visible');
        return;
      }

      resetTurnstile();
      let message = 'Something went wrong. Please try again, or email vestafolioco@gmail.com directly.';
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch { /* keep default */ }
      showError(form, message);

    } catch (err) {
      console.error('Inquiry network error:', err);
      resetTurnstile();
      showError(form, 'Could not connect. Check your connection and try again.');
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = originalLabel; }
    }
  });
}

function resetTurnstile() {
  if (window.turnstile && typeof window.turnstile.reset === 'function') {
    try { window.turnstile.reset(); } catch { /* no-op */ }
  }
}

function showError(form, message) {
  clearError(form);
  const el = document.createElement('p');
  el.className = 'inquire__error';
  el.setAttribute('role', 'alert');
  el.textContent = message;
  form.insertAdjacentElement('afterend', el);
}

function clearError(form) {
  const existing = form.parentElement && form.parentElement.querySelector('.inquire__error');
  if (existing) existing.remove();
}


/* ----------------------------------------------------------
   SMOOTH SCROLL
   ---------------------------------------------------------- */

function initSmoothScroll() {
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}


/* ----------------------------------------------------------
   INIT
   ---------------------------------------------------------- */

async function init() {
  initNav();
  initMobileMenu();
  initModal();
  initSmoothScroll();

  const projects = await loadProjects();
  renderWork(projects);
  initInquiryForm();
}

document.addEventListener('DOMContentLoaded', init);
