/* ============================================================
   /admin/admin.css
   Admin shell — Cream surface, thin top nav, restrained.
   Chunk 5 will fill in the main area; for now this is the
   authenticated welcome placeholder.
   ============================================================ */

.admin-page {
  background-color: var(--color-cream);
  min-height: 100vh;
  min-height: 100dvh;
}

/* Top nav */
.admin__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--gutter-mobile);
  background-color: var(--color-cream);
  border-bottom: 1px solid color-mix(in srgb, var(--color-sage) 25%, transparent);
}

.admin__nav-logo {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.admin__nav-logo img {
  display: block;
  height: auto;
  width: 140px;
}

.admin__nav-links {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.admin__nav-link {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-sage);
  text-decoration: none;
  padding: var(--space-2) var(--space-3);
  transition: color 200ms ease;
}

.admin__nav-link:hover {
  color: var(--color-gold);
}

.admin__nav-link[aria-current="page"] {
  color: var(--color-forest);
}

.admin__nav-logout {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-sage);
  background: transparent;
  border: none;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  transition: color 200ms ease;
  border-radius: 0;
}

.admin__nav-logout:hover {
  color: var(--color-gold);
}

/* Main area */
.admin__main {
  padding: var(--space-8) var(--gutter-mobile);
  max-width: 720px;
  margin: 0 auto;
}

.admin__loading {
  font-family: var(--font-display);
  font-size: var(--text-display-md);
  font-weight: var(--font-weight-regular);
  color: color-mix(in srgb, var(--color-sage) 60%, transparent);
  text-align: center;
  padding-block: var(--space-8);
}

.admin__loading p {
  margin: 0;
}

.admin__welcome[hidden] {
  display: none !important;
}

.admin__label {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-sage);
  margin: 0 0 var(--space-4) 0;
}

.admin__heading {
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 6vw, 3.25rem);
  font-weight: var(--font-weight-regular);
  line-height: var(--leading-snug);
  color: var(--color-forest);
  margin: 0 0 var(--space-5) 0;
}

.admin__body {
  font-family: var(--font-sans);
  font-size: var(--text-body);
  font-weight: var(--font-weight-regular);
  line-height: var(--leading-body);
  color: var(--color-forest);
  margin: 0 0 var(--space-4) 0;
}

.admin__body--muted {
  color: var(--color-sage);
}

.admin__email {
  color: var(--color-gold);
  font-weight: var(--font-weight-medium);
}

@media (min-width: 768px) {
  .admin__nav {
    padding-inline: var(--gutter-desktop);
  }
  .admin__main {
    padding-inline: var(--gutter-desktop);
  }
}

/* ============================================================
   Account page (chunk 4b)
   ============================================================ */

.admin__content {
  display: block;
}

.admin__content[hidden] {
  display: none !important;
}

.admin__section {
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid color-mix(in srgb, var(--color-sage) 25%, transparent);
}

.admin__section-heading {
  font-family: var(--font-display);
  font-size: clamp(1.5rem, 3.5vw, 1.875rem);
  font-weight: var(--font-weight-medium);
  line-height: var(--leading-snug);
  color: var(--color-forest);
  margin: 0 0 var(--space-5) 0;
}

.admin__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  max-width: 420px;
}

.admin__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.admin__label-input {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-sage);
}

.admin__input {
  width: 100%;
  font-family: var(--font-sans);
  font-size: var(--text-body);
  font-weight: var(--font-weight-regular);
  line-height: var(--leading-snug);
  color: var(--color-forest);
  background-color: transparent;
  border: none;
  border-bottom: 1px solid color-mix(in srgb, var(--color-sage) 40%, transparent);
  padding: var(--space-3) 0;
  border-radius: 0;
  outline: none;
  transition: border-color 200ms ease;
  -webkit-appearance: none;
  appearance: none;
}

.admin__input:focus {
  border-bottom-color: var(--color-gold);
}

.admin__input:autofill {
  -webkit-text-fill-color: var(--color-forest);
  box-shadow: 0 0 0px 1000px var(--color-cream) inset;
}

.admin__hint {
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-regular);
  letter-spacing: 0.02em;
  color: var(--color-sage);
  margin: var(--space-1) 0 0 0;
}

.admin__submit {
  align-self: flex-start;
  margin-top: var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-micro);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--color-forest);
  background-color: var(--color-gold);
  border: none;
  padding: var(--space-4) var(--space-6);
  cursor: pointer;
  transition: background-color 200ms ease, opacity 200ms ease;
  border-radius: 0;
}

.admin__submit:hover:not(:disabled) {
  background-color: color-mix(in srgb, var(--color-gold) 88%, var(--color-forest));
}

.admin__submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Error state — Gold left border, never red */
.admin__error {
  font-family: var(--font-sans);
  font-size: var(--text-body-sm);
  line-height: var(--leading-body);
  color: var(--color-forest);
  background-color: color-mix(in srgb, var(--color-gold) 12%, transparent);
  border-left: 2px solid var(--color-gold);
  padding: var(--space-3) var(--space-4);
  margin: 0;
}

.admin__error[hidden] {
  display: none !important;
}

/* Success state — Sage left border, restrained */
.admin__success {
  font-family: var(--font-sans);
  font-size: var(--text-body-sm);
  line-height: var(--leading-body);
  color: var(--color-forest);
  background-color: color-mix(in srgb, var(--color-sage) 12%, transparent);
  border-left: 2px solid var(--color-sage);
  padding: var(--space-3) var(--space-4);
  margin: 0;
}

.admin__success[hidden] {
  display: none !important;
}
