const express = require('express');
const net = require('net');
const path = require('path');
const { parseGedcom } = require('./gedcomParser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
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

// Start server
app.listen(PORT, () => {
  console.log(`Genealogy Tree Checker running at http://localhost:${PORT}`);
});
