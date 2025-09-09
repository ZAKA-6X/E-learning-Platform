const router = require('express').Router();
const jwt = require('jsonwebtoken');
const supabase = require('../config/db');

/**
 * TEMP login for testing (plain-text password)
 * Body: { email, password }
 * Returns: { token, user }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email et mot de passe requis.' });
    }

    // Your table uses first_name, last_name — no full_name
    const { data: rows, error } = await supabase
      .from('users')
      .select('id, email, password, school_id, role, first_name, last_name')
      .eq('email', email)
      .limit(1);

    if (error) {
      console.error('[login] supabase error:', error);
      return res.status(500).json({ message: 'Erreur serveur.' });
    }

    const user = rows?.[0];
    if (!user) {
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    // Plain-text password check (testing only)
    if (String(user.password) !== String(password)) {
      return res.status(401).json({ message: 'Identifiants invalides.' });
    }

    const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();

    // JWT must include id + school_id + role (used by coursesController)
    const payload = {
      id: user.id,
      school_id: user.school_id,
      role: user.role,
      email: user.email,
      name,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        school_id: user.school_id,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        name,
      },
    });
  } catch (e) {
    console.error('[login] unexpected error:', e);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;
