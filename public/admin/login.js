/* ============================================================
   /admin/login.js
   Sign-in handler — posts to /api/auth/login.
   On success, redirects to the role-appropriate landing page.
   ============================================================ */

const form     = document.getElementById('login-form');
const errorEl  = document.getElementById('login-error');
const submitBtn = form.querySelector('[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  clearError();

  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  const data = new FormData(form);
  const payload = {
    email: String(data.get('email') || '').trim(),
    password: String(data.get('password') || ''),
  };

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      window.location.href = body.redirect || '/admin';
      return;
    }

    let message = 'Sign in failed. Please try again.';
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch { /* keep default */ }
    showError(message);

  } catch (err) {
    console.error('Login network error:', err);
    showError('Could not connect. Check your connection and try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function clearError() {
  errorEl.textContent = '';
  errorEl.hidden = true;
}
