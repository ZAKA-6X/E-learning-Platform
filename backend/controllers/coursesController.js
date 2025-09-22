const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto");
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
  const teacher =
    row.teacher ||
    row.teachers ||
    row.instructor ||
    row.user ||
    row.users ||
    null;

  const teacherName = teacher
    ? [teacher.first_name, teacher.last_name].filter(Boolean).join(" ").trim()
    : "";

  const shaped = {
    ...row,
    subject_name: subject?.name || null,
    class_name: klass?.name || null,
    class_room: klass?.room || null,
    teacher_name:
      teacherName || teacher?.display_name || teacher?.name || teacher?.email || null,
    teacher_email: teacher?.email || null,
    teacher_id: row.teacher_id || teacher?.id || null,
  };

  ["subject", "subjects", "klass", "class", "classes"].forEach((key) => {
    if (key in shaped) delete shaped[key];
  });

  ["teacher", "teachers", "instructor", "user", "users"].forEach((key) => {
    if (key in shaped) delete shaped[key];
  });

  return shaped;
}

function detectResourceKind(file) {
  if (!file?.mimetype) return "document";
  const type = file.mimetype.toLowerCase();
  if (type === "application/pdf") return "document";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";
  return "document";
}

async function nextPosition(table, courseId, column = "position") {
  const { data, error } = await supabase
    .from(table)
    .select(column)
    .eq("course_id", courseId)
    .order(column, { ascending: false })
    .limit(1);
  if (error) throw error;
  const current = Array.isArray(data) && data.length ? Number(data[0][column]) || 0 : 0;
  return current + 1;
}

async function safeUnlink(filePath) {
  try {
    await fs.promises.unlink(filePath);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn("[coursesController] unlink failed", err.message);
    }
  }
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
      .select("*, subject:subjects(name), klass:classes(name, room)")
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
 * GET /api/courses/student
 * List published courses for the authenticated student's class.
 */
exports.listForStudent = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, school_id, class_id")
      .eq("id", userId)
      .maybeSingle();

    if (userErr) return sendSbError(res, userErr);
    if (!userRow) {
      return res.status(404).json({ error: "User not found" });
    }

    const schoolId = userRow.school_id;
    const classId = userRow.class_id;

    // No class assigned -> success with explicit reason
    if (!classId) {
      return res.status(200).json({ items: [], meta: { reason: "NO_CLASS" } });
    }

    // Select only what the UI needs
    const SELECT_COLUMNS =
      "id, title, code, status, updated_at, created_at, " +
      "subject:subjects(name), " +
      "klass:classes(name, room), " +
      "teacher:users!courses_teacher_id_fkey(id, first_name, last_name, email)";

    const { data, error } = await supabase
      .from("courses")
      .select(SELECT_COLUMNS)
      .eq("school_id", schoolId)
      .eq("class_id", classId)
      .eq("status", "published")
      .order("updated_at", { ascending: false });

    if (error) return sendSbError(res, error);

    const items = Array.isArray(data) ? data.map(shapeCourse) : [];

    // Class exists but zero published courses -> success with explicit reason
    if (items.length === 0) {
      return res.status(200).json({ items: [], meta: { reason: "NO_COURSES" } });
    }

    return res.status(200).json({ items });
  } catch (err) {
    return sendSbError(res, err);
  }
};

/**
 * GET /api/courses/:id
 * Returns a single course with its sections, resources and quizzes.
 */
exports.getOne = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const schoolId = req.user?.school_id;
    const courseId = req.params?.id;

    if (!teacherId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!courseId) {
      return res.status(400).json({ error: "Course id is required" });
    }

    const { data: courseRow, error: courseErr } = await supabase
      .from("courses")
      .select("*, subject:subjects(name), klass:classes(name, room)")
      .eq("id", courseId)
      .eq("teacher_id", teacherId)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (courseErr) {
      if (courseErr.code === "PGRST116") {
        return res.status(404).json({ error: "Course not found" });
      }
      return sendSbError(res, courseErr);
    }

    if (!courseRow) {
      return res.status(404).json({ error: "Course not found" });
    }

    const [sectionsResp, resourcesResp] = await Promise.all([
      supabase
        .from("course_sections")
        .select("id, title, description, position, updated_at")
        .eq("course_id", courseId)
        .order("position", { ascending: true }),
      supabase
        .from("course_resources")
        .select(
          "id, title, description, kind, resource_url, content, section_id, position, created_at, updated_at"
        )
        .eq("course_id", courseId)
        .order("position", { ascending: true }),
    ]);

    if (sectionsResp.error) return sendSbError(res, sectionsResp.error);
    if (resourcesResp.error) return sendSbError(res, resourcesResp.error);

    const sections = Array.isArray(sectionsResp.data) ? sectionsResp.data : [];
    const resources = Array.isArray(resourcesResp.data) ? resourcesResp.data : [];

    const documentsCount = resources.filter(
      (item) => (item.kind || "document").toLowerCase() === "document"
    ).length;
    const videosCount = resources.filter(
      (item) => (item.kind || "").toLowerCase() === "video"
    ).length;
    const linksCount = resources.filter(
      (item) => (item.kind || "").toLowerCase() === "link"
    ).length;

    const shapedCourse = shapeCourse(courseRow);

    return res.json({
      item: {
        ...shapedCourse,
        section_count: sections.length,
        resource_count: resources.length,
        stats: {
          documents: documentsCount,
          videos: videosCount,
          links: linksCount,
        },
        sections,
        resources,
      },
    });
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

exports.createSection = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const schoolId = req.user?.school_id;
    const courseId = req.params?.id;

    if (!teacherId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!courseId) {
      return res.status(400).json({ error: "Course id is required" });
    }

    const { title, description, resource_title } = req.body || {};
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Section title is required" });
    }

    const { data: courseRow, error: courseErr } = await supabase
      .from("courses")
      .select("id")
      .eq("id", courseId)
      .eq("teacher_id", teacherId)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (courseErr) return sendSbError(res, courseErr);
    if (!courseRow) {
      return res.status(404).json({ error: "Course not found" });
    }

    const file = req.file || null;
    if (!file) {
      return res.status(400).json({ error: "A media file is required" });
    }

    const allowed = ["application/pdf", "image/", "video/"];
    const isAllowed = allowed.some((prefix) =>
      prefix.endsWith("/") ? file.mimetype.startsWith(prefix) : file.mimetype === prefix
    );
    if (!isAllowed) {
      return res.status(400).json({ error: "Unsupported media type" });
    }

    const sectionPosition = await nextPosition("course_sections", courseId);

    const sectionPayload = {
      course_id: courseId,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      position: sectionPosition,
    };

    const { data: sectionData, error: sectionErr } = await supabase
      .from("course_sections")
      .insert(sectionPayload)
      .select("*")
      .single();

    if (sectionErr) return sendSbError(res, sectionErr, 400);

    const sectionId = sectionData.id;
    const ext = path.extname(file.originalname || "").toLowerCase() || "";
    const uploadDir = path.join(__dirname, "../../uploads/courses", courseId);
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const filename = `${randomUUID()}${ext || getExtFromMime(file.mimetype)}`;
    const filepath = path.join(uploadDir, filename);
    await fs.promises.writeFile(filepath, file.buffer);
    const publicUrl = `/uploads/courses/${courseId}/${filename}`;

    const resourceKind = detectResourceKind(file);
    const resourcePosition = await nextPosition("course_resources", courseId);

    const resourcePayload = {
      course_id: courseId,
      section_id: sectionId,
      title: (resource_title || title || "Ressource").trim(),
      kind: resourceKind,
      resource_url: publicUrl,
      position: resourcePosition,
    };

    const { data: resourceData, error: resourceErr } = await supabase
      .from("course_resources")
      .insert(resourcePayload)
      .select(
        "id, title, description, kind, resource_url, content, section_id, position, created_at, updated_at"
      )
      .single();

    if (resourceErr) {
      await safeUnlink(filepath);
      return sendSbError(res, resourceErr, 400);
    }

    return res.status(201).json({ section: sectionData, resource: resourceData });
  } catch (err) {
    return sendSbError(res, err);
  }
};

function getExtFromMime(mime) {
  if (!mime) return "";
  if (mime === "application/pdf") return ".pdf";
  if (mime.startsWith("image/")) return ".jpg";
  if (mime.startsWith("video/")) return ".mp4";
  return "";
}
