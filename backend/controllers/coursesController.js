// backend/controllers/coursesController.js
const supabase = require("../config/db");

// Util: consistent error response + log
function sendSbError(res, error, code = 500) {
  console.error("[coursesController]", error);
  return res.status(code).json({ error: error?.message || "Server error" });
}

/**
 * GET /api/courses
 * List teacher courses scoped by school + teacher (from req.user)
 */
exports.list = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const schoolId = req.user?.school_id;

    if (!teacherId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("school_id", schoolId)
      .order("updated_at", { ascending: false });

    if (error) return sendSbError(res, error);
    return res.json({ items: data || [] });
  } catch (err) {
    return sendSbError(res, err);
  }
};

/**
 * POST /api/courses
 * Body: { title, subject_id, class_id, status? }
 */
exports.create = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const schoolId = req.user?.school_id;

    if (!teacherId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title, subject_id, class_id, status } = req.body || {};
    if (!title || !subject_id || !class_id) {
      return res
        .status(400)
        .json({ error: "title, subject_id, class_id are required" });
    }

    const payload = {
      title: String(title).trim(),
      subject_id,
      class_id,
      school_id: schoolId,
      teacher_id: teacherId,
      status: status === "published" ? "published" : "draft",
    };

    const { data, error } = await supabase
      .from("courses")
      .insert(payload)
      .select()
      .single();

    if (error) return sendSbError(res, error, 400);
    return res.status(201).json({ item: data });
  } catch (err) {
    return sendSbError(res, err);
  }
};
