const path = require('path');
const pool = require('../config/db');

exports.getLoginPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/pages/login.html'));
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Email or password is incorrect' });
        }

        res.redirect('/admin-dashboard');
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getDashboard = (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/pages/admin-dashboard.html'));
};
