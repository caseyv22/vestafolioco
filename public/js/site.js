// public/js/site.js
// Vesta Folio — public site JS
// No dependencies. ES module. Runs as <script type="module">.

'use strict';

/* ----------------------------------------------------------
   CONSTANTS
   ---------------------------------------------------------- */

const SERVICE_LABELS = {
  hdr:      'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:  'AI Staging',
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
    const projects = await res.json();
    return projects;
  } catch (err) {
    console.error('Could not load projects:', err);
    return [];
  }
}

function buildProjectCard(project, index) {
  const num = pad(index + 1);
  const serviceLabels = (project.services || [])
    .map(s => SERVICE_LABELS[s] || s)
    .join(' · ');

  const card = document.createElement('article');
  card.className = 'work__card reveal';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `View project: ${project.title}`);
  card.dataset.slug = project.slug;

  card.innerHTML = `
    <div class="work__card-image-wrap">
      <img
        class="work__card-image"
        src="${project.hero_image}"
        alt="${project.title} — ${project.location}"
        loading="lazy"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
      >
      <div class="work__card-placeholder" style="display:none;">
        <span class="work__card-placeholder-num">${num}</span>
      </div>
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

    // Open modal on click or Enter key
    card.addEventListener('click', () => openModal(project, i));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openModal(project, i);
      }
    });
  });

  // Trigger scroll reveal after render
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
    .map(src => `
      <img
        class="modal__gallery-image"
        src="${src}"
        alt="${project.title} gallery image"
        loading="lazy"
      >
    `).join('');

  modal.innerHTML = `
    <button class="modal__close" aria-label="Close project">&#x2715;</button>
    <div class="modal__hero">
      <img
        class="modal__hero-image"
        src="${project.hero_image}"
        alt="${project.title}"
      >
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

  // Wire up close button
  $('.modal__close', modal).addEventListener('click', closeModal);

  // Open
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';

  // Focus management
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

  // Close on overlay background click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}


/* ----------------------------------------------------------
   SCROLL REVEAL — IntersectionObserver
   ---------------------------------------------------------- */

function initReveal() {
  const elements = $$('.reveal');
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
    {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px',
    }
  );

  elements.forEach((el) => observer.observe(el));
}


/* ----------------------------------------------------------
   STICKY NAV — fills with Forest color after hero
   ---------------------------------------------------------- */

function initNav() {
  const nav = $('.nav');
  if (!nav) return;

  const hero = $('.hero');
  if (!hero) return;

  // Apply immediately on load in case page is already scrolled
  const applyFilled = () => {
    const heroBottom = hero.getBoundingClientRect().bottom;
    nav.classList.toggle('is-filled', heroBottom <= 0);
  };

  applyFilled();

  const observer = new IntersectionObserver(
    ([entry]) => {
      nav.classList.toggle('is-filled', !entry.isIntersecting);
    },
    { threshold: 0, rootMargin: '0px 0px 0px 0px' }
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

  hamburger.addEventListener('click', () => {
    menu.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      menu.classList.remove('is-open');
      document.body.style.overflow = '';
    });
  }

  // Close on link click
  $$('.mobile-menu__link', menu).forEach((link) => {
    link.addEventListener('click', () => {
      menu.classList.remove('is-open');
      document.body.style.overflow = '';
    });
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      menu.classList.remove('is-open');
      document.body.style.overflow = '';
    }
  });
}


/* ----------------------------------------------------------
   INQUIRY FORM
   v0: logs to console. Worker endpoint wired in v1.
   ---------------------------------------------------------- */

function initInquiryForm() {
  const form    = $('.inquire__form');
  const success = $('.inquire__success');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = $('[type="submit"]', form);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
    }

    const data = new FormData(form);
    const payload = Object.fromEntries(data.entries());

    // Services: FormData only returns the last checked value for same-name fields.
    // Collect all checked checkboxes manually.
    const services = $$('input[name="services"]:checked', form).map(cb => cb.value);
    payload.services = services;

    // v0: stub — real Worker POST wired in v1
    console.log('Inquiry payload (v0 stub):', payload);

    // Simulate success for now
    setTimeout(() => {
      if (form && success) {
        form.style.display = 'none';
        success.classList.add('is-visible');
      }
    }, 600);
  });
}


/* ----------------------------------------------------------
   SMOOTH SCROLL for anchor links
   ---------------------------------------------------------- */

function initSmoothScroll() {
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href').slice(1);
      const target = document.getElementById(id);
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
  initReveal(); // reveals for static elements

  const projects = await loadProjects();
  renderWork(projects); // also calls initReveal for dynamic cards
  initInquiryForm();
}

document.addEventListener('DOMContentLoaded', init);
