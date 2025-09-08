'use strict';


/**
 * GET /subjects
 * Returns subjects belonging to the logged-in user's school.
 */
exports.getSubjectsForSchool = async (req, res) => {
  try {
    const schoolId = req.user?.school_id;
    if (!schoolId) {
      return res.status(400).json({ error: 'Missing school_id in token' });
    }

    const { data, error } = await supabase
      .from('subjects')
      .select('id,name,code')
      .eq('school_id', schoolId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase error fetching subjects:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ subjects: data || [] });
  } catch (err) {
    console.error('Error in getSubjectsForSchool:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
