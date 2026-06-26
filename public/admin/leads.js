/* /admin/leads.js
   Combined leads list + lead detail.
   No ?id= param -> show list.
   ?id=N         -> show lead detail.
*/

const params = new URLSearchParams(window.location.search);
const leadId = Number(params.get('id'));

if (leadId) {
  initDetail(leadId);
} else {
  initList();
}

/* ============================================================
   LIST VIEW
   ============================================================ */

function initList() {
  document.getElementById('list-view').hidden  = false;
  document.getElementById('detail-view').hidden = true;

  const logoutBtn   = document.getElementById('logout-btn');
  const loading     = document.getElementById('page-loading');
  const content     = document.getElementById('list-view');
  const pageError   = document.getElementById('page-error');
  const tbody       = document.getElementById('leads-tbody');
  const tableWrap   = document.getElementById('leads-table-wrap');
  const emptyEl     = document.getElementById('leads-empty');
  const searchInput = document.getElementById('search-input');
  const pagination  = document.getElementById('pagination');
  const prevBtn     = document.getElementById('prev-btn');
  const nextBtn     = document.getElementById('next-btn');
  const pageInfo    = document.getElementById('page-info');
  const statusFilters = document.getElementById('status-filters');

  const LIMIT = 50;
  let currentStatus = '';
  let currentSearch = '';
  let currentOffset = 0;
  let totalLeads    = 0;
  let searchTimer   = null;

  const STATUS_CLASS   = { Unassigned:'neutral', Contacted:'blue', Booked:'gold', Filming:'gold', Editing:'gold', Delivered:'green', Archived:'neutral' };

  (async () => {
    try {
      const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
      if (!me.ok) { window.location.href = '/admin/login'; return; }
      loading.hidden = true;
      await loadLeads();
    } catch { window.location.href = '/admin/login'; }
  })();

  logoutBtn.addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/admin/login'; });

  statusFilters.addEventListener('click', e => {
    const btn = e.target.closest('.leads__filter'); if (!btn) return;
    document.querySelectorAll('.leads__filter').forEach(b => b.classList.remove('leads__filter--active'));
    btn.classList.add('leads__filter--active');
    currentStatus = btn.dataset.status; currentOffset = 0; loadLeads();
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { currentSearch = searchInput.value.trim(); currentOffset = 0; loadLeads(); }, 350);
  });

  prevBtn.addEventListener('click', () => { currentOffset = Math.max(0, currentOffset - LIMIT); loadLeads(); });
  nextBtn.addEventListener('click', () => { currentOffset += LIMIT; loadLeads(); });

  async function loadLeads() {
    tableWrap.hidden = true; emptyEl.hidden = true; pageError.hidden = true;
    const p = new URLSearchParams({ limit: LIMIT, offset: currentOffset });
    if (currentStatus) p.set('status', currentStatus);
    if (currentSearch) p.set('search', currentSearch);
    try {
      const res  = await fetch(`/api/admin/leads?${p}`, { headers: { Accept: 'application/json' } });
      const body = res.ok ? await res.json() : null;
      if (!body) { pageError.textContent = 'Could not load leads.'; pageError.hidden = false; return; }
      totalLeads = body.total || 0;
      const leads = body.leads || [];
      if (leads.length === 0) { emptyEl.hidden = false; pagination.hidden = true; return; }
      tbody.innerHTML = '';
      leads.forEach(l => {
        const tr = document.createElement('tr'); tr.className = 'projects__row leads__row';
        const date = l.received_at ? new Date(l.received_at).toLocaleDateString() : '—';
        tr.innerHTML = `
          <td class="projects__td projects__td--title">
            <span class="projects__title">${esc(l.name)}</span>
            <span class="projects__slug">${esc(l.email)}</span>
          </td>
          <td class="projects__td projects__td--meta">${esc(l.property_address)}</td>
          <td class="projects__td projects__td--meta">${date}</td>
          <td class="projects__td projects__td--meta">
            <span class="dash__badge dash__badge--${STATUS_CLASS[l.status] || 'neutral'}">${esc(l.status)}</span>
          </td>
          <td class="projects__td projects__td--actions">
            <a class="projects__action" href="/admin/leads?id=${l.id}">View</a>
          </td>`;
        tbody.appendChild(tr);
      });
      tableWrap.hidden = false;
      const totalPages  = Math.ceil(totalLeads / LIMIT);
      const currentPage = Math.floor(currentOffset / LIMIT) + 1;
      if (totalLeads > LIMIT) {
        pagination.hidden = false;
        prevBtn.disabled  = currentOffset === 0;
        nextBtn.disabled  = currentOffset + LIMIT >= totalLeads;
        pageInfo.textContent = `Page ${currentPage} of ${totalPages} · ${totalLeads} leads`;
      } else { pagination.hidden = true; }
    } catch { pageError.textContent = 'Could not connect.'; pageError.hidden = false; }
  }
}

/* ============================================================
   DETAIL VIEW
   ============================================================ */

function initDetail(leadId) {
  document.getElementById('list-view').hidden  = true;
  document.getElementById('detail-view').hidden = false;

  const logoutBtn    = document.getElementById('logout-btn');
  const loading      = document.getElementById('page-loading');
  const errorWrap    = document.getElementById('detail-error-wrap');
  const errorMsg     = document.getElementById('detail-error-msg');
  const detailContent= document.getElementById('detail-content');
  const createBtn    = document.getElementById('create-project-btn');
  const saveBtn      = document.getElementById('save-status-btn');
  const statusSelect = document.getElementById('status-select');
  const notesEl      = document.getElementById('notes-internal');
  const statusBadge  = document.getElementById('status-badge');
  const statusError  = document.getElementById('status-error');
  const statusSuccess= document.getElementById('status-success');
  const linkedWrap   = document.getElementById('linked-project-wrap');
  const linkedLink   = document.getElementById('linked-project-link');

  const SERVICE_LABELS = { hdr:'HDR Photography', cinematic:'Cinematic Tour', staging:'AI Staging' };
  let currentLead = null;

  (async () => {
    try {
      const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
      if (!me.ok) { window.location.href = '/admin/login'; return; }
      const res  = await fetch(`/api/admin/leads/${leadId}`, { headers: { Accept: 'application/json' } });
      const body = res.ok ? await res.json() : null;
      if (!body?.lead) { showDetailError('Lead not found.'); return; }
      currentLead = body.lead;
      populate(currentLead);
      loading.hidden = true; detailContent.hidden = false;
    } catch { showDetailError('Could not connect.'); }
  })();

  logoutBtn.addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/admin/login'; });

  function populate(l) {
    document.title = `${l.name} — Vesta Folio`;
    document.getElementById('lead-name').textContent    = l.name;
    document.getElementById('lead-address').textContent = l.property_address;
    document.getElementById('d-name').textContent       = l.name;
    const emailEl = document.getElementById('d-email');
    emailEl.textContent = l.email; emailEl.href = `mailto:${l.email}`;
    document.getElementById('d-brokerage').textContent    = l.brokerage || '—';
    document.getElementById('d-received').textContent     = l.received_at ? new Date(l.received_at).toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }) : '—';
    document.getElementById('d-address').textContent      = l.property_address;
    document.getElementById('d-listing-date').textContent = l.listing_date || '—';
    document.getElementById('d-sqft').textContent         = l.sq_ft ? `${Number(l.sq_ft).toLocaleString()} sq ft` : '—';
    document.getElementById('d-beds').textContent         = l.bedrooms ?? '—';
    document.getElementById('d-baths').textContent        = l.bathrooms ?? '—';
    document.getElementById('d-price').textContent        = l.listing_price ? `$${Number(l.listing_price).toLocaleString()}` : '—';
    const svcs = l.services ? l.services.split(',').map(s => SERVICE_LABELS[s] || s).join(', ') : '—';
    document.getElementById('d-services').textContent = svcs;
    document.getElementById('d-notes').textContent    = l.notes || '—';
    statusSelect.value = l.status || 'Unassigned';
    notesEl.value      = l.notes_internal || '';
    updateBadge(l.status);
    if (l.client_project_id) { linkedWrap.hidden = false; linkedLink.href = `/admin/client-project?id=${l.client_project_id}`; }
  }

  function updateBadge(status) {
    const cls = { Unassigned:'neutral', Contacted:'blue', Booked:'gold', Filming:'gold', Editing:'gold', Delivered:'green', Archived:'neutral' };
    statusBadge.textContent = status;
    statusBadge.className   = `dash__badge dash__badge--${cls[status] || 'neutral'}`;
  }

  saveBtn.addEventListener('click', async () => {
    statusError.hidden = true; statusSuccess.hidden = true;
    const orig = saveBtn.textContent; saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
    try {
      const res  = await fetch(`/api/admin/leads/${leadId}`, { method:'PATCH', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ status: statusSelect.value, notes_internal: notesEl.value }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { statusError.textContent = body.error || 'Could not save.'; statusError.hidden = false; return; }
      currentLead = body.lead; updateBadge(body.lead.status);
      statusSuccess.textContent = 'Saved.'; statusSuccess.hidden = false;
      setTimeout(() => statusSuccess.hidden = true, 4000);
    } catch { statusError.textContent = 'Could not connect.'; statusError.hidden = false; }
    finally { saveBtn.disabled = false; saveBtn.textContent = orig; }
  });

  createBtn.addEventListener('click', async () => {
    if (!currentLead) return;
    if (currentLead.client_project_id) { window.location.href = `/admin/client-project?id=${currentLead.client_project_id}`; return; }
    const orig = createBtn.textContent; createBtn.disabled = true; createBtn.textContent = 'Creating…';
    const slug = slugify(currentLead.property_address || currentLead.name);
    const payload = {
      title: currentLead.property_address || currentLead.name,
      slug,
      location: extractCity(currentLead.property_address),
      year: new Date().getFullYear(),
      description: `Property at ${currentLead.property_address}. Client: ${currentLead.name}.`,
      services: currentLead.services ? currentLead.services.split(',') : [],
    };
    try {
      let res  = await fetch('/api/admin/client-projects', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify(payload) });
      let body = await res.json().catch(() => ({}));
      if (!res.ok && res.status === 409) {
        payload.slug = slug + '-' + Date.now().toString(36);
        res  = await fetch('/api/admin/client-projects', { method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify(payload) });
        body = await res.json().catch(() => ({}));
      }
      if (!res.ok) { alert(body.error || 'Could not create project.'); return; }
      await fetch(`/api/admin/leads/${leadId}`, { method:'PATCH', headers:{'Content-Type':'application/json',Accept:'application/json'}, body: JSON.stringify({ client_project_id: body.project.id, status: currentLead.status === 'Unassigned' ? 'Contacted' : currentLead.status }) });
      window.location.href = `/admin/client-project?id=${body.project.id}&created=1`;
    } catch { alert('Could not connect.'); }
    finally { createBtn.disabled = false; createBtn.textContent = orig; }
  });

  function showDetailError(msg) { loading.hidden = true; errorWrap.hidden = false; errorMsg.textContent = msg; }
  function slugify(t) { return String(t||'').toLowerCase().trim().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,60); }
  function extractCity(a) { if (!a) return ''; const p = a.split(','); return p.length >= 2 ? p[p.length-2].trim() : a.trim(); }
}

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
