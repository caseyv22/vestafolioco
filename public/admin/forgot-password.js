/* ============================================================
   /admin/forgot-password.js
   Posts email to /api/auth/forgot-password.
   On success, swaps form for the generic "if account exists" message.
   ============================================================ */

const form       = document.getElementById('forgot-form');
const errorEl    = document.getElementById('forgot-error');
const successEl  = document.getElementById('forgot-success');
const submitBtn  = form.querySelector('[type="submit"]');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const originalLabel = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending…';

  const data = new FormData(form);
  const payload = {
    email: String(data.get('email') || '').trim(),
  };

  if (!payload.email) {
    showError('Email is required.');
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
    return;
  }

  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // Replace form with success state. Same message whether or not the email exists.
      form.hidden = true;
      successEl.hidden = false;
      return;
    }

    let message = 'Could not send reset link. Please try again.';
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch { /* keep default */ }
    showError(message);

  } catch (err) {
    console.error('Forgot-password network error:', err);
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
