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

const ALLOWED_ORIGIN = 'https://vestafolioco.com';

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
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}
