/* ============================================================
   /admin/account.js
   - Auth gate (same as /admin/admin.js)
   - Log-out button
   - Change-password form
   ============================================================ */

const loadingEl       = document.getElementById('admin-loading');
const authenticatedEl = document.getElementById('admin-authenticated');
const userEmailEl     = document.getElementById('admin-user-email');
const logoutBtn       = document.getElementById('logout-btn');

const passwordForm    = document.getElementById('password-form');
const passwordError   = document.getElementById('password-error');
const passwordSuccess = document.getElementById('password-success');
const passwordSubmit  = passwordForm.querySelector('[type="submit"]');

// Auth gate
(async function checkSession() {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (res.status === 401 || !res.ok) {
      redirectToLogin();
      return;
    }

    const body = await res.json();
    if (!body || !body.user) {
      redirectToLogin();
      return;
    }

    userEmailEl.textContent = body.user.email;
    if (body.user.role === 'super_admin') {
      const nt = document.getElementById('nav-team');
      if (nt) nt.hidden = false;
    }
    loadingEl.hidden = true;
    authenticatedEl.hidden = false;

  } catch (err) {
    console.error('Auth check failed:', err);
    redirectToLogin();
  }
})();

// Log out
logoutBtn.addEventListener('click', async () => {
  logoutBtn.disabled = true;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error('Logout error (continuing):', err);
  } finally {
    window.location.href = '/admin/login';
  }
});

// Change password
passwordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessages();

  const data = new FormData(passwordForm);
  const oldPassword     = String(data.get('old_password') || '');
  const newPassword     = String(data.get('new_password') || '');
  const confirmPassword = String(data.get('confirm_password') || '');

  if (!oldPassword) {
    showError('Current password is required.');
    return;
  }
  if (newPassword.length < 8) {
    showError('New password must be at least 8 characters.');
    return;
  }
  if (newPassword !== confirmPassword) {
    showError('New passwords do not match.');
    return;
  }
  if (newPassword === oldPassword) {
    showError('New password must be different from the current password.');
    return;
  }

  const originalLabel = passwordSubmit.textContent;
  passwordSubmit.disabled = true;
  passwordSubmit.textContent = 'Updating...';

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_password: oldPassword,
        new_password: newPassword,
      }),
    });

    if (res.ok) {
      passwordForm.reset();
      passwordSuccess.hidden = false;
      // Auto-hide the success after a few seconds
      setTimeout(() => { passwordSuccess.hidden = true; }, 6000);
      return;
    }

    let message = 'Could not update password.';
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch { /* keep default */ }
    showError(message);

  } catch (err) {
    console.error('Change-password network error:', err);
    showError('Could not connect. Check your connection and try again.');
  } finally {
    passwordSubmit.disabled = false;
    passwordSubmit.textContent = originalLabel;
  }
});

function showError(message) {
  passwordError.textContent = message;
  passwordError.hidden = false;
}

function clearMessages() {
  passwordError.textContent = '';
  passwordError.hidden = true;
  passwordSuccess.hidden = true;
}

function redirectToLogin() {
  window.location.href = '/admin/login';
}
