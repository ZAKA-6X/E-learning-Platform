// controllers/adminController.js
const supabase = require("../config/db");

exports.getAllMatieres = async (req, res) => {
  try {
    // See what's actually in your token

    const schoolId = req.user?.school_id || null;
    const bypass = req.query.all === "1"; // /api/admin/matieres?all=1

    let query = supabase.from("subjects").select("name");

    if (!bypass && schoolId) {
      query = query.eq("school_id", schoolId);
    } else if (!bypass && !schoolId) {
      console.warn("No school_id in JWT — returning ALL for debugging");
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    console.error("Error fetching matieres:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /admin/kpis/students-count
// Returns the number of students for the authenticated admin's school_id
exports.getStudentsCountKPI = async (req, res) => {
  try {
    const schoolId = req.user?.school_id;
    if (!schoolId) {
      return res.status(400).json({ error: "Missing school_id in token" });
    }
    // Use Supabase query builder (same style as matiere)
    const { count, error } = await supabase
      .from("users")
      // head:true means we only want the count header; no row data returned
      .select("id", { count: "exact", head: true })
      .eq("role", "student")
      .eq("school_id", schoolId);

    if (error) {
      console.error("Supabase error in getStudentsCountKPI:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ count: count || 0 });
  } catch (err) {
    console.error("Error in getStudentsCountKPI:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/admin/kpis/exams-count
// Count ALL exams (no school/subject filter)
exports.getUpcomingExamsCountKPI = async (req, res) => {
  try {
    const { count, error } = await supabase
      .from("exams")
      .select("id", { count: "exact", head: true });

    if (error) {
      console.error("Supabase error counting exams:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.json({ count: count || 0 });
  } catch (err) {
    console.error("Error in getExamsCountKPI:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
