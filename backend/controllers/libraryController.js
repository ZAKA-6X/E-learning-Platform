// backend/controllers/libraryController.js
const supabase = require("../config/db");

/** Ensure the assignment belongs to this teacher */
async function assertOwnsAssignment(teacherId, assignmentId) {
  const { data, error } = await supabase
    .from("teacher_assignments")
    .select("id, teacher_id")
    .eq("id", assignmentId)
    .single();

  if (error || !data) throw new Error("Assignment not found");
  if (data.teacher_id !== teacherId) throw new Error("Forbidden");
  return data;
}

/** Resolve libraryId -> assignmentId and ownership */
async function assertOwnsLibrary(teacherId, libraryId) {
  const { data, error } = await supabase
    .from("course_libraries")
    .select("id, assignment_id, teacher_assignments:assignment_id ( teacher_id )")
    .eq("id", libraryId)
    .single();

  if (error || !data) throw new Error("Library not found");
  if (data.teacher_assignments.teacher_id !== teacherId) throw new Error("Forbidden");
  return data;
}

/** Resolve sectionId -> libraryId -> assignmentId and ownership */
async function assertOwnsSection(teacherId, sectionId) {
  const { data, error } = await supabase
    .from("library_sections")
    .select("id, library_id, course_libraries:library_id ( assignment_id, teacher_assignments:assignment_id ( teacher_id ) )")
    .eq("id", sectionId)
    .single();

  if (error || !data) throw new Error("Section not found");
  if (data.course_libraries.teacher_assignments.teacher_id !== teacherId) throw new Error("Forbidden");
  return data;
}

/* ---------------- Libraries (per assignment) ---------------- */

async function listLibraries(req, res) {
  try {
    const teacherId = req.user.userId;
    const { assignmentId } = req.params;

    await assertOwnsAssignment(teacherId, assignmentId);

    const { data, error } = await supabase
      .from("course_libraries")
      .select("id, title, status, created_at, updated_at")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    const status = /Forbidden/.test(e.message) ? 403 : /not found/.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
}

async function createLibrary(req, res) {
  try {
    const teacherId = req.user.userId;
    const { assignmentId } = req.params;
    const { title = "" } = req.body || {};

    if (!title.trim()) return res.status(400).json({ error: "Title required" });
    await assertOwnsAssignment(teacherId, assignmentId);

    // ⬇️ FIX: do NOT cast assignmentId; DB uses bigint and Supabase handles it as-is
    const { data, error } = await supabase
      .from("course_libraries")
      .insert([{ assignment_id: assignmentId, title: title.trim(), status: "draft" }])
      .select("id, title, status, created_at")
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    const status = /Forbidden/.test(e.message) ? 403 : /not found/.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
}

/* ---------------- Sections (folders) ---------------- */

async function listSections(req, res) {
  try {
    const teacherId = req.user.userId;
    const { libraryId } = req.params;

    await assertOwnsLibrary(teacherId, libraryId);

    const { data, error } = await supabase
      .from("library_sections")
      .select("id, title, position, created_at, updated_at")
      .eq("library_id", libraryId)
      .order("position", { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    const status = /Forbidden/.test(e.message) ? 403 : /not found/.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
}

async function createSection(req, res) {
  try {
    const teacherId = req.user.userId;
    const { libraryId } = req.params;
    const { title = "" } = req.body || {};
    if (!title.trim()) return res.status(400).json({ error: "Title required" });

    await assertOwnsLibrary(teacherId, libraryId);

    // find max position
    const { data: rows } = await supabase
      .from("library_sections")
      .select("position")
      .eq("library_id", libraryId)
      .order("position", { ascending: false })
      .limit(1);

    const nextPos = (rows?.[0]?.position || 0) + 1;

    const { data, error } = await supabase
      .from("library_sections")
      .insert([{ library_id: libraryId, title: title.trim(), position: nextPos }])
      .select("id, title, position, created_at")
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    const status = /Forbidden/.test(e.message) ? 403 : /not found/.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
}

/* ---------------- Items (files/links) ---------------- */

async function listItems(req, res) {
  try {
    const teacherId = req.user.userId;
    const { sectionId } = req.params;

    await assertOwnsSection(teacherId, sectionId);

    const { data, error } = await supabase
      .from("library_items")
      .select("id, kind, name, url, size_bytes, position, created_at")
      .eq("section_id", sectionId)
      .order("position", { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    const status = /Forbidden/.test(e.message) ? 403 : /not found/.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
}

async function createItem(req, res) {
  try {
    const teacherId = req.user.userId;
    const { sectionId } = req.params;
    const { name = "", kind = "", url = "", size_bytes = null } = req.body || {};

    if (!name.trim() || !kind || !url) {
      return res.status(400).json({ error: "name, kind, url required" });
    }
    if (!["pdf", "image", "video", "link", "other"].includes(kind)) {
      return res.status(400).json({ error: "Invalid kind" });
    }

    await assertOwnsSection(teacherId, sectionId);

    const { data: rows } = await supabase
      .from("library_items")
      .select("position")
      .eq("section_id", sectionId)
      .order("position", { ascending: false })
      .limit(1);

    const nextPos = (rows?.[0]?.position || 0) + 1;

    const { data, error } = await supabase
      .from("library_items")
      .insert([{ section_id: sectionId, name: name.trim(), kind, url, size_bytes, position: nextPos }])
      .select("id, kind, name, url, size_bytes, position, created_at")
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    const status = /Forbidden/.test(e.message) ? 403 : /not found/.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
}

module.exports = {
  listLibraries,
  createLibrary,
  listSections,
  createSection,
  listItems,
  createItem,
};
