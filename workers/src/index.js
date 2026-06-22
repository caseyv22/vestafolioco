// workers/src/index.js
// Vesta Folio API Worker
//
// Routes handled:
//   POST /api/inquiries  → send inquiry email via Resend
//
// Env bindings (set as secrets in Cloudflare dashboard):
//   RESEND_API_KEY  — from Resend dashboard
//   INQUIRY_FROM    — e.g. "hello@vestafolioco.com"
//   INQUIRY_TO      — e.g. "vestafolioco@gmail.com"

const ALLOWED_ORIGIN = 'https://vestafolioco.com';

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

  const errors = validate(data);
  if (errors.length) {
    return json({ error: errors[0] }, 400);
  }

  const emailResp = await sendInquiryEmail(data, env);
  if (!emailResp.ok) {
    const detail = await emailResp.text().catch(() => '');
    console.error('Resend failure:', emailResp.status, detail);
    return json(
      { error: 'Could not deliver inquiry. Please try again, or email vestafolioco@gmail.com directly.' },
      502
    );
  }

  return json({ ok: true }, 200);
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

  // Optional field length caps (anti-abuse)
  if (d.brokerage && d.brokerage.length > 200) errors.push('Brokerage is too long.');
  if (d.notes && d.notes.length > 5000)        errors.push('Notes are too long.');

  // Services must be an array of allowed values, if present
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
   EMAIL DELIVERY (Resend)
   ---------------------------------------------------------- */

const SERVICE_LABELS = {
  hdr:       'HDR Photography',
  cinematic: 'Cinematic Tour',
  staging:   'AI Staging',
};

async function sendInquiryEmail(d, env) {
  const services = Array.isArray(d.services) && d.services.length
    ? d.services.map(s => SERVICE_LABELS[s] || s).join(', ')
    : '—';

  const text =
`New inquiry — vestafolioco.com

Name:           ${d.name}
Email:          ${d.email}
Brokerage:      ${d.brokerage || '—'}
Property:       ${d.property_address}
Listing date:   ${d.listing_date || '—'}
Services:       ${services}

Notes:
${d.notes || '—'}

---
Received: ${new Date().toISOString()}
`;

  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Vesta Folio Inquiries <${env.INQUIRY_FROM}>`,
      to: [env.INQUIRY_TO],
      reply_to: d.email,
      subject: `New inquiry — ${d.name} — ${d.property_address}`,
      text,
    }),
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
