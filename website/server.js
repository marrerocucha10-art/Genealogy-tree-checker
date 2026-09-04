const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (req, res) => res.json({ status: 'Friendly Genealogy website is running!' }));

module.exports = app;
if (require.main === module) app.listen(PORT, () => console.log(`Friendly Genealogy website running on ${PORT}`));
