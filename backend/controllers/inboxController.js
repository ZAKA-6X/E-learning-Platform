"use strict";

const supabase = require("../config/db");

const MAX_MESSAGE_LENGTH = 2000;

function normalizeRole(role) {
  if (!role) return "";
  return String(role).toLowerCase();
}

function normalizeId(value) {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildFullName(first, last) {
  return [first, last].filter(Boolean).join(" ").trim();
}

function buildMessagePayload(row, studentId) {
  if (!row) return null;
  const author = row.sender_id === studentId ? "student" : "teacher";
  return {
    id: row.id,
    author,
    text: row.body,
    createdAt: row.created_at,
    readAt: row.read_at || null,
  };
}

async function fetchConversation(studentId, teacherId) {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("id, student_id, teacher_id, sender_id, body, created_at, read_at")
    .eq("student_id", studentId)
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function ensureParticipant(teacherId, expectedRole) {
  if (!teacherId) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, role, first_name, last_name, email")
    .eq("id", teacherId)
    .single();

  if (error) {
    error.status = error.code === "PGRST116" ? 404 : 500;
    throw error;
  }

  const role = normalizeRole(data?.role);
  if (expectedRole && role !== expectedRole) {
    const err = new Error("Role mismatch");
    err.status = 400;
    throw err;
  }

  return data;
}

async function insertMessage({ studentId, teacherId, senderId, body }) {
  const payload = {
    student_id: studentId,
    teacher_id: teacherId,
    sender_id: senderId,
    body,
  };

  const { data, error } = await supabase
    .from("direct_messages")
    .insert(payload)
    .select("id, student_id, teacher_id, sender_id, body, created_at, read_at")
    .single();

  if (error) throw error;
  return data;
}

exports.getMessagesWithTeacher = async (req, res) => {
  const userId = req.user?.id;
  const role = normalizeRole(req.user?.role);
  const teacherId = normalizeId(req.params?.teacherId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (role !== "student") {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!teacherId) {
    return res.status(400).json({ error: "Identifiant enseignant manquant." });
  }

  try {
    await ensureParticipant(teacherId, "teacher");
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: "Enseignant introuvable." });
    }
    if (err?.status === 400) {
      return res.status(400).json({ error: "Accès refusé." });
    }
    console.error("[inbox] ensureParticipant teacher", err);
    return res.status(500).json({ error: "Impossible de charger la conversation." });
  }

  try {
    const rows = await fetchConversation(userId, teacherId);
    const messages = rows.map((row) => buildMessagePayload(row, userId)).filter(Boolean);
    return res.json({ messages });
  } catch (err) {
    console.error("[inbox] getMessagesWithTeacher", err);
    return res.status(500).json({ error: "Impossible de charger les messages." });
  }
};

exports.getMessagesWithStudent = async (req, res) => {
  const userId = req.user?.id;
  const role = normalizeRole(req.user?.role);
  const studentId = normalizeId(req.params?.studentId);

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (role !== "teacher" && role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!studentId) {
    return res.status(400).json({ error: "Identifiant étudiant manquant." });
  }

  try {
    await ensureParticipant(studentId, "student");
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: "Étudiant introuvable." });
    }
    if (err?.status === 400) {
      return res.status(400).json({ error: "Accès refusé." });
    }
    console.error("[inbox] ensureParticipant student", err);
    return res.status(500).json({ error: "Impossible de charger la conversation." });
  }

  try {
    const rows = await fetchConversation(studentId, userId);
    const messages = rows.map((row) => buildMessagePayload(row, studentId)).filter(Boolean);
    return res.json({ messages });
  } catch (err) {
    console.error("[inbox] getMessagesWithStudent", err);
    return res.status(500).json({ error: "Impossible de charger les messages." });
  }
};

exports.sendMessageToTeacher = async (req, res) => {
  const userId = req.user?.id;
  const role = normalizeRole(req.user?.role);
  const teacherId = normalizeId(req.params?.teacherId);
  const bodyText = (req.body?.text || req.body?.message || "").trim();

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (role !== "student") {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!teacherId) {
    return res.status(400).json({ error: "Identifiant enseignant manquant." });
  }
  if (!bodyText) {
    return res.status(400).json({ error: "Le message est vide." });
  }
  if (bodyText.length > MAX_MESSAGE_LENGTH) {
    return res
      .status(400)
      .json({ error: `Le message est trop long (max ${MAX_MESSAGE_LENGTH} caractères).` });
  }

  try {
    await ensureParticipant(teacherId, "teacher");
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: "Enseignant introuvable." });
    }
    if (err?.status === 400) {
      return res.status(400).json({ error: "Accès refusé." });
    }
    console.error("[inbox] ensureParticipant teacher", err);
    return res.status(500).json({ error: "Impossible d'envoyer le message." });
  }

  try {
    const row = await insertMessage({
      studentId: userId,
      teacherId,
      senderId: userId,
      body: bodyText,
    });

    const message = buildMessagePayload(row, userId);
    return res.status(201).json({ message });
  } catch (err) {
    console.error("[inbox] sendMessageToTeacher", err);
    if (err?.code === "23503") {
      return res.status(400).json({ error: "Participants invalides." });
    }
    return res.status(500).json({ error: "Impossible d'envoyer le message." });
  }
};

exports.sendMessageToStudent = async (req, res) => {
  const userId = req.user?.id;
  const role = normalizeRole(req.user?.role);
  const studentId = normalizeId(req.params?.studentId);
  const bodyText = (req.body?.text || req.body?.message || "").trim();

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (role !== "teacher" && role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!studentId) {
    return res.status(400).json({ error: "Identifiant étudiant manquant." });
  }
  if (!bodyText) {
    return res.status(400).json({ error: "Le message est vide." });
  }
  if (bodyText.length > MAX_MESSAGE_LENGTH) {
    return res
      .status(400)
      .json({ error: `Le message est trop long (max ${MAX_MESSAGE_LENGTH} caractères).` });
  }

  try {
    await ensureParticipant(studentId, "student");
  } catch (err) {
    if (err?.status === 404) {
      return res.status(404).json({ error: "Étudiant introuvable." });
    }
    if (err?.status === 400) {
      return res.status(400).json({ error: "Accès refusé." });
    }
    console.error("[inbox] ensureParticipant student", err);
    return res.status(500).json({ error: "Impossible d'envoyer le message." });
  }

  try {
    const row = await insertMessage({
      studentId,
      teacherId: userId,
      senderId: userId,
      body: bodyText,
    });

    const message = buildMessagePayload(row, studentId);
    return res.status(201).json({ message });
  } catch (err) {
    console.error("[inbox] sendMessageToStudent", err);
    if (err?.code === "23503") {
      return res.status(400).json({ error: "Participants invalides." });
    }
    return res.status(500).json({ error: "Impossible d'envoyer le message." });
  }
};

exports.listStudentsForTeacher = async (req, res) => {
  const teacherId = normalizeId(req.user?.id);
  const role = normalizeRole(req.user?.role);

  if (!teacherId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (role !== "teacher" && role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { data: directRows, error: directError } = await supabase
      .from("direct_messages")
      .select("student_id, teacher_id, sender_id, body, created_at")
      .eq("teacher_id", teacherId)
      .not("student_id", "is", null)
      .order("created_at", { ascending: false });

    if (directError) {
      console.error("[inbox] listStudents direct messages", directError);
      return res.status(500).json({ error: directError.message || "Supabase error" });
    }

    const studentMap = new Map();

    for (const row of directRows || []) {
      const studentId = normalizeId(row?.student_id);
      if (!studentId) continue;

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          last_message: {
            text: row?.body || "",
            author: normalizeId(row?.sender_id) === teacherId ? "teacher" : "student",
            createdAt: row?.created_at || null,
          },
        });
      }
    }

    if (!studentMap.size) {
      return res.json({ students: [] });
    }

    const studentIds = Array.from(studentMap.keys());

    const { data: studentRows, error: studentsError } = await supabase
      .from("users")
      .select(
        "id,email,first_name,last_name,status,role,class_id,class:classes(id,name)"
      )
      .in("id", studentIds)
      .ilike("role", "student");

    if (studentsError) {
      console.error("[inbox] listStudents students", studentsError);
      return res.status(500).json({ error: studentsError.message || "Supabase error" });
    }

    const students = (studentRows || []).map((row) => {
      const id = normalizeId(row?.id);
      if (!id) return null;
      const first = row?.first_name || "";
      const last = row?.last_name || "";
      const fullName = buildFullName(first, last) || row?.email || "Étudiant";
      const klass = row?.class || null;
      return {
        id,
        email: row?.email || "",
        first_name: first || null,
        last_name: last || null,
        full_name: fullName,
        status: row?.status || null,
        class: klass
          ? {
              id: klass.id || null,
              name: klass.name || null,
            }
          : null,
        last_message: studentMap.get(id)?.last_message || null,
      };
    }).filter(Boolean);

    return res.json({ students });
  } catch (err) {
    console.error("[inbox] listStudentsForTeacher", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
