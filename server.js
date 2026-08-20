const express = require('express');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { parseGedcom } = require('./gedcomParser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({
  limit: '170mb',
  verify: (req, res, buffer) => {
    if (req.originalUrl === '/api/stripe/webhook') {
      req.rawBody = buffer;
    }
  },
}));
app.use(express.text({ type: ['text/*', 'application/x-gedcom', 'application/octet-stream'], limit: '170mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

const MAX_GEDCOM_BYTES = 150 * 1024 * 1024;

// --- Administration review sessions -----------------------------------------
// Administration review unlocks every paid tier at no charge, so the server
// owns the decision. The browser only ever receives an HttpOnly cookie holding
// an HMAC-signed, expiring token, which page scripts cannot read or forge.
const ADMIN_REVIEW_COOKIE = 'admin_review_session';
const ADMIN_REVIEW_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const ADMIN_REVIEW_MAX_ATTEMPTS = 10;
const ADMIN_REVIEW_LOCKOUT_MS = 15 * 60 * 1000;

// When no signing key is configured, generate one per boot. Sessions then end
// on restart instead of falling back to a predictable, guessable key.
const ADMIN_REVIEW_SESSION_SECRET = process.env.ADMIN_REVIEW_SESSION_SECRET
  || crypto.randomBytes(32).toString('hex');

const adminReviewAttempts = new Map();

// Passphrases get copied out of chat windows and retyped by hand, so compare a
// normalized form: drop invisible characters, separators and case. The remaining
// 20 alphanumerics still carry far more entropy than this gate needs, and it
// removes the "looks identical but fails" class of support problem.
function normalizeAdminReviewPassphrase(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getAdminReviewPassphraseHash() {
  const configuredHash = String(process.env.ADMIN_REVIEW_PASSPHRASE_HASH || '').trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(configuredHash)) return configuredHash;

  const passphrase = normalizeAdminReviewPassphrase(process.env.ADMIN_REVIEW_PASSPHRASE);
  if (passphrase) return crypto.createHash('sha256').update(passphrase, 'utf8').digest('hex');

  return '';
}

function isAdminReviewConfigured() {
  return Boolean(getAdminReviewPassphraseHash());
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signAdminReviewPayload(payload) {
  return crypto.createHmac('sha256', ADMIN_REVIEW_SESSION_SECRET).update(payload).digest('base64url');
}

function createAdminReviewToken(expiresAt) {
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt }), 'utf8').toString('base64url');
  return `${payload}.${signAdminReviewPayload(payload)}`;
}

function readAdminReviewToken(token) {
  if (typeof token !== 'string') return null;
  const separator = token.indexOf('.');
  if (separator <= 0) return null;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!signature || !timingSafeStringEqual(signature, signAdminReviewPayload(payload))) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isFinite(data.exp) || data.exp <= Date.now()) return null;
    return data;
  } catch (error) {
    return null;
  }
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(part.slice(separator + 1).trim());
    } catch (error) {
      cookies[name] = part.slice(separator + 1).trim();
    }
  }
  return cookies;
}

function getAdminReviewSession(req) {
  return readAdminReviewToken(parseCookies(req)[ADMIN_REVIEW_COOKIE]);
}

function isSecureRequest(req) {
  if (req.secure) return true;
  return String(req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https';
}

function setAdminReviewCookie(req, res, token, maxAgeSeconds) {
  const attributes = [
    `${ADMIN_REVIEW_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecureRequest(req)) attributes.push('Secure');
  res.append('Set-Cookie', attributes.join('; '));
}

function getAdminReviewClientKey(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.ip || 'unknown';
}

function pruneAdminReviewAttempts(now) {
  for (const [key, entry] of adminReviewAttempts) {
    if (now - entry.updatedAt > ADMIN_REVIEW_LOCKOUT_MS) adminReviewAttempts.delete(key);
  }
}

function getAdminReviewLockoutMs(key) {
  const entry = adminReviewAttempts.get(key);
  if (!entry || entry.count < ADMIN_REVIEW_MAX_ATTEMPTS) return 0;
  const remaining = ADMIN_REVIEW_LOCKOUT_MS - (Date.now() - entry.updatedAt);
  return remaining > 0 ? remaining : 0;
}

function recordAdminReviewFailure(key) {
  const now = Date.now();
  pruneAdminReviewAttempts(now);
  const entry = adminReviewAttempts.get(key);
  if (!entry || now - entry.updatedAt > ADMIN_REVIEW_LOCKOUT_MS) {
    adminReviewAttempts.set(key, { count: 1, updatedAt: now });
    return;
  }
  entry.count += 1;
  entry.updatedAt = now;
}

const SUBSCRIPTION_TIERS = {
  personal: {
    name: 'Family Builder',
    monthlyPrice: 19.99,
    annualPrice: 19.99,
    prices: {
      monthly: 'STRIPE_PERSONAL_MONTHLY_PRICE_ID',
      annual: 'STRIPE_PERSONAL_ANNUAL_PRICE_ID',
    },
  },
  pro: {
    name: 'Pro / Researcher',
    monthlyPrice: 29.99,
    annualPrice: 29.99,
    prices: {
      monthly: 'STRIPE_PRO_MONTHLY_PRICE_ID',
      annual: 'STRIPE_PRO_ANNUAL_PRICE_ID',
    },
  },
  business: {
    name: 'Business / Genealogist',
    monthlyPrice: 39.99,
    annualPrice: 39.99,
    prices: {
      monthly: 'STRIPE_BUSINESS_MONTHLY_PRICE_ID',
      annual: 'STRIPE_BUSINESS_ANNUAL_PRICE_ID',
    },
  },
};

const BASIC_ASSISTANCE_PRICE = 9.99;
const MAX_PHOTO_TO_LIFE_BYTES = 10 * 1024 * 1024;
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || 'kwaivgi/kling-v2.1';

function getBaseUrl(req) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '');

  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host');
  return `${protocol}://${host}`;
}

function getStripeConfig() {
  const hasStripeSecret = Boolean(process.env.STRIPE_SECRET_KEY);
  const previewTestMode = process.env.VERCEL_ENV === 'preview';
  const tiers = Object.fromEntries(Object.entries(SUBSCRIPTION_TIERS).map(([id, tier]) => ([
    id,
    {
      name: tier.name,
      monthly: { configured: hasStripeSecret },
      annual: { configured: hasStripeSecret },
    },
  ])));

  return {
    configured: hasStripeSecret,
    testSubscriptionsEnabled: previewTestMode || (
      process.env.VERCEL_ENV !== 'production' &&
      process.env.ENABLE_TEST_SUBSCRIPTIONS === 'true'
    ),
    portalConfigured: Boolean(process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL || process.env.PUBLIC_APP_URL),
    tiers,
    storeUrl: process.env.PUBLIC_STORE_URL || '/store',
  };
}

function getPhotoToLifeConfig() {
  return {
    configured: Boolean(process.env.REPLICATE_API_TOKEN),
    model: REPLICATE_MODEL,
  };
}

function assertPhotoToLifeRequest(body) {
  if (!body?.hasPermission || !body?.acceptsAiLabel) {
    throw new Error('Confirm photo permission and the AI-generated animation disclosure before continuing.');
  }
  if (typeof body.image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/i.test(body.image)) {
    throw new Error('Upload a JPG, PNG, or WebP family photo.');
  }
  const encodedPhoto = body.image.slice(body.image.indexOf(',') + 1);
  const photoBytes = Buffer.byteLength(encodedPhoto, 'base64');
  if (!photoBytes || photoBytes > MAX_PHOTO_TO_LIFE_BYTES) {
    throw new Error('Choose a family photo smaller than 10 MB.');
  }
  if (typeof body.motion !== 'string' || body.motion.length > 240) {
    throw new Error('Choose one of the available gentle motion styles.');
  }
}

function getReplicateModelUrl() {
  const [owner, name] = REPLICATE_MODEL.split('/');
  if (!owner || !name || REPLICATE_MODEL.split('/').length !== 2) {
    throw new Error('REPLICATE_MODEL must use the format owner/model.');
  }
  return `https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`;
}

async function replicateRequest(url, options = {}) {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error('Photo-to-life is not configured yet. Add REPLICATE_API_TOKEN to enable it.');
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.detail || payload.error || 'The photo-to-life service could not complete this request.');
  return payload;
}

async function createStripeCheckoutSession(req, tierId, interval = 'monthly') {
  const tier = SUBSCRIPTION_TIERS[tierId];
  if (!tier) throw new Error('Unknown subscription tier.');
  if (!['monthly', 'annual'].includes(interval)) throw new Error('Unknown billing interval.');
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured yet. Add STRIPE_SECRET_KEY in Vercel Environment Variables.');

  const price = interval === 'annual' ? tier.annualPrice : tier.monthlyPrice;
  const unitAmount = Math.round(price * 100 * (interval === 'annual' ? 12 : 1));
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) throw new Error(`${tier.name} ${interval} has an invalid price.`);

  const baseUrl = getBaseUrl(req);
  const params = new URLSearchParams({
    mode: 'subscription',
    success_url: `${baseUrl}/?subscription=${tierId}&interval=${interval}&checkout=success&session_id={CHECKOUT_SESSION_ID}&start=upload`,
    cancel_url: `${baseUrl}/store?checkout=cancelled`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `${tier.name} ${interval === 'annual' ? 'Annual' : 'Monthly'} Subscription`,
    'line_items[0][price_data][unit_amount]': String(unitAmount),
    'line_items[0][price_data][recurring][interval]': interval === 'annual' ? 'year' : 'month',
    'line_items[0][quantity]': '1',
    'metadata[tier]': tierId,
    'metadata[interval]': interval,
    'subscription_data[metadata][tier]': tierId,
    'subscription_data[metadata][interval]': interval,
  });

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not create Stripe Checkout session.');
  }

  return payload;
}

async function createBasicAssistanceCheckoutSession(req) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured yet. Add STRIPE_SECRET_KEY in Vercel Environment Variables.');

  const baseUrl = getBaseUrl(req);
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${baseUrl}/errors.html?assistance=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/errors.html?assistance=cancelled`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': 'Genealogy Error Correction & Research Assistance',
    'line_items[0][price_data][product_data][description]': 'One-time assistance request for reviewing additional family-tree errors and research leads.',
    'line_items[0][price_data][unit_amount]': String(Math.round(BASIC_ASSISTANCE_PRICE * 100)),
    'line_items[0][quantity]': '1',
    'metadata[request_type]': 'basic_assistance',
    'payment_intent_data[metadata][request_type]': 'basic_assistance',
  });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not create the assistance checkout session.');
  }

  return payload;
}

function getTierByPriceId(priceId) {
  for (const [tierId, tier] of Object.entries(SUBSCRIPTION_TIERS)) {
    for (const [interval, envName] of Object.entries(tier.prices)) {
      if (process.env[envName] && process.env[envName] === priceId) {
        return { tierId, interval, tier };
      }
    }
  }

  return null;
}

async function stripeRequest(pathname, options = {}) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured yet.');

  const response = await fetch(`https://api.stripe.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(options.headers || {}),
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || 'Stripe request failed.');
  }

  return payload;
}

async function getSubscriptionStatusFromSession(sessionId) {
  if (!sessionId) throw new Error('Checkout session ID is required.');

  const session = await stripeRequest(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription.items.data.price`);
  if (session.mode !== 'subscription') throw new Error('Checkout session is not a subscription.');

  return formatSubscriptionStatus(session.subscription, session.customer, session.customer_details?.email);
}

async function getSubscriptionStatusFromCustomer(customerId) {
  if (!customerId) throw new Error('Stripe customer ID is required.');

  const subscriptions = await stripeRequest(`/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10&expand[]=data.items.data.price`);
  const activeSubscription = subscriptions.data.find((subscription) => ['active', 'trialing', 'past_due'].includes(subscription.status));

  if (!activeSubscription) {
    return { active: false, tier: 'free', interval: 'monthly', customerId };
  }

  return formatSubscriptionStatus(activeSubscription, customerId);
}

function formatSubscriptionStatus(subscription, customerId, customerEmail = '') {
  if (!subscription) return { active: false, tier: 'free', interval: 'monthly', customerId, customerEmail };

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const match = getTierByPriceId(priceId);

  const metadataTier = subscription.metadata?.tier;
  const metadataInterval = subscription.metadata?.interval;

  return {
    active: ['active', 'trialing', 'past_due'].includes(subscription.status),
    tier: match?.tierId || (SUBSCRIPTION_TIERS[metadataTier] ? metadataTier : 'free'),
    interval: match?.interval || (['monthly', 'annual'].includes(metadataInterval) ? metadataInterval : 'monthly'),
    status: subscription.status,
    subscriptionId: subscription.id,
    customerId,
    customerEmail,
    currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : '',
  };
}

function verifyStripeWebhookSignature(req) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('Stripe webhook secret is not configured.');

  const signature = req.get('stripe-signature') || '';
  const timestamp = signature.split(',').find((part) => part.startsWith('t='))?.slice(2);
  const signatures = signature.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || !signatures.length || !req.rawBody) throw new Error('Invalid Stripe webhook signature.');

  const signedPayload = `${timestamp}.${req.rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const verified = signatures.some((candidate) => {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const candidateBuffer = Buffer.from(candidate, 'hex');
    return expectedBuffer.length === candidateBuffer.length && crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
  });

  if (!verified) throw new Error('Stripe webhook signature verification failed.');
}

async function createStripePortalSession(req) {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured yet.');
  const customerId = req.body?.customerId || req.query?.customerId;
  if (!customerId) throw new Error('Stripe customer ID is required to open the billing portal.');

  const baseUrl = getBaseUrl(req);
  const params = new URLSearchParams({
    customer: customerId,
    return_url: process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL || baseUrl,
  });

  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || 'Could not create Stripe billing portal session.');
  }

  return payload;
}

function getGedcomInput(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body.gedcom === 'string') return req.body.gedcom;
  if (req.body && typeof req.body.text === 'string') return req.body.text;
  if (req.body && typeof req.body.file === 'string') return req.body.file;

  return '';
}

function getGedcomUrlInput(req) {
  if (!req.body || typeof req.body !== 'object') return '';

  return req.body.url || req.body.fileUrl || req.body.gedcomUrl || '';
}

function isPrivateIpAddress(hostname) {
  if (hostname === 'localhost') return true;

  const ipVersion = net.isIP(hostname);
  if (!ipVersion) return false;

  if (ipVersion === 4) {
    const parts = hostname.split('.').map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }

  const normalized = hostname.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

async function readResponseTextWithLimit(response) {
  if (!response.body || !response.body.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_GEDCOM_BYTES) {
      throw new Error('GEDCOM file is too large. Maximum size is 150 MB.');
    }

    return buffer.toString('utf8');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_GEDCOM_BYTES) {
      await reader.cancel();
      throw new Error('GEDCOM file is too large. Maximum size is 150 MB.');
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function fetchGedcomFromUrl(fileUrl) {
  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new Error('GEDCOM file URL is required. Send it as { "url": "https://..." }.');
  }

  const normalizedUrl = fileUrl.startsWith('//') ? `https:${fileUrl}` : fileUrl;
  let url;

  try {
    url = new URL(normalizedUrl);
  } catch (error) {
    throw new Error('GEDCOM file URL must be a valid URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('GEDCOM file URL must use http or https.');
  }

  if (isPrivateIpAddress(url.hostname.toLowerCase())) {
    throw new Error('GEDCOM file URL cannot point to a private or local address.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Could not download GEDCOM file. Received HTTP ${response.status}.`);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_GEDCOM_BYTES) {
      throw new Error('GEDCOM file is too large. Maximum size is 150 MB.');
    }

    return await readResponseTextWithLimit(response);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Downloading GEDCOM file timed out.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.get('/store', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'store.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'Genealogy Tree Checker is running!' });
});


function splitGedcomRecords(gedcom) {
  const normalized = String(gedcom || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const records = [];
  let current = [];

  for (const line of lines) {
    if (/^0\s+/.test(line) && current.length) {
      records.push(current);
      current = [];
    }
    current.push(line);
  }

  if (current.length) records.push(current);
  return records;
}

function normalizeGedcomRecord(lines) {
  return lines
    .map((line) => line.trimEnd())
    .filter((line) => line.trim())
    .join('\n');
}

function cleanupRepeatedGedcomRecords(gedcom) {
  const records = splitGedcomRecords(gedcom);
  const seen = new Set();
  const cleanedRecords = [];
  let repeatedRecordsRemoved = 0;

  for (const record of records) {
    const firstLine = record.find((line) => line.trim()) || '';
    const isTopLevelEntity = /^0\s+@[^@]+@\s+(INDI|FAM|SUBM|NOTE|SOUR|REPO|OBJE)\b/i.test(firstLine);
    const key = isTopLevelEntity ? normalizeGedcomRecord(record) : '';

    if (key) {
      if (seen.has(key)) {
        repeatedRecordsRemoved += 1;
        continue;
      }
      seen.add(key);
    }

    cleanedRecords.push(record);
  }

  return {
    gedcom: cleanedRecords.map((record) => record.join('\n')).join('\n'),
    repeatedRecordsRemoved,
  };
}

function sendParsedGedcom(res, gedcom) {
  const cleanup = cleanupRepeatedGedcomRecords(gedcom);
  const parsed = parseGedcom(cleanup.gedcom);

  res.json({
    success: true,
    parsed,
    cleanup: {
      repeatedRecordsRemoved: cleanup.repeatedRecordsRemoved,
    },
  });
}

app.post(['/api/parse', '/api/parse-gedcom'], (req, res) => {
  try {
    sendParsedGedcom(res, getGedcomInput(req));
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});


app.get('/api/subscription/config', (req, res) => {
  res.json({ success: true, stripe: getStripeConfig() });
});

app.get('/api/admin-review/session', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    success: true,
    configured: isAdminReviewConfigured(),
    active: Boolean(getAdminReviewSession(req)),
  });
});

app.post('/api/admin-review/session', (req, res) => {
  res.set('Cache-Control', 'no-store');

  if (!isAdminReviewConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Administration review is not configured on this server. Set ADMIN_REVIEW_PASSPHRASE_HASH to enable it.',
    });
  }

  const clientKey = getAdminReviewClientKey(req);
  const lockoutMs = getAdminReviewLockoutMs(clientKey);
  if (lockoutMs) {
    res.set('Retry-After', String(Math.ceil(lockoutMs / 1000)));
    return res.status(429).json({
      success: false,
      error: `Too many attempts. Try again in ${Math.ceil(lockoutMs / 60000)} minute(s).`,
    });
  }

  const rawPassphrase = req.body?.passphrase;
  const passphrase = normalizeAdminReviewPassphrase(rawPassphrase);
  if (typeof rawPassphrase !== 'string' || !passphrase) {
    recordAdminReviewFailure(clientKey);
    return res.status(400).json({ success: false, error: 'A passphrase is required.' });
  }
  const submitted = crypto.createHash('sha256').update(passphrase, 'utf8').digest('hex');
  if (!timingSafeStringEqual(submitted, getAdminReviewPassphraseHash())) {
    recordAdminReviewFailure(clientKey);
    return res.status(401).json({ success: false, error: 'That passphrase was not recognized.' });
  }

  adminReviewAttempts.delete(clientKey);
  const expiresAt = Date.now() + ADMIN_REVIEW_SESSION_TTL_MS;
  setAdminReviewCookie(req, res, createAdminReviewToken(expiresAt), Math.floor(ADMIN_REVIEW_SESSION_TTL_MS / 1000));
  return res.json({ success: true, active: true, expiresAt });
});

app.delete('/api/admin-review/session', (req, res) => {
  res.set('Cache-Control', 'no-store');
  setAdminReviewCookie(req, res, '', 0);
  res.json({ success: true, active: false });
});

app.get('/api/photo-to-life/config', (req, res) => {
  res.json({ success: true, photoToLife: getPhotoToLifeConfig() });
});

app.post('/api/photo-to-life', async (req, res) => {
  try {
    assertPhotoToLifeRequest(req.body);
    const prediction = await replicateRequest(getReplicateModelUrl(), {
      method: 'POST',
      body: JSON.stringify({
        input: {
          start_image: req.body.image,
          prompt: req.body.motion,
          duration: 5,
          mode: 'standard',
          negative_prompt: 'distorted face, extra limbs, dramatic movement, text, watermark',
        },
      }),
    });
    res.status(202).json({
      success: true,
      prediction: { id: prediction.id, status: prediction.status },
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/photo-to-life/:predictionId', async (req, res) => {
  try {
    const predictionId = String(req.params.predictionId || '');
    if (!/^[a-zA-Z0-9_-]+$/.test(predictionId)) {
      throw new Error('Invalid memory video request.');
    }
    const prediction = await replicateRequest(`https://api.replicate.com/v1/predictions/${encodeURIComponent(predictionId)}`);
    res.json({
      success: true,
      prediction: {
        status: prediction.status,
        output: prediction.output,
        error: prediction.error,
      },
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const session = await createStripeCheckoutSession(req, req.body?.tier, req.body?.interval);
    res.json({ success: true, url: session.url, id: session.id });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/create-basic-assistance-session', async (req, res) => {
  try {
    const session = await createBasicAssistanceCheckoutSession(req);
    res.json({ success: true, url: session.url, id: session.id });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});



app.get('/api/subscription/status', async (req, res) => {
  try {
    const status = req.query.session_id
      ? await getSubscriptionStatusFromSession(req.query.session_id)
      : await getSubscriptionStatusFromCustomer(req.query.customerId);

    res.json({ success: true, subscription: status });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/stripe/webhook', (req, res) => {
  try {
    verifyStripeWebhookSignature(req);
    const event = req.body;

    res.json({
      received: true,
      type: event.type,
      message: 'Webhook verified. Add persistent customer storage before using this event for account access control.',
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/api/create-portal-session', async (req, res) => {
  try {
    const session = await createStripePortalSession(req);
    res.json({ success: true, url: session.url });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post(['/api/parse-url', '/api/parse-gedcom-url'], async (req, res) => {
  try {
    const gedcom = await fetchGedcomFromUrl(getGedcomUrlInput(req));
    sendParsedGedcom(res, gedcom);
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// Export the Express app so Vercel can detect and run it as the project entrypoint.
module.exports = app;

// Start a local server only when running `node server.js` directly.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Genealogy Tree Checker running at http://localhost:${PORT}`);
  });
}
