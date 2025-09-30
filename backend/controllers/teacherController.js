// backend/controllers/teacherController.js
const supabase = require("../config/db");

/**
 * GET /api/teacher/filters
 * Return only classes & subjects the teacher is assigned to (no year/term).
 */
async function getFilters(req, res) {
  try {
    const teacherId = req.user.userId;

    const { data, error } = await supabase
      .from("teacher_assignments")
      .select(`
        classes:class_id ( id, name ),
        subjects:subject_id ( id, name )
      `)
      .eq("teacher_id", teacherId);

    if (error) throw error;

    const classesMap = new Map();
    const subjectsMap = new Map();

    (data || []).forEach(r => {
      if (r.classes?.id)  classesMap.set(r.classes.id,  { id: r.classes.id,  name: r.classes.name });
      if (r.subjects?.id) subjectsMap.set(r.subjects.id, { id: r.subjects.id, name: r.subjects.name });
    });

    res.json({
      classes: Array.from(classesMap.values()),
      subjects: Array.from(subjectsMap.values()),
    });
  } catch (err) {
    console.error("getFilters:", err.message);
    res.status(500).json({ error: "Failed to fetch filters" });
  }
}

/**
 * GET /api/teacher/offerings?classId=&subjectId=
 * One card per teacher_assignment (no year/term).
 */
async function getOfferings(req, res) {
  try {
    const teacherId = req.user.userId;
    const { classId = "", subjectId = "" } = req.query;

    let q = supabase
      .from("teacher_assignments")
      .select(`
        id,
        classes:class_id ( id, name ),
        subjects:subject_id ( id, name )
      `)
      .eq("teacher_id", teacherId);

    if (classId)   q = q.eq("class_id", classId);
    if (subjectId) q = q.eq("subject_id", subjectId);

    const { data, error } = await q;
    if (error) throw error;

    const payload = (data || []).map(r => ({
      offering_id: r.id,               // using assignment id as offering_id for UI
      class_id: r.classes?.id || null,
      class_name: r.classes?.name || "",
      subject_id: r.subjects?.id || null,
      subject_name: r.subjects?.name || "",
      students_count: 0,               // you can wire this later
    }));

    res.json(payload);
  } catch (err) {
    console.error("getOfferings:", err.message);
    res.status(500).json({ error: "Failed to fetch offerings" });
  }
}

/**
 * GET /api/teacher/offering/:id
 * Returns a single assignment detail (no year/term).
 */
// REPLACE ONLY THIS FUNCTION
async function getOfferingDetail(req, res) {
  try {
    const teacherId = req.user.userId;
    const { id } = req.params;

    // 1) load assignment the teacher owns
    const { data, error } = await supabase
      .from("teacher_assignments")
      .select(`
        id,
        classes:class_id ( id, name ),
        subjects:subject_id ( id, name )
      `)
      .eq("id", id)
      .eq("teacher_id", teacherId)
      .single();

    if (error || !data) throw error || new Error("Offering not found");

    // 2) load ALL libraries (courses) under this offering
    const { data: libs, error: libErr } = await supabase
      .from("course_libraries")
      .select("id, title, status, created_at, updated_at")
      .eq("assignment_id", id)
      .order("created_at", { ascending: false });

    if (libErr) throw libErr;

    // 3) respond with courses array (no breaking changes to other fields)
    res.json({
      offering_id: data.id,
      class_id: data.classes?.id || null,
      class_name: data.classes?.name || "",
      subject_id: data.subjects?.id || null,
      subject_name: data.subjects?.name || "",
      students_count: 0,
      courses: libs || []
    });
  } catch (err) {
    console.error("getOfferingDetail:", err.message);
    res.status(500).json({ error: "Failed to fetch offering detail" });
  }
}


module.exports = { getFilters, getOfferings, getOfferingDetail };
