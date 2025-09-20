// backend/controllers/coursesController.js
const supabase = require("../config/db");

// Util: consistent error response + log
function sendSbError(res, error, code = 500) {
  console.error("[coursesController]", error);
  return res.status(code).json({ error: error?.message || "Server error" });
}

function shapeCourse(row) {
  if (!row) return row;

  const subject = row.subject || row.subjects || null;
  const klass = row.klass || row.class || row.classes || null;

  const shaped = {
    ...row,
    subject_name: subject?.name || null,
    class_name: klass?.name || null,
    class_room: klass?.room || null,
  };

  ["subject", "subjects", "klass", "class", "classes"].forEach((key) => {
    if (key in shaped) delete shaped[key];
  });

  return shaped;
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
      .select(
        "*, subject:subjects(name), klass:classes(name, room)"
      )
      .eq("teacher_id", teacherId)
      .eq("school_id", schoolId)
      .order("updated_at", { ascending: false });

    if (error) return sendSbError(res, error);
    const items = Array.isArray(data) ? data.map(shapeCourse) : [];
    return res.json({ items });
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
      .select("*, subject:subjects(name), klass:classes(name, room)")
      .single();

    if (error) return sendSbError(res, error, 400);
    return res.status(201).json({ item: shapeCourse(data) });
  } catch (err) {
    return sendSbError(res, err);
  }
};
