// controllers/adminController.js
const supabase = require('../config/db');

exports.getAllMatieres = async (req, res) => {
  try {
    // See what's actually in your token

    const schoolId = req.user?.school_id || null;
    const bypass = req.query.all === '1'; // /api/admin/matieres?all=1

    let query = supabase
      .from('matieres')
      .select('name');
      
    if (!bypass && schoolId) {
      query = query.eq('school_id', schoolId);
    } else if (!bypass && !schoolId) {
      console.warn('No school_id in JWT — returning ALL for debugging');
    }

    const { data, error } = await query;
    
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    console.error('Error fetching matieres:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
