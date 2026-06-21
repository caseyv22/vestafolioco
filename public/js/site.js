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
  const num = pad(index + 1);
  const isFirst = index === 0;

  const card = document.createElement('article');
  card.className = 'work__card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View project: ${project.title}`);
  card.dataset.slug = project.slug;

  // No lazy loading — images load immediately on page paint
  // First image gets fetchpriority=high for fastest LCP
  card.innerHTML = `
    <div class="work__card-image-wrap">
      <div class="work__card-placeholder" style="position:absolute;inset:0;display:flex;">
        <span class="work__card-placeholder-num">${num}</span>
      </div>
      <img
        class="work__card-image"
        src="${project.hero_image}"
        alt="${project.title} — ${project.location}"
        ${isFirst ? 'fetchpriority="high"' : 'loading="lazy"'}
        style="opacity:0;transition:opacity 400ms ease;"
        onload="this.style.opacity='1';"
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

  // Re-run reveal after cards are in the DOM
  initReveal();
}


/* ----------------------------------------------------------
   PROJECT MODAL
   ---------------------------------------------------------- */

function openModal(project, index) {
  const overlay = $('.modal-overlay');
  const modal   = $('.modal');
  if (!overlay || !modal) return;

  const num = pad(index + 1);

  const serviceItems = (project.services || [])
    .map(s => `<span class="modal__service-tag">${SERVICE_LABELS[s] || s}</span>`)
    .join('');

  const galleryImages = (project.gallery || [])
    .map(src => `<img class="modal__gallery-image" src="${src}" alt="${project.title} gallery" loading="lazy">`)
    .join('');

  modal.innerHTML = `
    <button class="modal__close" aria-label="Close project">&#x2715;</button>
    <div class="modal__hero">
      <img class="modal__hero-image" src="${project.hero_image}" alt="${project.title}">
    </div>
    <div class="modal__body">
      <p class="modal__number t-micro">${num}</p>
      <h2 class="modal__title">${project.title}</h2>
      <p class="modal__location">${project.location} · ${project.year}</p>
      <p class="modal__description">${project.description}</p>
      ${galleryImages ? `<div class="modal__gallery">${galleryImages}</div>` : ''}
      ${serviceItems ? `<div class="modal__services">${serviceItems}</div>` : ''}
    </div>
  `;

  $('.modal__close', modal).addEventListener('click', closeModal);

  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
  modal.setAttribute('tabindex', '-1');
  modal.focus();
}

function closeModal() {
  const overlay = $('.modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
}

function initModal() {
  const overlay = $('.modal-overlay');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}


/* ----------------------------------------------------------
   SCROLL REVEAL — IntersectionObserver
   ---------------------------------------------------------- */

function initReveal() {
  const elements = $$('.reveal:not(.is-visible)');
  if (!elements.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.05 }
  );

  elements.forEach((el) => {
    // Immediately reveal anything already in the viewport
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('is-visible');
    } else {
      observer.observe(el);
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

  // Check immediately on load
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
   INQUIRY FORM — v0 stub (Worker wired in v1)
   ---------------------------------------------------------- */

function initInquiryForm() {
  const form    = $('.inquire__form');
  const success = $('.inquire__success');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = $('[type="submit"]', form);
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending…'; }

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.services = $$('input[name="services"]:checked', form).map(cb => cb.value);

    console.log('Inquiry payload (v0 stub):', payload);

    setTimeout(() => {
      if (form && success) {
        form.style.display = 'none';
        success.classList.add('is-visible');
      }
    }, 600);
  });
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
  initReveal();

  const projects = await loadProjects();
  renderWork(projects);
  initInquiryForm();
}

document.addEventListener('DOMContentLoaded', init);
