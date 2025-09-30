// backend/app.js
const express = require('express');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const teacherRoutes = require('./routes/teacher');
const libraryRoutes = require('./routes/library');

const app = express();
app.use(express.json());

// ✅ serve the right folder
app.use(express.static(path.join(__dirname, '../frontend')));

// PAGES
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/login.html'));
});

app.get('/teacher', (req, res) => {
  res.set('Cache-Control', 'no-store'); // <-- stop browser/proxy caching the HTML
  res.sendFile(path.join(__dirname, '../frontend/pages/teacher-dashboard.html'));
});

// API
app.use('/api/auth', authRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/teacher', libraryRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
