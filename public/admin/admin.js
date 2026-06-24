/* ============================================================
   /admin/admin.js
   Auth gate. On page load, fetch /api/auth/me.
   - 200 → reveal the authenticated UI
   - 401 → redirect to /admin/login
   Log-out button posts to /api/auth/logout and returns to login.
   ============================================================ */

const loadingEl       = document.getElementById('admin-loading');
const authenticatedEl = document.getElementById('admin-authenticated');
const userEmailEl     = document.getElementById('admin-user-email');
const logoutBtn       = document.getElementById('logout-btn');

(async function checkSession() {
  try {
    const res = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (res.status === 401) {
      redirectToLogin();
      return;
    }
    if (!res.ok) {
      console.error('Auth check failed with status', res.status);
      redirectToLogin();
      return;
    }

    const body = await res.json();
    if (!body || !body.user) {
      redirectToLogin();
      return;
    }

    // Authenticated — reveal UI
    userEmailEl.textContent = body.user.email;
    loadingEl.hidden = true;
    authenticatedEl.hidden = false;

  } catch (err) {
    console.error('Auth check network error:', err);
    redirectToLogin();
  }
})();

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

function redirectToLogin() {
  window.location.href = '/admin/login';
}
