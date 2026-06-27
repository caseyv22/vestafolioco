/* /admin/team.js - Team management (super_admin only) */

const logoutBtn   = document.getElementById('logout-btn');
const pageLoading = document.getElementById('page-loading');
const pageContent = document.getElementById('page-content');
const pageError   = document.getElementById('page-error');
const pageSuccess = document.getElementById('page-success');
const tableWrap   = document.getElementById('team-table-wrap');
const teamTbody   = document.getElementById('team-tbody');
const teamEmpty   = document.getElementById('team-empty');

const inviteBtn       = document.getElementById('invite-btn');
const inviteModal     = document.getElementById('invite-modal');
const inviteModalClose= document.getElementById('invite-modal-close');
const inviteCancel    = document.getElementById('invite-cancel');
const inviteForm      = document.getElementById('invite-form');
const inviteName      = document.getElementById('invite-name');
const inviteEmail     = document.getElementById('invite-email');
const inviteError     = document.getElementById('invite-error');
const inviteSubmit    = document.getElementById('invite-submit');

const removeModal     = document.getElementById('remove-modal');
const removeModalClose= document.getElementById('remove-modal-close');
const removeCancel    = document.getElementById('remove-cancel');
const removeConfirm   = document.getElementById('remove-confirm');
const removeModalBody = document.getElementById('remove-modal-body');
const removeError     = document.getElementById('remove-error');

let currentUserId = null;
let pendingRemoveId = null;

function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : 'Never'; }

(async () => {
  try {
    const me = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
    if (!me.ok) { window.location.href = '/admin/login'; return; }
    const meData = await me.json();
    if (meData.role !== 'super_admin') { window.location.href = '/admin'; return; }
    currentUserId = meData.id || meData.user_id;
    pageLoading.hidden = true; pageContent.hidden = false;
    await loadTeam();
  } catch { window.location.href = '/admin/login'; }
})();

logoutBtn.addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/admin/login'; });

async function loadTeam() {
  tableWrap.hidden = true; teamEmpty.hidden = true;
  try {
    const res  = await fetch('/api/admin/team', { headers: { Accept: 'application/json' } });
    const body = res.ok ? await res.json() : null;
    const team = body?.team || [];
    if (!team.length) { teamEmpty.hidden = false; return; }
    teamTbody.innerHTML = team.map(m => {
      const isSelf = m.id === currentUserId;
      const isSuper = m.role === 'super_admin';
      const roleLabel = isSuper ? '<span style="color:var(--color-gold);font-weight:500;">Super admin</span>' : 'Admin';
      const actions = (!isSelf && !isSuper)
        ? `<button class="projects__action projects__action--danger" data-id="${m.id}" data-name="${esc(m.name || m.email)}" type="button">Remove</button>`
        : '';
      return `<tr class="projects__row">
        <td class="projects__td projects__td--title">
          <span class="projects__title">${esc(m.name || '-')}${isSelf ? ' <span style="color:var(--color-sage);font-size:var(--text-micro);">(you)</span>' : ''}</span>
        </td>
        <td class="projects__td">${esc(m.email)}</td>
        <td class="projects__td projects__td--meta">${roleLabel}</td>
        <td class="projects__td projects__td--meta">${fmtDate(m.last_login_at)}</td>
        <td class="projects__td projects__td--actions">${actions}</td>
      </tr>`;
    }).join('');
    teamTbody.querySelectorAll('.projects__action--danger').forEach(btn => {
      btn.addEventListener('click', () => openRemoveModal(btn.dataset.id, btn.dataset.name));
    });
    tableWrap.hidden = false;
  } catch (err) {
    console.error(err);
    pageError.textContent = 'Could not load team.'; pageError.hidden = false;
  }
}

// -- Invite modal --

inviteBtn.addEventListener('click', () => { inviteForm.reset(); inviteError.hidden = true; inviteModal.hidden = false; inviteName.focus(); });
inviteModalClose.addEventListener('click', () => { inviteModal.hidden = true; });
inviteCancel.addEventListener('click',     () => { inviteModal.hidden = true; });
inviteModal.addEventListener('click', e => { if (e.target === inviteModal) inviteModal.hidden = true; });

inviteForm.addEventListener('submit', async e => {
  e.preventDefault(); inviteError.hidden = true;
  const name  = inviteName.value.trim();
  const email = inviteEmail.value.trim();
  if (!name || !email) { inviteError.textContent = 'Name and email are required.'; inviteError.hidden = false; return; }
  const orig = inviteSubmit.textContent; inviteSubmit.disabled = true; inviteSubmit.textContent = 'Sending...';
  try {
    const res  = await fetch('/api/admin/team', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ name, email }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { inviteError.textContent = body.error || 'Could not add team member.'; inviteError.hidden = false; return; }
    inviteModal.hidden = true;
    pageSuccess.textContent = 'Invite sent. They will receive an email to set their password.';
    pageSuccess.hidden = false; setTimeout(() => pageSuccess.hidden = true, 6000);
    await loadTeam();
  } catch { inviteError.textContent = 'Could not connect.'; inviteError.hidden = false; }
  finally { inviteSubmit.disabled = false; inviteSubmit.textContent = orig; }
});

// -- Remove modal --

function openRemoveModal(id, name) {
  pendingRemoveId = id;
  removeModalBody.textContent = `Remove ${name} from the team? This cannot be undone.`;
  removeError.hidden = true;
  removeModal.hidden = false;
}

removeModalClose.addEventListener('click', () => { removeModal.hidden = true; });
removeCancel.addEventListener('click',     () => { removeModal.hidden = true; });
removeModal.addEventListener('click', e => { if (e.target === removeModal) removeModal.hidden = true; });

removeConfirm.addEventListener('click', async () => {
  if (!pendingRemoveId) return;
  removeError.hidden = true;
  const orig = removeConfirm.textContent; removeConfirm.disabled = true; removeConfirm.textContent = 'Removing...';
  try {
    const res  = await fetch(`/api/admin/team/${pendingRemoveId}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { removeError.textContent = body.error || 'Could not remove.'; removeError.hidden = false; return; }
    removeModal.hidden = true;
    pageSuccess.textContent = 'Team member removed.'; pageSuccess.hidden = false;
    setTimeout(() => pageSuccess.hidden = true, 4000);
    await loadTeam();
  } catch { removeError.textContent = 'Could not connect.'; removeError.hidden = false; }
  finally { removeConfirm.disabled = false; removeConfirm.textContent = orig; }
});
