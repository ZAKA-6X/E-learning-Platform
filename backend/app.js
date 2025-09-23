    require('dotenv').config();

    const express = require('express');
    const path = require('path');
    const bodyParser = require('body-parser');
    const subjectsRoutes = require('./routes/subjectsRoutes');
    const classesRoutes = require('./routes/classesRoutes');
    const coursesRoutes = require('./routes/coursesRoutes');
    const postsRoutes = require('./routes/postsRoutes');
    const fileRoutes = require('./routes/fileRoutes');
    const usersRoutes = require('./routes/usersRoutes');
    const uploadsDir = path.join(__dirname, '../uploads');
    const app = express();
    const port = process.env.PORT;

    // Middleware
    app.use(express.static(path.join(__dirname, '../frontend')));
    app.use(express.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use('/uploads', express.static(uploadsDir));

    // Routes
    app.use('/', require('./routes/authRoutes'));
    if (typeof fileRoutes === 'function') {
        app.use('/', fileRoutes);
    }
    app.use('/admin', require('./routes/adminRoutes'));
    app.use('/todos', require('./routes/todosRoutes'));
    app.use('/subjects', subjectsRoutes);
    app.use('/classes', classesRoutes);
    app.use('/api/courses', coursesRoutes);
    app.use('/api/posts', postsRoutes);
    app.use('/api/users', usersRoutes);

    // Redirect root to login   
    app.get('/login', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/pages/login.html'));
    });

    app.get('/', (req, res) => {
        res.redirect('/login');
    });

    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
    });
