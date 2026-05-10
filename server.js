const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'Genealogy Tree Checker is running!' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🌳 Genealogy Tree Checker running at http://localhost:${PORT}`);
});
