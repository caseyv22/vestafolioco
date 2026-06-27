/* /admin/clients.js - All clients list with project access detail */

const logoutBtn    = document.getElementById('logout-btn');
const pageLoading  = document.getElementById('page-loading');
const pageContent  = document.getElementById('page-content');
const pageError    = document.getElementById('page-error');
const tableWrap    = document.getElementById('clients-table-wrap');
const clientsTbody = document.getElementById('clients-tbody');
const clientsEmpty = document.getElementById('clients-empty');
const searchInput  = document.getElementById('search-input');
const detailModal  = document.getElementById('detail-modal');
const detailModalClose = document.getElementById('detail-modal-close');
const detailModalTitle = document.getElementById('detail-modal-title');
const detailBody   = document.getElementById('detail-body');

const CP_STATUS_CLASS = { Booked:'gold', Filming:'gold', Editing:'gold', Delivered:'green', Archived:'neutral' };

let searchTimer = null;

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '-'; }

(async () => {
  try {
    const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    if (!me.ok) { window.location.href = '/admin/login'; return; }
    const meData = await me.json();
    if (meData.user.role !== 'admin' && meData.user.role !== 'super_admin') { window.location.href = '/admin/login'; return; }
    if (meData.user.role === 'super_admin') {
      const navTeam = document.getElementById('nav-team');
      if (navTeam) navTeam.hidden = false;
    }
    pageLoading.hidden = true; pageContent.hidden = false;
    await loadClients('');
  } catch { window.location.href = '/admin/login'; }
})();

logoutBtn.addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/admin/login'; });

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadClients(searchInput.value.trim()), 350);
});

async function loadClients(search) {
  tableWrap.hidden = true; clientsEmpty.hidden = true; pageError.hidden = true;
  try {
    const q   = search ? `?search=${encodeURIComponent(search)}` : '';
    const res  = await fetch(`/api/admin/all-clients${q}`, { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    const clients = body?.clients || [];
    if (!clients.length) { clientsEmpty.hidden = false; return; }
    clientsTbody.innerHTML = clients.map(c => {
      const projCount = c.projects?.length || 0;
      const projLabel = projCount === 0 ? '<span style="color:var(--color-sage);">None</span>'
        : projCount === 1 ? esc(c.projects[0].title)
        : `${projCount} projects`;
      return `<tr class="projects__row">
        <td class="projects__td projects__td--title">
          <span class="projects__title">${esc(c.name || '-')}</span>
        </td>
        <td class="projects__td">${esc(c.email)}</td>
        <td class="projects__td projects__td--meta">${projLabel}</td>
        <td class="projects__td projects__td--meta">${fmtDate(c.last_login_at)}</td>
        <td class="projects__td projects__td--actions">
          <button class="projects__action" data-id="${c.id}" type="button">View</button>
        </td>
      </tr>`;
    }).join('');
    clientsTbody.querySelectorAll('.projects__action[data-id]').forEach(btn => {
      btn.addEventListener('click', () => openDetail(btn.dataset.id));
    });
    tableWrap.hidden = false;
  } catch (err) {
    console.error(err);
    pageError.textContent = 'Could not load clients.'; pageError.hidden = false;
  }
}

// -- Detail modal --

async function openDetail(clientId) {
  detailBody.innerHTML = '<div class="admin__loading"><p>Loading...</p></div>';
  detailModal.hidden = false;
  try {
    const res  = await fetch(`/api/admin/all-clients/${clientId}`, { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    if (!body?.client) { detailBody.innerHTML = '<p class="admin__body admin__body--muted">Could not load client.</p>'; return; }
    const c = body.client;
    detailModalTitle.textContent = c.name || c.email;
    const projectRows = (c.projects && c.projects.length)
      ? c.projects.map(p => {
          const cls = CP_STATUS_CLASS[p.status] || 'gold';
          return `<tr class="projects__row">
            <td class="projects__td"><a class="projects__action" href="/admin/client-project?id=${p.id}">${esc(p.title)}</a></td>
            <td class="projects__td projects__td--meta"><span class="dash__badge dash__badge--${cls}">${esc(p.status || '-')}</span></td>
            <td class="projects__td projects__td--meta">${fmtDate(p.granted_at)}</td>
            <td class="projects__td projects__td--actions">
              <button class="projects__action projects__action--danger" data-uid="${c.id}" data-cpid="${p.id}" data-title="${esc(p.title)}" type="button">Revoke</button>
            </td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="4" class="projects__empty" style="padding:var(--space-4);"><p class="admin__body admin__body--muted">No project access.</p></td></tr>';

    detailBody.innerHTML = `
      <div style="margin-bottom:var(--space-5);">
        <dl style="display:grid;grid-template-columns:auto 1fr;gap:var(--space-2) var(--space-5);">
          <dt class="admin__label" style="margin:0;">EMAIL</dt><dd class="admin__body" style="margin:0;">${esc(c.email)}</dd>
          <dt class="admin__label" style="margin:0;">JOINED</dt><dd class="admin__body" style="margin:0;">${fmtDate(c.created_at)}</dd>
          <dt class="admin__label" style="margin:0;">LAST LOGIN</dt><dd class="admin__body" style="margin:0;">${fmtDate(c.last_login_at)}</dd>
        </dl>
      </div>
      <p class="admin__label" style="margin-bottom:var(--space-3);">PROJECT ACCESS</p>
      <div class="projects__table-wrap" style="margin:0;">
        <table class="projects__table">
          <thead>
            <tr>
              <th class="projects__th">Project</th>
              <th class="projects__th projects__th--meta">Status</th>
              <th class="projects__th projects__th--meta">Granted</th>
              <th class="projects__th projects__th--actions"></th>
            </tr>
          </thead>
          <tbody id="detail-proj-tbody">${projectRows}</tbody>
        </table>
      </div>`;

    detailBody.querySelectorAll('.projects__action--danger[data-cpid]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Revoke access to "${btn.dataset.title}"?`)) return;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/admin/clients/${btn.dataset.uid}/access/cp/${btn.dataset.cpid}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
          if (r.ok) btn.closest('tr').remove();
          else btn.disabled = false;
        } catch { btn.disabled = false; }
      });
    });
  } catch (err) {
    console.error(err);
    detailBody.innerHTML = '<p class="admin__body admin__body--muted">Could not load client.</p>';
  }
}

detailModalClose.addEventListener('click', () => { detailModal.hidden = true; });
detailModal.addEventListener('click', e => { if (e.target === detailModal) detailModal.hidden = true; });
