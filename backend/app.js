// backend/app.js
require('dotenv').config();
const express = require('express');
const path = require('path');

const authRoutes = require('./routes/authRoutes');
const teacherRoutes = require('./routes/teacher');
const libraryRoutes = require('./routes/library');
const postsRoutes = require('./routes/postsRoutes');
const subjectsRoutes = require('./routes/subjectsRoutes');
const classesRoutes = require('./routes/classesRoutes');
const usersRoutes = require('./routes/usersRoutes');
const todosRoutes = require('./routes/todosRoutes');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../frontend')));

// Landing pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/login.html'));
});

app.get('/teacher', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, '../frontend/pages/teacher-dashboard.html'));
});

// APIs
app.use('/api/auth', authRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/teacher', libraryRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/todos', todosRoutes);

// Basic health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
