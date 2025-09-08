const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const subjectsRoutes = require('./routes/subjectsRoutes');

dotenv.config();
const app = express();
const port = process.env.PORT;

// Middleware
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use('/', require('./routes/authRoutes'));
app.use('/', require('./routes/fileRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/todos', require('./routes/todosRoutes'));
app.use('/subjects', subjectsRoutes);

// app.js (only the relevant line)
const postsRoutes = require("./routes/postsRoutes");
app.use("/api/posts", postsRoutes);

// Redirect root to login   
app.get('/', (req, res) => {
    res.redirect('/login');
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});


