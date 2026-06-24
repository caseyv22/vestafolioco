/* ============================================================
   /admin/reset-password.js
   Reads ?token=... from the URL, posts to /api/auth/reset-password.
   ============================================================ */

const params = new URLSearchParams(window.location.search);
const token  = params.get('token') || '';

const formEl    = document.getElementById('reset-form');
const errorEl   = document.getElementById('reset-error');
const successEl = document.getElementById('reset-success');
const invalidEl = document.getElementById('reset-invalid');
const invalidMessageEl = document.getElementById('reset-invalid-message');
const submitBtn = formEl.querySelector('[type="submit"]');

if (!token) {
  showInvalid('This reset link is invalid.');
} else {
  // Token present — reveal the form
  formEl.hidden = false;
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const data = new FormData(formEl);
  const newPassword = String(data.get('new_password') || '');
  const confirmPassword = String(data.get('confirm_password') || '');

  if (newPassword.length < 8) {
    showError('Password must be at least 8 characters.');
    return;
  }
  if (newPassword !== confirmPassword) {
    showError('Passwords do not match.');
    return;
  }

  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Updating…';

  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (res.ok) {
      formEl.hidden = true;
      successEl.hidden = false;
      setTimeout(() => {
        window.location.href = '/admin/login';
      }, 2500);
      return;
    }

    let message = 'Reset failed. Please try again.';
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch { /* keep default */ }
    showError(message);

  } catch (err) {
    console.error('Reset-password network error:', err);
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

function showInvalid(message) {
  formEl.hidden = true;
  invalidMessageEl.textContent = message;
  invalidEl.hidden = false;
}
