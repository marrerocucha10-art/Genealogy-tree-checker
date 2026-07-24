const express = require('express');
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
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

function getGedcomInput(req) {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body.gedcom === 'string') return req.body.gedcom;
  if (req.body && typeof req.body.text === 'string') return req.body.text;
  if (req.body && typeof req.body.file === 'string') return req.body.file;

  return '';
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'Genealogy Tree Checker is running!' });
});

app.post(['/api/parse', '/api/parse-gedcom'], (req, res) => {
  try {
    const gedcom = getGedcomInput(req);
    const parsed = parseGedcom(gedcom);

    res.json({
      success: true,
      parsed,
    });
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
