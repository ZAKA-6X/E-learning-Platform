'use strict';

const supabase = require('../config/db');

function cleanProfile(row) {
  if (!row) return null;
  const school = row.school || row.schools || null;
  const klass = row.class || row.classes || null;
  const profile = {
    id: row.id,
    email: row.email,
    phone: row.phone || null,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    role: row.role || null,
    status: row.status || null,
    created_at: row.created_at || null,
    last_login_at: row.last_login_at || null,
    school: school
      ? { id: school.id || school.school_id || null, name: school.name || null }
      : null,
    class: klass
      ? {
          id: klass.id || null,
          name: klass.name || null,
          room: klass.room || null,
        }
      : null,
  };

  profile.full_name = [profile.first_name, profile.last_name]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (!profile.full_name) profile.full_name = null;

  return profile;
}

exports.getProfile = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { data, error } = await supabase
      .from('users')
      .select(
        `id,email,phone,first_name,last_name,role,status,created_at,last_login_at,
         school:schools(id,name),
         class:classes(id,name,room)`
      )
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[usersController] getProfile', error);
      return res.status(500).json({ error: error.message || 'Supabase error' });
    }

    const profile = cleanProfile(data);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    return res.json({ profile });
  } catch (err) {
    console.error('[usersController] getProfile', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
