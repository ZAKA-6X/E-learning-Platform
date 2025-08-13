const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const multer = require('multer');
const xlsx = require('xlsx');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT;

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware to parse JSON
app.use(express.json());

// Add middleware to parse URL-encoded data
app.use(bodyParser.urlencoded({ extended: true }));

// PostgreSQL connection setup
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Route to serve the login page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/login.html'));
});

// Route to handle the root URL
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Login route
app.post('/login', async (req, res) => {
    console.log('Login attempt:', req.body);

    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Email or password is incorrect' });
        }

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/pages/dashboard.html'));
});

// Route to handle CSV file uploads
app.post('/upload', upload.single('file'), (req, res) => {
    try {
        const filePath = req.file.path;
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        console.log('Uploaded CSV Data:', data);

        res.status(200).json({ message: 'File uploaded and processed successfully', data });
    } catch (error) {
        console.error('Error processing file:', error);
        res.status(500).json({ message: 'Error processing file' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});