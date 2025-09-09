// backend/app.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const subjectsRoutes = require('./routes/subjectsRoutes');
const classesRoutes  = require('./routes/classesRoutes');  // ← add
const coursesRoutes  = require('./routes/coursesRoutes');
const postsRoutes    = require('./routes/postsRoutes');

const app = express();
const port = process.env.PORT;

app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use('/', require('./routes/authRoutes'));
app.use('/', require('./routes/fileRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/todos', require('./routes/todosRoutes'));

app.use('/subjects', subjectsRoutes);
app.use('/classes',  classesRoutes);   // ← mount
app.use('/api/courses', coursesRoutes);
app.use('/api/posts',    postsRoutes);

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/pages/login.html'));
});

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
