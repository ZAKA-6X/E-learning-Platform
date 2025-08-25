const path = require('path');
const supabase = require('../config/db');
const jwt = require("jsonwebtoken");

// Helper: create JWT
function signToken(user) {
  return jwt.sign(
    { id: user.id, school_id: user.school_id, role: user.role }, 
    process.env.JWT_SECRET, 
    { expiresIn: '1d' }
  );
}


exports.getLoginPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/pages/login.html'));
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
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

        const token = signToken(user);

        // Stocker en cookie httpOnly
        res.cookie("token", token, {
            httpOnly: true,
            secure: false, // Set to true in production with HTTPS
            sameSite: "lax",
        });

        // Store school_id in session for later use
         res.json({
            token,
            user: {
                id: user.id,
                school_id: user.school_id,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.getDashboard = [(req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/pages/admin-dashboard.html'));
}];


