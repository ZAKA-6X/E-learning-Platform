// backend/controllers/classesController.js
const supabase = require('../config/db');

exports.listMine = async (req, res) => {
  try {
    const schoolId = req.user?.school_id;
    if (!schoolId) return res.status(401).json({ error: 'Unauthorized' });

    const { data, error } = await supabase
      .from('classes')
      .select('id, name')
      .eq('school_id', schoolId)
      .order('name', { ascending: true });

    if (error) {
      console.error('[classesController.listMine]', error);
      return res.status(500).json({ error: error.message });
    }
    return res.json({ items: data || [] });
  } catch (e) {
    console.error('[classesController.listMine]', e);
    return res.status(500).json({ error: 'Server error' });
  }
};
