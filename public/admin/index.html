
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Studio admin — Vesta Folio</title>
  <meta name="robots" content="noindex, nofollow">
  <link rel="icon" href="/brand/favicon.ico">
  <link rel="stylesheet" href="/css/tokens.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/admin/admin.css">
</head>
<body class="admin-page">

  <nav class="admin__nav" aria-label="Studio admin">
    <a class="admin__nav-logo" href="/admin" aria-label="Vesta Folio admin home">
      <img src="/brand/vesta-folio-horizontal.svg" alt="Vesta Folio" width="160">
    </a>
    <div class="admin__nav-links">
      <a class="admin__nav-link" href="/admin/account">Account</a>
      <button class="admin__nav-logout" id="logout-btn" type="button">Log out</button>
    </div>
  </nav>

  <main class="admin__main admin__main--wide">

    <!-- Auth loading state -->
    <div class="admin__loading" id="admin-loading">
      <p>One moment.</p>
    </div>

    <!-- Authenticated content -->
    <div id="admin-authenticated" hidden>

      <!-- Header row -->
      <div class="projects__header">
        <div>
          <p class="admin__label">STUDIO ADMIN</p>
          <h1 class="admin__heading">Projects.</h1>
        </div>
        <button class="admin__btn-primary" id="new-project-btn" type="button">
          New project
        </button>
      </div>

      <!-- Project list loading -->
      <div class="projects__loading" id="projects-loading">
        <p>Loading projects…</p>
      </div>

      <!-- Project list error -->
      <p class="admin__error" id="projects-error" hidden></p>

      <!-- Project table -->
      <div class="projects__table-wrap" id="projects-table-wrap" hidden>
        <table class="projects__table" id="projects-table">
          <thead>
            <tr>
              <th class="projects__th projects__th--order">#</th>
              <th class="projects__th">Title</th>
              <th class="projects__th projects__th--meta">Location</th>
              <th class="projects__th projects__th--meta">Year</th>
              <th class="projects__th projects__th--meta">Services</th>
              <th class="projects__th projects__th--meta">Featured</th>
              <th class="projects__th projects__th--actions">Actions</th>
            </tr>
          </thead>
          <tbody id="projects-tbody">
          </tbody>
        </table>
      </div>

      <!-- Empty state -->
      <div class="projects__empty" id="projects-empty" hidden>
        <p class="admin__body admin__body--muted">No projects yet. Add your first one.</p>
      </div>

    </div><!-- /admin-authenticated -->

  </main>

  <!-- ── Project modal ───────────────────────────────────────── -->
  <div class="modal-overlay" id="modal-overlay" hidden aria-modal="true" role="dialog" aria-labelledby="modal-title">
    <div class="modal">

      <div class="modal__header">
        <h2 class="modal__title" id="modal-title">New project</h2>
        <button class="modal__close" id="modal-close" type="button" aria-label="Close">&#215;</button>
      </div>

      <p class="admin__error" id="modal-error" hidden></p>

      <form class="modal__form" id="project-form" novalidate>

        <!-- Hidden: slug of project being edited (empty = new) -->
        <input type="hidden" id="editing-slug">

        <div class="modal__grid">

          <div class="admin__field modal__field--full">
            <label class="admin__label-input" for="field-title">Title</label>
            <input class="admin__input" type="text" id="field-title" name="title"
                   maxlength="200" autocomplete="off" required>
          </div>

          <div class="admin__field">
            <label class="admin__label-input" for="field-slug">Slug</label>
            <input class="admin__input" type="text" id="field-slug" name="slug"
                   maxlength="80" autocomplete="off" required
                   pattern="[a-z0-9]+(?:-[a-z0-9]+)*">
            <p class="admin__hint">Lowercase letters, numbers, hyphens. Auto-derived from title.</p>
          </div>

          <div class="admin__field">
            <label class="admin__label-input" for="field-location">Location</label>
            <input class="admin__input" type="text" id="field-location" name="location"
                   maxlength="200" autocomplete="off" required>
          </div>

          <div class="admin__field">
            <label class="admin__label-input" for="field-year">Year</label>
            <input class="admin__input" type="number" id="field-year" name="year"
                   min="2000" max="2100" required>
          </div>

          <div class="admin__field modal__field--full">
            <label class="admin__label-input" for="field-description">Description</label>
            <textarea class="admin__input admin__textarea" id="field-description"
                      name="description" maxlength="2000" rows="4" required></textarea>
          </div>

          <div class="admin__field">
            <fieldset class="admin__fieldset">
              <legend class="admin__label-input">Services</legend>
              <div class="admin__checkboxes">
                <label class="admin__checkbox-label">
                  <input type="checkbox" name="services" value="hdr">
                  HDR Photography
                </label>
                <label class="admin__checkbox-label">
                  <input type="checkbox" name="services" value="cinematic">
                  Cinematic Tour
                </label>
                <label class="admin__checkbox-label">
                  <input type="checkbox" name="services" value="staging">
                  AI Staging
                </label>
              </div>
            </fieldset>
          </div>

          <div class="admin__field">
            <label class="admin__label-input" for="field-order">Display order</label>
            <input class="admin__input" type="number" id="field-order" name="order"
                   min="1" max="999">
            <p class="admin__hint">Lower numbers appear first.</p>
          </div>

          <div class="admin__field modal__field--full">
            <label class="admin__checkbox-label admin__checkbox-label--featured">
              <input type="checkbox" id="field-featured" name="featured">
              Show on homepage (Selected Work)
            </label>
          </div>

        </div><!-- /modal__grid -->

        <div class="modal__footer">
          <button class="admin__btn-ghost" type="button" id="modal-cancel">Cancel</button>
          <button class="admin__btn-primary" type="submit" id="modal-submit">Save project</button>
        </div>

      </form>
    </div><!-- /modal -->
  </div><!-- /modal-overlay -->

  <!-- ── Delete confirmation ────────────────────────────────── -->
  <div class="modal-overlay modal-overlay--confirm" id="confirm-overlay" hidden aria-modal="true" role="dialog" aria-labelledby="confirm-title">
    <div class="modal modal--narrow">
      <div class="modal__header">
        <h2 class="modal__title" id="confirm-title">Delete project</h2>
        <button class="modal__close" id="confirm-close" type="button" aria-label="Close">&#215;</button>
      </div>
      <p class="admin__body" id="confirm-body">Remove this project from the site?</p>
      <p class="admin__hint" style="margin-bottom: var(--space-4);">This removes the entry from projects.json. Images in R2 are not deleted.</p>
      <p class="admin__error" id="confirm-error" hidden></p>
      <div class="modal__footer">
        <button class="admin__btn-ghost" type="button" id="confirm-cancel">Cancel</button>
        <button class="admin__btn-danger" type="button" id="confirm-delete">Delete</button>
      </div>
    </div>
  </div>

  <script src="/admin/admin.js" type="module"></script>
</body>
</html>
