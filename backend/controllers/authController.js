const path = require('path');
const supabase = require('../config/db');



exports.getLoginPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/pages/login.html'));
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        console.log('Email being queried:', email);
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .ilike('email', email); // Case-insensitive matching

        if (error) {
            console.error('Error fetching user:', error);
        }

        const user = data[0];

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
    res.sendFile(path.join(__dirname, '../../frontend/pages/student-dashboard.html'));
};


