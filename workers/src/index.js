// workers/src/index.js
// Vesta Folio API Worker
//
// Routes handled:
//   POST /api/inquiries  → send branded HTML emails via Resend
//
// Email sequence per inquiry:
//   1. Notification to INQUIRY_TO (the studio) — HTML + plain-text fallback
//   2. Confirmation to inquirer — HTML + plain-text fallback
//
// If notification fails, request returns 502 (user sees error and can retry).
// If confirmation fails after notification succeeded, we log and return 200.
// Inquiry is already in the studio inbox; user-facing flow should not break.
//
// Env bindings (set on the Worker in Cloudflare dashboard):
//   RESEND_API_KEY         — Secret
//   TURNSTILE_SECRET_KEY   — Secret (optional; if unset, Turnstile validation is skipped)
//   INQUIRY_FROM           — Text  (e.g. "hello@vestafolioco.com")
//   INQUIRY_TO             — Text  (e.g. "vestafolioco@gmail.com")
//
// D1 bindings (set in wrangler.jsonc):
//   DB — vestafolioco-db (inquiry log, users, sessions)
//
// Routes added in chunk 4a (auth):
//   POST /api/auth/login    — verify password, issue session cookie
//   POST /api/auth/logout   — revoke session, clear cookie
//   GET  /api/auth/me       — return current user or 401
//
// Routes added in chunk 4b (account management):
//   POST /api/auth/change-password   — session required; old + new
//   POST /api/auth/forgot-password   — accept email; send reset link via Resend
//   POST /api/auth/reset-password    — accept token + new password

import bcrypt from 'bcryptjs';

const ALLOWED_ORIGIN = 'https://vestafolioco.com';

// Auth constants (chunk 4)
const SESSION_COOKIE = 'vf_session';
const SESSION_DAYS = 30;
// Anti-timing-attack dummy hash — used in login when email doesn't exist.
// bcrypt.compare runs against this so failed logins take ~the same time as successful ones.
const DUMMY_HASH = '$2b$12$e56ICJijxIJPH4INvT2Hfu/Q0dp1mRrLXqktHBz6c32LdZF5Kk/9O';

// Password reset (chunk 4b)
const PASSWORD_RESET_HOURS = 24;
const MIN_PASSWORD_LENGTH = 8;

const SERVICE_LABELS = {
  hdr:       'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:   'AI Staging',
};

// Brand tokens — kept in one place for any future tweaks
const BRAND = {
  forest: '#1F2E2A',
  cream:  '#F2EDE3',
  gold:   '#A8884E',
  sage:   '#4A5C57',
  serif:  "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  sans:   "'Inter', Helvetica, Arial, sans-serif",
};


export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/inquiries') {
      if (request.method === 'OPTIONS') {
        return cors(new Response(null, { status: 204 }));
      }
      if (request.method === 'POST') {
        return cors(await handleInquiry(request, env));
      }
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (url.pathname === '/api/auth/login') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleLogin(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (url.pathname === '/api/auth/logout') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleLogout(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (url.pathname === '/api/auth/me') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'GET')     return cors(await handleMe(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (url.pathname === '/api/auth/change-password') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleChangePassword(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (url.pathname === '/api/auth/forgot-password') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleForgotPassword(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    if (url.pathname === '/api/auth/reset-password') {
      if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }));
      if (request.method === 'POST')    return cors(await handleResetPassword(request, env));
      return cors(new Response('Method not allowed', { status: 405 }));
    }

    return cors(new Response('Not found', { status: 404 }));
  },
};


/* ----------------------------------------------------------
   INQUIRY HANDLER
   ---------------------------------------------------------- */

async function handleInquiry(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  // 0. Verify Turnstile token (bot protection)
  const turnstile = await validateTurnstile(data, request, env);
  if (!turnstile.ok) {
    return json({ error: turnstile.error }, 403);
  }

  const errors = validate(data);
  if (errors.length) {
    return json({ error: errors[0] }, 400);
  }

  // 1. Notification to the studio (must succeed)
  const notification = buildNotificationContent(data);
  const nResp = await sendEmail(env, {
    from:     `Vesta Folio Inquiries <${env.INQUIRY_FROM}>`,
    to:       [env.INQUIRY_TO],
    reply_to: data.email,
    subject:  notification.subject,
    html:     notification.html,
    text:     notification.text,
  });

  if (!nResp.ok) {
    const detail = await nResp.text().catch(() => '');
    console.error('Notification email failure:', nResp.status, detail);
    return json(
      { error: 'Could not deliver inquiry. Please try again, or email vestafolioco@gmail.com directly.' },
      502
    );
  }

  // 1a. Log to D1 (best-effort — failure does not block success)
  await logInquiry(data, env);

  // 2. Confirmation to the inquirer (best-effort — failure does not block success)
  const confirmation = buildConfirmationContent(data);
  const cResp = await sendEmail(env, {
    from:     `Vesta Folio <${env.INQUIRY_FROM}>`,
    to:       [data.email],
    reply_to: env.INQUIRY_TO,
    subject:  confirmation.subject,
    html:     confirmation.html,
    text:     confirmation.text,
  });

  if (!cResp.ok) {
    const detail = await cResp.text().catch(() => '');
    console.error('Confirmation email failure (non-blocking):', cResp.status, detail);
  }

  return json({ ok: true }, 200);
}


/* ----------------------------------------------------------
   TURNSTILE VALIDATION
   ---------------------------------------------------------- */

// Returns { ok: true } on success, { ok: false, error: "..." } on failure.
// Tolerant: if TURNSTILE_SECRET_KEY isn't set, validation is skipped.
// This lets us deploy code before setting the secret without breaking the form.
async function validateTurnstile(data, request, env) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping Turnstile validation.');
    return { ok: true };
  }

  const token = data.turnstile_token;
  if (!isNonEmptyString(token)) {
    return { ok: false, error: "We couldn't verify your request. Please refresh and try again." };
  }

  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET_KEY);
  body.append('response', token);
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) body.append('remoteip', clientIp);

  try {
    const resp = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body }
    );
    const result = await resp.json();
    if (result && result.success === true) {
      return { ok: true };
    }
    console.error('Turnstile validation rejected:', JSON.stringify(result));
    return { ok: false, error: "We couldn't verify your request. Please refresh and try again." };
  } catch (err) {
    console.error('Turnstile validation network error:', err);
    return { ok: false, error: 'Could not verify your request. Please try again.' };
  }
}


/* ----------------------------------------------------------
   INQUIRY LOGGING (D1)
   ---------------------------------------------------------- */

// Best-effort: inserts the inquiry into the D1 `inquiries` table.
// Failures are logged but do not propagate — the email already succeeded,
// the user already sees a success state, and the inquiry is in the studio inbox.
async function logInquiry(d, env) {
  if (!env.DB) {
    console.warn('DB binding not set — skipping inquiry log.');
    return;
  }

  try {
    const services = Array.isArray(d.services) ? d.services.join(',') : null;

    await env.DB
      .prepare(
        `INSERT INTO inquiries
         (name, email, brokerage, property_address, listing_date, services, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        d.name,
        d.email,
        d.brokerage || null,
        d.property_address,
        d.listing_date || null,
        services,
        d.notes || null
      )
      .run();
  } catch (err) {
    console.error('D1 inquiry log failure (non-blocking):', err);
  }
}


/* ----------------------------------------------------------
   VALIDATION
   ---------------------------------------------------------- */

function validate(d) {
  const errors = [];

  if (!isNonEmptyString(d.name) || d.name.length > 200) {
    errors.push('Name is required.');
  }
  if (!isNonEmptyString(d.email) || !isEmail(d.email) || d.email.length > 320) {
    errors.push('A valid email is required.');
  }
  if (!isNonEmptyString(d.property_address) || d.property_address.length > 500) {
    errors.push('Property address is required.');
  }

  if (d.brokerage && d.brokerage.length > 200) errors.push('Brokerage is too long.');
  if (d.notes && d.notes.length > 5000)        errors.push('Notes are too long.');

  if (d.services) {
    if (!Array.isArray(d.services)) errors.push('Services must be an array.');
    else {
      const allowed = new Set(['hdr', 'cinematic', 'staging']);
      if (d.services.some(s => !allowed.has(s))) errors.push('Unknown service value.');
    }
  }

  return errors;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}


/* ----------------------------------------------------------
   EMAIL CONTENT BUILDERS
   ---------------------------------------------------------- */

function buildNotificationContent(d) {
  const services = formatServices(d.services);
  const timestamp = new Date().toUTCString();
  const subject = `New inquiry — ${d.name} — ${d.property_address}`;

  const html = renderShell({
    title: 'New inquiry',
    bodyTable: `
      <!-- Micro label -->
      <tr>
        <td align="center" style="padding-bottom:16px;">
          <p style="font-family:${BRAND.sans};font-size:11px;font-weight:500;letter-spacing:0.22em;color:${BRAND.sage};margin:0;text-transform:uppercase;">New inquiry</p>
        </td>
      </tr>

      <!-- Property heading -->
      <tr>
        <td align="center" style="padding-bottom:32px;">
          <p style="font-family:${BRAND.serif};font-size:30px;font-weight:400;line-height:1.3;color:${BRAND.forest};margin:0;">
            ${esc(d.property_address)}
          </p>
        </td>
      </tr>

      <!-- Gold rule -->
      <tr>
        <td align="center" style="padding-bottom:32px;">
          <div style="width:48px;height:1px;background:${BRAND.gold};font-size:1px;line-height:1px;">&nbsp;</div>
        </td>
      </tr>

      <!-- Details rows -->
      <tr>
        <td style="padding-bottom:32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${detailRow('Name', esc(d.name))}
            ${detailRow('Email', `<a href="mailto:${esc(d.email)}" style="color:${BRAND.gold};text-decoration:none;">${esc(d.email)}</a>`)}
            ${detailRow('Brokerage', esc(d.brokerage) || '—')}
            ${detailRow('Property', esc(d.property_address))}
            ${detailRow('Listing date', esc(d.listing_date) || '—')}
            ${detailRow('Services', esc(services))}
            ${detailRow('Notes', esc(d.notes) || '—', true)}
          </table>
        </td>
      </tr>

      <!-- Reply prompt -->
      <tr>
        <td align="center" style="padding:24px 0 8px 0;border-top:1px solid ${BRAND.gold};">
          <p style="font-family:${BRAND.sans};font-size:13px;font-weight:400;color:${BRAND.sage};margin:0;line-height:1.6;">
            Reply to this email to respond directly to the inquirer.
          </p>
        </td>
      </tr>

      <!-- Timestamp -->
      <tr>
        <td align="center" style="padding-top:8px;">
          <p style="font-family:${BRAND.sans};font-size:11px;font-weight:400;color:${BRAND.sage};margin:0;">
            Received ${esc(timestamp)}
          </p>
        </td>
      </tr>
    `,
  });

  const text =
`NEW INQUIRY — vestafolioco.com

${d.property_address}

Name:           ${d.name}
Email:          ${d.email}
Brokerage:      ${d.brokerage || '—'}
Property:       ${d.property_address}
Listing date:   ${d.listing_date || '—'}
Services:       ${services}

Notes:
${d.notes || '—'}

---
Reply to this email to respond directly to the inquirer.
Received ${timestamp}
`;

  return { subject, html, text };
}

function buildConfirmationContent(d) {
  const firstName = (d.name || '').trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Thank you, ${esc(firstName)}.` : 'Thank you.';
  const subject = 'We received your inquiry — Vesta Folio';

  const html = renderShell({
    title: 'Vesta Folio',
    bodyTable: `
      <!-- Greeting -->
      <tr>
        <td style="padding-bottom:20px;">
          <p style="font-family:${BRAND.serif};font-size:32px;font-weight:400;line-height:1.3;color:${BRAND.forest};margin:0;">
            ${greeting}
          </p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding-bottom:32px;">
          <p style="font-family:${BRAND.sans};font-size:15px;font-weight:400;line-height:1.75;color:${BRAND.sage};margin:0 0 16px 0;">
            We've received your inquiry about ${esc(d.property_address)} and will reply within 24 hours.
          </p>
          <p style="font-family:${BRAND.sans};font-size:15px;font-weight:400;line-height:1.75;color:${BRAND.sage};margin:0;">
            If anything has changed in the meantime, just reply to this email and we'll see it.
          </p>
        </td>
      </tr>

      <!-- Sign-off -->
      <tr>
        <td style="padding-bottom:40px;">
          <p style="font-family:${BRAND.serif};font-size:18px;font-weight:400;color:${BRAND.forest};margin:0;font-style:italic;">
            — Vesta Folio
          </p>
        </td>
      </tr>

      <!-- Gold rule -->
      <tr>
        <td align="center" style="padding-bottom:24px;">
          <div style="width:48px;height:1px;background:${BRAND.gold};font-size:1px;line-height:1px;">&nbsp;</div>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td align="center">
          <p style="font-family:${BRAND.sans};font-size:10px;font-weight:500;letter-spacing:0.22em;color:${BRAND.sage};margin:0 0 12px 0;text-transform:uppercase;">
            Estate film and photography
          </p>
          <p style="font-family:${BRAND.sans};font-size:11px;font-weight:400;color:${BRAND.sage};margin:0;line-height:1.7;">
            <a href="https://vestafolioco.com" style="color:${BRAND.sage};text-decoration:none;">vestafolioco.com</a><br>
            Los Angeles
          </p>
        </td>
      </tr>
    `,
  });

  const text =
`${firstName ? `Thank you, ${firstName}.` : 'Thank you.'}

We've received your inquiry about ${d.property_address} and will reply within 24 hours.

If anything has changed in the meantime, just reply to this email and we'll see it.

— Vesta Folio

---
vestafolioco.com
Los Angeles
`;

  return { subject, html, text };
}


/* ----------------------------------------------------------
   HTML SHELL & HELPERS
   ---------------------------------------------------------- */

function renderShell({ title, bodyTable }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.cream};-webkit-font-smoothing:antialiased;">
<center style="width:100%;background:${BRAND.cream};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.cream};">
  <tr>
    <td align="center" style="padding:56px 24px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

        <!-- Header: typeset wordmark -->
        <tr>
          <td align="center" style="padding-bottom:48px;">
            <p style="font-family:${BRAND.serif};font-size:22px;font-weight:400;letter-spacing:0.2em;color:${BRAND.gold};margin:0;text-transform:uppercase;">
              Vesta Folio
            </p>
          </td>
        </tr>

        ${bodyTable}

      </table>
    </td>
  </tr>
</table>
</center>
</body>
</html>`;
}

function detailRow(label, value, isLast = false) {
  const padBottom = isLast ? '0' : '14px';
  return `
    <tr>
      <td width="32%" valign="top" style="padding:0 16px ${padBottom} 0;font-family:${BRAND.sans};font-size:10px;font-weight:500;letter-spacing:0.18em;color:${BRAND.sage};text-transform:uppercase;line-height:1.6;">
        ${label}
      </td>
      <td valign="top" style="padding:0 0 ${padBottom} 0;font-family:${BRAND.sans};font-size:15px;font-weight:400;color:${BRAND.forest};line-height:1.6;word-break:break-word;">
        ${value}
      </td>
    </tr>`;
}

function formatServices(services) {
  if (!Array.isArray(services) || services.length === 0) return '—';
  return services.map(s => SERVICE_LABELS[s] || s).join(', ');
}

// HTML-escape user-provided strings before inserting into markup
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/* ----------------------------------------------------------
   RESEND DELIVERY
   ---------------------------------------------------------- */

async function sendEmail(env, opts) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(opts),
  });
}


/* ----------------------------------------------------------
   AUTH (chunk 4a)

   - Login: bcrypt verify password, generate 32-byte session token,
     insert into D1 sessions table with 30-day expiry, set HttpOnly
     Secure SameSite=Lax cookie.
   - Logout: delete session row, clear cookie.
   - Me: validate cookie against D1, return { user } or 401.
   ---------------------------------------------------------- */

async function handleLogin(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const email = isNonEmptyString(data?.email) ? data.email.trim().toLowerCase() : '';
  const password = isNonEmptyString(data?.password) ? data.password : '';

  if (!email || !password) {
    return json({ error: 'Email and password are required.' }, 400);
  }
  if (!env.DB) {
    console.error('DB binding not set — cannot authenticate.');
    return json({ error: 'Authentication is unavailable.' }, 500);
  }

  try {
    const user = await env.DB
      .prepare('SELECT id, email, password_hash, role, name FROM users WHERE email = ?')
      .bind(email)
      .first();

    // Anti-timing: always run bcrypt.compare, even when user doesn't exist.
    const hashToCheck = user?.password_hash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);

    if (!user || !valid) {
      // Generic message — no enumeration signal
      return json({ error: 'Invalid email or password.' }, 401);
    }

    // Issue session
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await env.DB
      .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, user.id, expiresAt)
      .run();

    // Best-effort update of last_login_at
    try {
      await env.DB
        .prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
        .bind(user.id)
        .run();
    } catch (err) {
      console.error('last_login_at update failed (non-blocking):', err);
    }

    const cookie = buildSessionCookie(token, SESSION_DAYS * 24 * 60 * 60);
    const redirect = user.role === 'admin' ? '/admin' : '/portal';

    return new Response(
      JSON.stringify({ ok: true, redirect, user: { email: user.email, role: user.role, name: user.name } }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie },
      }
    );
  } catch (err) {
    console.error('Login error:', err);
    return json({ error: 'Authentication failed.' }, 500);
  }
}

async function handleLogout(request, env) {
  const token = getCookie(request, SESSION_COOKIE);

  if (token && env.DB) {
    try {
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    } catch (err) {
      console.error('Logout DB error (non-blocking):', err);
    }
  }

  // Always clear the cookie, even if delete failed
  const expiredCookie = buildSessionCookie('', 0);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': expiredCookie },
  });
}

async function handleMe(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) {
    return json({ error: 'Not authenticated.' }, 401);
  }
  return json({ user });
}


/* ----------------------------------------------------------
   ACCOUNT MANAGEMENT (chunk 4b)

   - Change password (session required): verify old password,
     hash new, update users, revoke other sessions for this user.
   - Forgot password (no auth): generate token, store, send Resend
     email. Identical response regardless of whether user exists.
   - Reset password (no auth): validate token (exists, unused,
     unexpired), hash new password, mark used, revoke all sessions
     for the user.
   ---------------------------------------------------------- */

async function handleChangePassword(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: 'Not authenticated.' }, 401);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const oldPassword = isNonEmptyString(data?.old_password) ? data.old_password : '';
  const newPassword = isNonEmptyString(data?.new_password) ? data.new_password : '';

  if (!oldPassword || !newPassword) {
    return json({ error: 'Current and new passwords are required.' }, 400);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }
  if (newPassword === oldPassword) {
    return json({ error: 'New password must be different from the current password.' }, 400);
  }
  if (!env.DB) {
    return json({ error: 'Service unavailable.' }, 500);
  }

  try {
    const row = await env.DB
      .prepare('SELECT password_hash FROM users WHERE id = ?')
      .bind(user.id)
      .first();

    if (!row) return json({ error: 'Not authenticated.' }, 401);

    const valid = await bcrypt.compare(oldPassword, row.password_hash);
    if (!valid) return json({ error: 'Current password is incorrect.' }, 401);

    const newHash = await bcrypt.hash(newPassword, 12);

    await env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newHash, user.id)
      .run();

    // Revoke all OTHER sessions for this user (keep current session valid)
    const currentToken = getCookie(request, SESSION_COOKIE);
    if (currentToken) {
      try {
        await env.DB
          .prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?')
          .bind(user.id, currentToken)
          .run();
      } catch (err) {
        console.error('Other-session revocation failed (non-blocking):', err);
      }
    }

    return json({ ok: true });
  } catch (err) {
    console.error('Change-password error:', err);
    return json({ error: 'Could not change password.' }, 500);
  }
}

async function handleForgotPassword(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const email = isNonEmptyString(data?.email) ? data.email.trim().toLowerCase() : '';
  if (!email) {
    return json({ error: 'Email is required.' }, 400);
  }

  // Identical response regardless of whether the account exists — prevents enumeration.
  const genericResponse = json({
    ok: true,
    message: 'If an account exists with that email, a reset link has been sent.',
  });

  if (!env.DB) {
    console.error('DB binding not set — cannot process forgot-password.');
    return genericResponse;
  }

  try {
    const user = await env.DB
      .prepare('SELECT id, email, name FROM users WHERE email = ?')
      .bind(email)
      .first();

    if (!user) {
      // Don't leak that the email isn't on file
      return genericResponse;
    }

    const token = generateSessionToken(); // 32 bytes hex — same generator as session tokens
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_HOURS * 60 * 60 * 1000).toISOString();

    await env.DB
      .prepare('INSERT INTO password_resets (token, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(token, user.id, expiresAt)
      .run();

    // Best-effort send. If Resend fails, log but still return the same generic response —
    // we don't want to leak email-send failure as a signal.
    try {
      await sendResetEmail(env, user.email, user.name, token);
    } catch (err) {
      console.error('Reset email send failed:', err);
    }

    return genericResponse;
  } catch (err) {
    console.error('Forgot-password error:', err);
    return genericResponse;
  }
}

async function handleResetPassword(request, env) {
  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const token = isNonEmptyString(data?.token) ? data.token.trim() : '';
  const newPassword = isNonEmptyString(data?.new_password) ? data.new_password : '';

  if (!token || !newPassword) {
    return json({ error: 'Reset token and new password are required.' }, 400);
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, 400);
  }
  if (!env.DB) {
    return json({ error: 'Reset is unavailable.' }, 500);
  }

  try {
    const reset = await env.DB
      .prepare('SELECT token, user_id, expires_at, used_at FROM password_resets WHERE token = ?')
      .bind(token)
      .first();

    if (!reset) {
      return json({ error: 'This reset link is invalid.' }, 400);
    }
    if (reset.used_at) {
      return json({ error: 'This reset link has already been used.' }, 400);
    }
    if (new Date(reset.expires_at) < new Date()) {
      return json({ error: 'This reset link has expired. Please request a new one.' }, 400);
    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await env.DB
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newHash, reset.user_id)
      .run();

    await env.DB
      .prepare("UPDATE password_resets SET used_at = datetime('now') WHERE token = ?")
      .bind(token)
      .run();

    // Revoke ALL sessions for this user — they must re-login with the new password
    try {
      await env.DB
        .prepare('DELETE FROM sessions WHERE user_id = ?')
        .bind(reset.user_id)
        .run();
    } catch (err) {
      console.error('Session revocation on reset failed (non-blocking):', err);
    }

    return json({ ok: true, redirect: '/admin/login' });
  } catch (err) {
    console.error('Reset-password error:', err);
    return json({ error: 'Reset failed.' }, 500);
  }
}


/* ----------------------------------------------------------
   RESET EMAIL (chunk 4b)

   Branded HTML matching the chunk 1 transactional email pattern:
   Cream background, typeset wordmark, Gold hairline, Cormorant
   heading, Inter body, plain-text fallback.
   ---------------------------------------------------------- */

async function sendResetEmail(env, recipientEmail, recipientName, token) {
  if (!env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping reset email send.');
    return;
  }

  const fromAddress = env.INQUIRY_FROM || 'hello@vestafolioco.com';
  const resetLink = `https://vestafolioco.com/admin/reset-password?token=${encodeURIComponent(token)}`;
  const firstName = recipientName ? String(recipientName).trim().split(/\s+/)[0] : null;

  const html = buildResetEmailHtml(firstName, resetLink);
  const text = buildResetEmailText(firstName, resetLink);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Vesta Folio <${fromAddress}>`,
      to: [recipientEmail],
      subject: 'Reset your password',
      html,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

function buildResetEmailHtml(firstName, resetLink) {
  const greeting = firstName ? `Hello, ${esc(firstName)}.` : 'Hello.';
  const safeLink = esc(resetLink);

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:#F2EDE3;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#F2EDE3;">
  <tr>
    <td align="center" style="padding:48px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#F2EDE3;">

        <tr>
          <td align="left" style="padding-bottom:32px;">
            <span style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:400;letter-spacing:0.18em;color:#1F2E2A;text-transform:uppercase;">VESTA FOLIO</span>
          </td>
        </tr>

        <tr>
          <td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td>
        </tr>

        <tr>
          <td style="padding:40px 0 16px 0;">
            <h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:400;line-height:1.2;color:#1F2E2A;">Reset your password.</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:0 0 24px 0;">
            <p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;line-height:1.75;color:#1F2E2A;">${greeting}</p>
            <p style="margin:0 0 16px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;line-height:1.75;color:#1F2E2A;">A password reset was requested for your Vesta Folio account. Use the link below to set a new password. The link expires in 24 hours.</p>
            <p style="margin:0 0 24px 0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:16px;font-weight:400;line-height:1.75;color:#4A5C57;">If you didn't request this, you can ignore this email. Your password won't change.</p>
          </td>
        </tr>

        <tr>
          <td style="padding:0 0 32px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background-color:#A8884E;">
                  <a href="${safeLink}" style="display:inline-block;padding:16px 32px;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:12px;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:#1F2E2A;text-decoration:none;">Reset password</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:0 0 32px 0;">
            <p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;font-weight:400;line-height:1.6;color:#4A5C57;">Or paste this link into your browser:<br /><span style="color:#1F2E2A;word-break:break-all;">${safeLink}</span></p>
          </td>
        </tr>

        <tr>
          <td style="border-top:1px solid #A8884E;padding:0;line-height:0;height:1px;font-size:0;">&nbsp;</td>
        </tr>

        <tr>
          <td style="padding:24px 0 0 0;">
            <p style="margin:0;font-family:'Inter',Helvetica,Arial,sans-serif;font-size:13px;font-weight:400;line-height:1.6;color:#4A5C57;">— Vesta Folio</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function buildResetEmailText(firstName, resetLink) {
  const greeting = firstName ? `Hello, ${firstName}.` : 'Hello.';
  return `${greeting}

A password reset was requested for your Vesta Folio account. Use the link below to set a new password. The link expires in 24 hours.

${resetLink}

If you didn't request this, you can ignore this email. Your password won't change.

— Vesta Folio
`;
}


/* ----------------------------------------------------------
   AUTH HELPERS
   ---------------------------------------------------------- */

// Returns { id, email, role, name } or null
async function getCurrentUser(request, env) {
  if (!env.DB) return null;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  try {
    const row = await env.DB
      .prepare(
        `SELECT users.id, users.email, users.role, users.name, sessions.expires_at
         FROM sessions
         JOIN users ON sessions.user_id = users.id
         WHERE sessions.token = ?`
      )
      .bind(token)
      .first();

    if (!row) return null;

    if (new Date(row.expires_at) < new Date()) {
      // Expired — delete and treat as not authenticated
      try {
        await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      } catch { /* non-blocking */ }
      return null;
    }

    return { id: row.id, email: row.email, role: row.role, name: row.name };
  } catch (err) {
    console.error('Session lookup error:', err);
    return null;
  }
}

function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const cookies = header.split(';');
  for (const c of cookies) {
    const idx = c.indexOf('=');
    if (idx < 0) continue;
    const k = c.slice(0, idx).trim();
    if (k === name) return c.slice(idx + 1).trim();
  }
  return null;
}

function buildSessionCookie(value, maxAgeSeconds) {
  // Domain-scoped to vestafolioco.com; HttpOnly + Secure required
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}


/* ----------------------------------------------------------
   RESPONSE HELPERS
   ---------------------------------------------------------- */

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function cors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}
