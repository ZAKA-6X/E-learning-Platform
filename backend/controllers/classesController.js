'use strict';

const supabase = require('../config/db');

function toItems(data) {
  return Array.isArray(data)
    ? data.map((row) => ({
        id: row.id,
        name: row.name,
        room: row.room || null,
      }))
    : [];
}

/**
 * GET /classes/mine
 * Returns classes for the authenticated user's school.
 */
exports.getClassesMine = async (req, res) => {
  try {
    const schoolId = req.user?.school_id;
    if (!schoolId) {
      return res.status(400).json({ error: 'Missing school_id in token' });
    }

    const { data, error } = await supabase
      .from('classes')
      .select('id,name,room')
      .eq('school_id', schoolId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase error fetching classes (mine):', error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ items: toItems(data) });
  } catch (err) {
    console.error('Error in getClassesMine:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
