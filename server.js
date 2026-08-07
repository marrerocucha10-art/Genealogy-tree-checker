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
  limit: '10mb',
  verify: (req, res, buffer) => {
    if (req.originalUrl === '/api/stripe/webhook') {
      req.rawBody = buffer;
    }
  },
}));
app.use(express.text({ type: ['text/*', 'application/x-gedcom', 'application/octet-stream'], limit: '10mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-vercel-protection-bypass');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

const MAX_GEDCOM_BYTES = 10 * 1024 * 1024;

const SUBSCRIPTION_TIERS = {
  personal: {
    name: 'Personal',
    prices: {
      monthly: 'STRIPE_PERSONAL_MONTHLY_PRICE_ID',
      annual: 'STRIPE_PERSONAL_ANNUAL_PRICE_ID',
    },
  },
  pro: {
    name: 'Pro / Researcher',
    prices: {
      monthly: 'STRIPE_PRO_MONTHLY_PRICE_ID',
      annual: 'STRIPE_PRO_ANNUAL_PRICE_ID',
    },
  },
  business: {
    name: 'Business / Genealogist',
    prices: {
      monthly: 'STRIPE_BUSINESS_MONTHLY_PRICE_ID',
      annual: 'STRIPE_BUSINESS_ANNUAL_PRICE_ID',
    },
  },
};

function getBaseUrl(req) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '');

  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host');
  return `${protocol}://${host}`;
}

function getStripeConfig() {
  const tiers = Object.fromEntries(Object.entries(SUBSCRIPTION_TIERS).map(([id, tier]) => ([
    id,
    {
      name: tier.name,
      monthly: { configured: Boolean(process.env[tier.prices.monthly]) },
      annual: { configured: Boolean(process.env[tier.prices.annual]) },
    },
  ])));

  return {
    configured: Boolean(process.env.STRIPE_SECRET_KEY),
    portalConfigured: Boolean(process.env.STRIPE_CUSTOMER_PORTAL_RETURN_URL || process.env.PUBLIC_APP_URL),
    tiers,
    storeUrl: process.env.PUBLIC_STORE_URL || '/store',
  };
}

async function createStripeCheckoutSession(req, tierId, interval = 'monthly') {
  const tier = SUBSCRIPTION_TIERS[tierId];
  if (!tier) throw new Error('Unknown subscription tier.');
  if (!['monthly', 'annual'].includes(interval)) throw new Error('Unknown billing interval.');
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured yet. Add STRIPE_SECRET_KEY in Vercel Environment Variables.');

  const priceEnv = tier.prices[interval];
  const priceId = process.env[priceEnv];
  if (!priceId) throw new Error(`${tier.name} ${interval} is missing its Stripe price ID. Add ${priceEnv} in Vercel Environment Variables.`);

  const baseUrl = getBaseUrl(req);
  const params = new URLSearchParams({
    mode: 'subscription',
    success_url: `${baseUrl}/?subscription=${tierId}&interval=${interval}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/?checkout=cancelled`,
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[tier]': tierId,
    'metadata[interval]': interval,
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

  return {
    active: ['active', 'trialing', 'past_due'].includes(subscription.status),
    tier: match?.tierId || 'free',
    interval: match?.interval || 'monthly',
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
      throw new Error('GEDCOM file is too large. Maximum size is 10 MB.');
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
      throw new Error('GEDCOM file is too large. Maximum size is 10 MB.');
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
      throw new Error('GEDCOM file is too large. Maximum size is 10 MB.');
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

function sendParsedGedcom(res, gedcom) {
  const parsed = parseGedcom(gedcom);

  res.json({
    success: true,
    parsed,
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

app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const session = await createStripeCheckoutSession(req, req.body?.tier, req.body?.interval);
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
