const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (req, res) => res.json({ status: 'Ava Guide is ready for a licensed portrait and voice.' }));

module.exports = app;
if (require.main === module) app.listen(port, () => console.log(`Ava Guide running on ${port}`));
