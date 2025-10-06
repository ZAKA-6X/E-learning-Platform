// backend/controllers/libraryController.js
require('dotenv').config();

let supabase;
let supabaseAdmin;
try {
  const cfg = require('../config/db');
  supabase = cfg.supabase || cfg;        // default export or named
  supabaseAdmin = cfg.supabaseAdmin || null;
} catch {
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL || process.env.DATABASE_URL;
  supabase = createClient(url, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  supabaseAdmin = process.env.SUPABASE_SERVICE_KEY
    ? createClient(url, process.env.SUPABASE_SERVICE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
}

const STORAGE_BUCKET = process.env.COURSE_BUCKET || 'course-files';
const SUBMISSION_BUCKET = process.env.STUDENT_SUBMISSIONS_BUCKET || 'student-submissions';
const HOMEWORK_KEYWORDS = ['exerc', 'devoir'];

/* ---------- OpenAI ---------- */
let openai = null;
try {
  const { OpenAI } = require('openai');
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} catch (e) {
  console.warn('[AI] OpenAI SDK not installed yet.');
}

/* ---------- Fetch shim for Node <18 (ESM-safe) ---------- */
let fx = globalThis.fetch;
async function ensureFetch() {
  if (!fx) {
    const mod = await import('node-fetch'); // ESM default export
    fx = mod.default;
  }
}

/* ---------- Ownership guards ---------- */
async function assertOwnsAssignment(teacherId, assignmentId) {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select('id, teacher_id')
    .eq('id', assignmentId)
    .single();
  if (error || !data) throw new Error('Assignment not found');
  if (data.teacher_id !== teacherId) throw new Error('Forbidden');
  return data;
}
async function assertOwnsLibrary(teacherId, libraryId) {
  const { data, error } = await supabase
    .from('course_libraries')
    .select('id, assignment_id')
    .eq('id', libraryId)
    .single();
  if (error || !data) throw new Error('Library not found');
  await assertOwnsAssignment(teacherId, data.assignment_id);
  return data;
}
async function assertOwnsSection(teacherId, sectionId) {
  const { data, error } = await supabase
    .from('library_sections')
    .select('id, library_id')
    .eq('id', sectionId)
    .single();
  if (error || !data) throw new Error('Section not found');
  await assertOwnsLibrary(teacherId, data.library_id);
  return data;
}

/* ---------- Helpers ---------- */
function pgIsDuplicate(err) {
  return !!(err && (err.code === '23505' || /duplicate key value/i.test(err.message || '')));
}
function trimOrNull(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t ? t : null;
}
function kindFromExt(filename = '') {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (['pdf'].includes(ext)) return 'pdf';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image';
  if (['mp4','mov','webm','mkv'].includes(ext)) return 'video';
  if (['mp3','wav','m4a','aac','flac','ogg'].includes(ext)) return 'audio';
  return 'other';
}
function toStorageSafeName(original = 'file') {
  let name = original.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  name = name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (name.length > 180) {
    const ext = (name.split('.').pop() || '');
    const base = name.slice(0, 180 - (ext ? ext.length + 1 : 0));
    name = ext ? `${base}.${ext}` : base;
  }
  return name || `file-${Date.now()}`;
}
function joinKey(...parts) {
  return parts
    .filter(Boolean)
    .map(s => String(s).replace(/^\/+|\/+$/g, ''))
    .join('/')
    .replace(/\/{2,}/g, '/')
    .replace(/^\//, '');
}

function matchesHomeworkKeyword(value) {
  if (!value) return false;
  const lower = String(value).toLowerCase();
  return HOMEWORK_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function isExerciseResource(section, item) {
  return (
    matchesHomeworkKeyword(section?.title) ||
    matchesHomeworkKeyword(item?.name) ||
    matchesHomeworkKeyword(item?.kind)
  );
}

function formatExerciseSummary(entry = {}) {
  const total = Number(entry.total) || 0;
  const submitted = Number(entry.submitted) || 0;
  return {
    total,
    submitted: submitted > total ? total : submitted,
    pending: total > submitted ? total - submitted : 0,
  };
}

function presentSubmission(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    course_id: row.course_id || null,
    item_id: row.item_id || null,
    file_url: row.file_url || null,
    file_name: row.file_name || null,
    file_size: row.file_size || null,
    mime_type: row.mime_type || null,
    submitted_at: row.submitted_at || null,
    updated_at: row.updated_at || null,
  };
}

async function removeStorageObject(bucket, key) {
  if (!bucket || !key) return;
  try {
    const client = (supabaseAdmin || supabase).storage.from(bucket);
    const { error } = await client.remove([key]);
    if (error && error.message && !/object not found/i.test(error.message)) {
      console.warn('[storage] remove failed', error.message);
    }
  } catch (err) {
    console.warn('[storage] remove exception', err?.message || err);
  }
}

function isMissingTableError(err, tableName) {
  if (!err) return false;
  const code = err.code || err.status || err.message;
  if (err.code === '42P01') return true;
  const msg = String(err.message || err).toLowerCase();
  return msg.includes('relation') && msg.includes(String(tableName).toLowerCase());
}

async function loadExerciseData(libraryIds, studentId) {
  const safeIds = Array.isArray(libraryIds) ? libraryIds.filter(Boolean) : [];
  const itemsByCourse = new Map();
  const summaryByCourse = new Map();
  const submissionsByItem = new Map();

  if (!safeIds.length) {
    return { itemsByCourse, summaryByCourse, submissionsByItem };
  }

  const { data: sectionsData, error: sectionsErr } = await supabase
    .from('library_sections')
    .select('id, library_id, title')
    .in('library_id', safeIds);

  if (sectionsErr) {
    throw new Error(sectionsErr.message || 'Unable to load sections');
  }

  const sectionRows = Array.isArray(sectionsData) ? sectionsData : [];
  const sectionIds = sectionRows.map((section) => section.id).filter(Boolean);
  const sectionsById = new Map(sectionRows.map((section) => [section.id, section]));

  if (!sectionRows.length) {
    return { itemsByCourse, summaryByCourse, submissionsByItem };
  }

  let itemRows = [];
  if (sectionIds.length) {
    const { data: itemsData, error: itemsErr } = await supabase
      .from('library_items')
      .select('id, section_id, name, kind, url, size_bytes, created_at, updated_at')
      .in('section_id', sectionIds);

    if (itemsErr) {
      throw new Error(itemsErr.message || 'Unable to load items');
    }
    itemRows = Array.isArray(itemsData) ? itemsData : [];
  }

  let submissionRows = [];
  if (studentId) {
    const { data: submissionsData, error: submissionsErr } = await supabase
      .from('student_exercise_submissions')
      .select('id, course_id, item_id, file_url, file_name, file_size, mime_type, storage_key, submitted_at, updated_at')
      .eq('student_id', studentId)
      .in('course_id', safeIds);

    if (submissionsErr) {
      if (!isMissingTableError(submissionsErr, 'student_exercise_submissions')) {
        console.warn('[loadExerciseData] submissions lookup non-fatal', submissionsErr);
      }
      submissionRows = [];
    } else {
      submissionRows = Array.isArray(submissionsData) ? submissionsData : [];
      submissionRows.forEach((row) => {
        if (row?.item_id) submissionsByItem.set(row.item_id, row);
      });
    }
  }

  sectionRows.forEach((section) => {
    if (!section?.library_id) return;
    if (!itemsByCourse.has(section.library_id)) {
      itemsByCourse.set(section.library_id, []);
    }
  });

  itemRows.forEach((item) => {
    const section = sectionsById.get(item.section_id);
    if (!section || !section.library_id) return;
    if (!isExerciseResource(section, item)) return;
    const carrier = itemsByCourse.get(section.library_id) || [];
    carrier.push({ item, section });
    itemsByCourse.set(section.library_id, carrier);
  });

  itemsByCourse.forEach((items, courseId) => {
    const submitted = items.filter(({ item }) => submissionsByItem.has(item.id)).length;
    summaryByCourse.set(courseId, formatExerciseSummary({ total: items.length, submitted }));
  });

  return { itemsByCourse, summaryByCourse, submissionsByItem };
}

async function fetchStudentCourseContext(studentId, courseId) {
  const { data: student, error: studentErr } = await supabase
    .from('users')
    .select('id, class_id')
    .eq('id', studentId)
    .single();

  if (studentErr) {
    const err = new Error(studentErr.message || 'Unable to resolve student profile');
    err.code = 'STUDENT_LOOKUP';
    throw err;
  }

  if (!student?.class_id) {
    const err = new Error('Student has no class assigned');
    err.code = 'NO_CLASS';
    throw err;
  }

  const { data: course, error: courseErr } = await supabase
    .from('course_libraries')
    .select(`
      id,
      assignment_id,
      title,
      status,
      created_at,
      updated_at,
      assignment:teacher_assignments!course_libraries_assignment_id_fkey (
        id,
        class:classes!teacher_assignments_class_id_fkey ( id, name ),
        subject:subjects!teacher_assignments_subject_id_fkey ( id, name ),
        teacher:users!teacher_assignments_teacher_id_fkey ( id, first_name, last_name, email )
      )
    `)
    .eq('id', courseId)
    .single();

  if (courseErr || !course) {
    const err = new Error(courseErr?.message || 'Course not found');
    err.code = 'COURSE_NOT_FOUND';
    throw err;
  }

  const assignmentClassId = course?.assignment?.class?.id || course?.assignment?.class_id || null;
  if (!assignmentClassId || assignmentClassId !== student.class_id) {
    const err = new Error('Forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  return { student, course };
}

/** Try to reconstruct the storage object key from a public URL */
function storageKeyFromPublicUrl(url) {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    // Typical: /storage/v1/object/public/<bucket>/<key...>
    const marker = `/object/public/${STORAGE_BUCKET}/`;
    const idx = path.indexOf(marker);
    if (idx >= 0) return path.slice(idx + marker.length);
    // fallback: look for '/<bucket>/' segment
    const marker2 = `/${STORAGE_BUCKET}/`;
    const idx2 = path.indexOf(marker2);
    if (idx2 >= 0) return path.slice(idx2 + marker2.length);
  } catch (_) {}
  return null;
}

function simplifyTeacher(row) {
  if (!row) return null;
  const first = row.first_name || '';
  const last = row.last_name || '';
  const name = [first, last].filter(Boolean).join(' ').trim() || row.email || 'Enseignant';
  return {
    id: row.id || null,
    first_name: first || null,
    last_name: last || null,
    email: row.email || null,
    name,
  };
}

function simplifySubject(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    name: row.name || null,
  };
}

function simplifyClass(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    name: row.name || null,
  };
}

/* ---------- Resource content extractors (PDF/DOCX/Text/Link/Image/Video) ---------- */
async function fetchArrayBuffer(url) {
  await ensureFetch();
  const res = await fx(url);
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function extractTextFromUrl(url, kind = 'other') {
  const lcKind = (kind || '').toLowerCase();
  try {
    if (lcKind === 'pdf') {
      const pdfParse = require('pdf-parse'); // will throw if not installed
      const buf = await fetchArrayBuffer(url);
      const data = await pdfParse(buf);
      return (data.text || '').trim();
    }
    if (lcKind === 'docx') {
      const mammoth = require('mammoth'); // will throw if not installed
      const buf = await fetchArrayBuffer(url);
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return (value || '').trim();
    }
    if (lcKind === 'link') {
      await ensureFetch();
      const res = await fx(url);
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 80000); // safety cap
    }
    // default: try plain text download
    await ensureFetch();
    const res = await fx(url);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/')) {
      const t = await res.text();
      return t.slice(0, 80000).trim();
    }
    // non-textual (image/video/audio) → return empty; model can read the URL directly
    return '';
  } catch (e) {
    console.warn('[extractTextFromUrl] fallback to empty:', e?.message);
    return '';
  }
}

/* Prompt builders */
function buildPrompt(mode, text) {
  switch (mode) {
    case 'summary':
      return `Tu es un assistant pédagogique. À partir du contenu ci-dessous, écris un RÉSUMÉ (200–300 mots) en français, clair pour un élève de lycée. Réponds en Markdown.\n\n=== CONTENU ===\n${text}`;
    case 'concepts':
      return `Tu es un assistant pédagogique. À partir du contenu ci-dessous, liste 6 à 12 CONCEPTS CLÉS sous forme de puces « - ... » en français. Réponds en Markdown.\n\n=== CONTENU ===\n${text}`;
    case 'exercises':
      return `Génère 3 à 5 EXERCICES avec SOLUTIONS détaillées en français, format Markdown. Les énoncés sont courts et progressifs. Réponds uniquement en Markdown.\n\n=== CONTENU ===\n${text}`;
    case 'quiz':
    default:
      return `Génère un QCM en français au format JSON strict: {"quiz":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"rationale":"..."}]}. 8 à 12 items. Questions basées sur le contenu ci-dessous. Aucun texte hors JSON.\n\n=== CONTENU ===\n${text}`;
  }
}

/* ---------- Controllers ---------- */

// GET /offerings/:assignmentId/libraries
exports.listLibraries = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { assignmentId } = req.params;
    await assertOwnsAssignment(teacherId, assignmentId);

    const { data, error } = await supabase
      .from('course_libraries')
      .select('id, title, status, created_at')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json(data || []);
  } catch (e) {
    console.error('[listLibraries]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// POST /offerings/:assignmentId/libraries { title }
exports.createLibrary = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { assignmentId } = req.params;
    const title = trimOrNull(req.body?.title);
    if (!title) return res.status(400).json({ error: 'Title required' });

    await assertOwnsAssignment(teacherId, assignmentId);

    const { data: lib, error } = await supabase
      .from('course_libraries')
      .insert([{ assignment_id: assignmentId, title }])
      .select('id, title, status, created_at')
      .single();
    if (error) throw error;

    // seed default folders (best-effort)
    try {
      await supabase.from('library_sections').insert([
        { library_id: lib.id, title: 'Cours',     position: 1 },
        { library_id: lib.id, title: 'Exercices', position: 2 },
        { library_id: lib.id, title: 'Vidéos',    position: 3 },
      ]);
    } catch (seedErr) {
      console.warn('[seed default sections] non-fatal:', seedErr?.message);
    }

    res.status(201).json(lib);
  } catch (e) {
    console.error('[createLibrary]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// GET /libraries/:libraryId/sections
exports.listSections = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { libraryId } = req.params;
    await assertOwnsLibrary(teacherId, libraryId);

    const { data, error } = await supabase
      .from('library_sections')
      .select('id, title, position, created_at')
      .eq('library_id', libraryId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;

    res.json(data || []);
  } catch (e) {
    console.error('[listSections]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// POST /libraries/:libraryId/sections { title }
exports.createSection = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { libraryId } = req.params;
    const rawTitle = trimOrNull(req.body?.title || req.body?.name);
    if (!rawTitle) return res.status(400).json({ error: 'Title required' });

    await assertOwnsLibrary(teacherId, libraryId);

    const { data: rows } = await supabase
      .from('library_sections')
      .select('position')
      .eq('library_id', libraryId)
      .order('position', { ascending: false })
      .limit(1);

    const nextPos = ((rows?.[0]?.position) || 0) + 1;

    const { data, error } = await supabase
      .from('library_sections')
      .insert([{ library_id: libraryId, title: rawTitle, position: nextPos }])
      .select('id, title, position, created_at')
      .single();
    if (error) {
      if (pgIsDuplicate(error)) return res.status(409).json({ error: 'Folder already exists' });
      throw error;
    }

    res.status(201).json(data);
  } catch (e) {
    console.error('[createSection]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// GET /sections/:sectionId/items
exports.listItems = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sectionId } = req.params;
    await assertOwnsSection(teacherId, sectionId);

    const { data, error } = await supabase
      .from('library_items')
      .select('id, name, url, kind, size_bytes, created_at')
      .eq('section_id', sectionId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    res.json(data || []);
  } catch (e) {
    console.error('[listItems]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// POST /sections/:sectionId/items { name, url, kind }
exports.createItem = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sectionId } = req.params;

    const name = trimOrNull(req.body?.name);
    const url  = trimOrNull(req.body?.url);
    const kind = trimOrNull(req.body?.kind) || 'link';
    if (!name || !url) return res.status(400).json({ error: 'name & url required' });

    await assertOwnsSection(teacherId, sectionId);

    const { data, error } = await supabase
      .from('library_items')
      .insert([{ section_id: sectionId, name, url, kind }])
      .select('id, name, url, kind, size_bytes, created_at')
      .single();
    if (error) throw error;

    res.status(201).json(data);
  } catch (e) {
    console.error('[createItem]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// POST /sections/:sectionId/items/upload  (multipart form-data, field: files[])
exports.createItemsUpload = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sectionId } = req.params;
    await assertOwnsSection(teacherId, sectionId);

    if (!req.files || !req.files.length) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { data: section } = await supabase
      .from('library_sections')
      .select('id, library_id')
      .eq('id', sectionId)
      .single();

    const { data: lib } = await supabase
      .from('course_libraries')
      .select('id, assignment_id')
      .eq('id', section.library_id)
      .single();

    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Storage uploads require SUPABASE_SERVICE_KEY (or open Storage policies for anon).'
      });
    }
    const store = supabaseAdmin.storage.from(STORAGE_BUCKET);

    const created = [];
    for (const f of req.files) {
      const safe = toStorageSafeName(f.originalname || 'file');
      const key = joinKey(lib.assignment_id, lib.id, section.id, `${Date.now()}-${safe}`);
      const kind = kindFromExt(safe);

      const up = await store.upload(key, f.buffer, {
        contentType: f.mimetype || 'application/octet-stream',
        upsert: false,
      });
      if (up.error) throw up.error;

      const pub = store.getPublicUrl(key);
      const url = pub?.data?.publicUrl;

      const { data: item, error: insErr } = await supabase
        .from('library_items')
        .insert([{ section_id: sectionId, name: safe, url, kind, size_bytes: f.size }])
        .select('id, name, url, kind, size_bytes, created_at')
        .single();
      if (insErr) throw insErr;

      created.push(item);
    }

    res.status(201).json(created);
  } catch (e) {
    console.error('[createItemsUpload]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message || 'Upload failed' });
  }
};

/* ================= NEW: update/delete library (course) ================= */

// PATCH /libraries/:libraryId { title?, status? }
exports.updateLibrary = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { libraryId } = req.params;
    await assertOwnsLibrary(teacherId, libraryId);

    const title  = trimOrNull(req.body?.title);
    const status = trimOrNull(req.body?.status);
    const values = {};
    if (title) values.title = title;
    if (status) values.status = status;

    if (!Object.keys(values).length) return res.status(400).json({ error: 'Nothing to update' });

    const { data, error } = await supabase
      .from('course_libraries')
      .update(values)
      .eq('id', libraryId)
      .select('id, title, status, created_at')
      .single();
    if (error) throw error;

    res.json(data);
  } catch (e) {
    console.error('[updateLibrary]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// DELETE /libraries/:libraryId
exports.deleteLibrary = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { libraryId } = req.params;
    await assertOwnsLibrary(teacherId, libraryId);

    // find all sections
    const { data: sections, error: sErr } = await supabase
      .from('library_sections')
      .select('id')
      .eq('library_id', libraryId);
    if (sErr) throw sErr;
    const secIds = (sections || []).map(s => s.id);

    // find all items
    let items = [];
    if (secIds.length) {
      const { data: it, error: iErr } = await supabase
        .from('library_items')
        .select('id, url')
        .in('section_id', secIds);
      if (iErr) throw iErr;
      items = it || [];
    }

    // delete storage objects (best-effort)
    if (items.length) {
      const keys = items.map(i => storageKeyFromPublicUrl(i.url)).filter(Boolean);
      if (keys.length && (supabaseAdmin || supabase)) {
        const store = (supabaseAdmin || supabase).storage.from(STORAGE_BUCKET);
        await store.remove(keys).catch(err => {
          console.warn('[deleteLibrary] storage remove non-fatal:', err?.message);
        });
      }
      await supabase.from('library_items').delete().in('id', items.map(i => i.id));
    }

    if (secIds.length) {
      await supabase.from('library_sections').delete().in('id', secIds);
    }

    const { error: delErr } = await supabase
      .from('course_libraries')
      .delete()
      .eq('id', libraryId);
    if (delErr) throw delErr;

    res.json({ ok: true });
  } catch (e) {
    console.error('[deleteLibrary]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

/* ================= NEW: update/delete item (resource) ================= */

// PATCH /sections/:sectionId/items/:itemId { name?, url?, kind? }
exports.updateItem = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sectionId, itemId } = req.params;
    await assertOwnsSection(teacherId, sectionId);

    const { data: item, error: gErr } = await supabase
      .from('library_items')
      .select('id, section_id, name, url, kind')
      .eq('id', itemId)
      .eq('section_id', sectionId)
      .single();
    if (gErr || !item) return res.status(404).json({ error: 'Item not found' });

    const payload = {};
    if (trimOrNull(req.body?.name)) payload.name = trimOrNull(req.body?.name);
    if (trimOrNull(req.body?.url))  payload.url  = trimOrNull(req.body?.url);
    if (trimOrNull(req.body?.kind)) payload.kind = trimOrNull(req.body?.kind);

    if (!Object.keys(payload).length) return res.status(400).json({ error: 'Nothing to update' });

    const { data: updated, error } = await supabase
      .from('library_items')
      .update(payload)
      .eq('id', itemId)
      .eq('section_id', sectionId)
      .select('id, name, url, kind, size_bytes, created_at')
      .single();
    if (error) throw error;

    res.json(updated);
  } catch (e) {
    console.error('[updateItem]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

// DELETE /sections/:sectionId/items/:itemId
exports.deleteItem = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sectionId, itemId } = req.params;
    await assertOwnsSection(teacherId, sectionId);

    const { data: item, error: gErr } = await supabase
      .from('library_items')
      .select('id, url')
      .eq('id', itemId)
      .eq('section_id', sectionId)
      .single();
    if (gErr || !item) return res.status(404).json({ error: 'Item not found' });

    // Try to delete storage object (best-effort)
    const key = storageKeyFromPublicUrl(item.url);
    if (key) {
      const store = (supabaseAdmin || supabase).storage.from(STORAGE_BUCKET);
      await store.remove([key]).catch(err => {
        console.warn('[deleteItem] storage remove non-fatal:', err?.message);
      });
    }

    const { error: delErr } = await supabase
      .from('library_items')
      .delete()
      .eq('id', itemId)
      .eq('section_id', sectionId);
    if (delErr) throw delErr;

    res.json({ ok: true });
  } catch (e) {
    console.error('[deleteItem]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

/* ================= NEW: delete section (folder) ================= */

// DELETE /sections/:sectionId  (delete folder + all resources inside)
exports.deleteSection = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sectionId } = req.params;
    await assertOwnsSection(teacherId, sectionId);

    // fetch items
    const { data: items, error: iErr } = await supabase
      .from('library_items')
      .select('id, url')
      .eq('section_id', sectionId);
    if (iErr) throw iErr;

    // delete storage for each item (best-effort)
    if (items?.length) {
      const keys = items.map(i => storageKeyFromPublicUrl(i.url)).filter(Boolean);
      if (keys.length) {
        const store = (supabaseAdmin || supabase).storage.from(STORAGE_BUCKET);
        await store.remove(keys).catch(err => {
          console.warn('[deleteSection] storage remove non-fatal:', err?.message);
        });
      }
      await supabase.from('library_items').delete().in('id', items.map(i => i.id));
    }

    // delete the section itself
    const { error: delErr } = await supabase
      .from('library_sections')
      .delete()
      .eq('id', sectionId);
    if (delErr) throw delErr;

    res.json({ ok: true });
  } catch (e) {
    console.error('[deleteSection]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

/* ================= NEW: move item to another section ================= */

// POST /sections/:sectionId/items/:itemId/move { target_section_id }
exports.moveItem = async (req, res) => {
  try {
    const teacherId = req.user.userId;
    const { sectionId, itemId } = req.params;
    const targetSectionId = trimOrNull(req.body?.target_section_id);

    if (!targetSectionId) return res.status(400).json({ error: 'target_section_id required' });

    // must own both sections
    const fromSec = await assertOwnsSection(teacherId, sectionId);
    const toSec   = await assertOwnsSection(teacherId, targetSectionId);

    // must be within the same library/course
    if (fromSec.library_id !== toSec.library_id) {
      return res.status(400).json({ error: 'Items can only be moved within the same course/library' });
    }

    // ensure item exists under from section
    const { data: item, error: gErr } = await supabase
      .from('library_items')
      .select('id, section_id, name, url, kind')
      .eq('id', itemId)
      .eq('section_id', sectionId)
      .single();
    if (gErr || !item) return res.status(404).json({ error: 'Item not found in source section' });

    // move
    const { data: updated, error: uErr } = await supabase
      .from('library_items')
      .update({ section_id: targetSectionId })
      .eq('id', itemId)
      .select('id, section_id, name, url, kind, size_bytes, created_at')
      .single();
    if (uErr) throw uErr;

    res.json(updated);
  } catch (e) {
    console.error('[moveItem]', e);
    const status = /Forbidden/.test(e.message) ? 403 : /not found/i.test(e.message) ? 404 : 500;
    res.status(status).json({ error: e.message });
  }
};

/* ===================== AI: generate from a resource ===================== */
// POST /sections/:sectionId/items/:itemId/ai  { mode: 'summary'|'concepts'|'quiz'|'exercises' }
exports.aiProcessItem = async (req, res) => {
  console.log('[AI] hit', req.params, req.body);
  try {
    if (!openai || !process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OPENAI_API_KEY missing or OpenAI SDK not installed.' });
    }
    const teacherId = req.user.userId;
    const { itemId } = req.params;
    const mode = String(req.body?.mode || '').toLowerCase();
    if (!['summary','concepts','quiz','exercises'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    // get item by ID only (section param may be stale)
    const { data: item, error } = await supabase
      .from('library_items')
      .select('id, section_id, name, url, kind')
      .eq('id', itemId)
      .single();
    console.log('[AI] item', { error, itemExists: !!item, itemId: req.params.itemId });

    if (error || !item) return res.status(404).json({ error: 'Item not found' });

    // authorize using the item's REAL section
    await assertOwnsSection(teacherId, item.section_id);

    // try to get text
    const text = await extractTextFromUrl(item.url, item.kind);

    // build messages (support non-text via image_url)
    let messages;
    if (text && text.length > 0) {
      const clipped = text.slice(0, 60000); // token safety
      messages = [
        { role: 'system', content: 'Tu es un assistant pédagogique pour enseignants. Réponds en français.' },
        { role: 'user', content: buildPrompt(mode, clipped) }
      ];
    } else {
      // non-textual: let the model look at the URL itself (image/video page)
      messages = [
        { role: 'system', content: 'Tu es un assistant pédagogique pour enseignants. Réponds en français.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildPrompt(mode, 'Le contenu est visuel, analyse l’URL fournie.') },
            { type: 'image_url', image_url: { url: item.url } }
          ]
        }
      ];
    }

    let out;
    try {
      if (mode === 'quiz') {
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.2,
          messages,
          response_format: { type: 'json_object' }
        });
        out = JSON.parse(resp.choices[0].message.content || '{"quiz":[]}');
      } else {
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.3,
          messages
        });
        out = { markdown: resp.choices[0].message.content || '' };
      }
    } catch (err) {
      const quota = (err?.status === 429) || (err?.code === 'insufficient_quota');
      if (quota && process.env.AI_MOCK === '1') {
        out = (mode === 'quiz')
          ? { quiz: [{ question: 'Exemple (mode démo)', options: ['A','B','C','D'], answerIndex: 0, rationale: 'Démo' }] }
          : { markdown: `> **Mode démo** — pas de crédit API.\n\nRésumé d’exemple basé sur la ressource.` };
      } else if (quota) {
        return res.status(429).json({ error: 'insufficient_quota', message: 'Your OpenAI account has no credits.' });
      } else {
        throw err;
      }
    }

    res.json({
      ok: true,
      item: { id: item.id, name: item.name, kind: item.kind, url: item.url },
      mode,
      result: out
    });
  } catch (e) {
    console.error('[aiProcessItem]', e);
    res.status(500).json({ error: e.message || 'AI failed' });
  }
};

/* ===================== AI: save generated result as new resource ===================== */
// POST /sections/:sectionId/items/:itemId/ai/save
// body: { mode, target_section_id, filename?, content }  // content: markdown string OR quiz JSON
exports.aiSaveResult = async (req, res) => {
  console.log('[AI] hit', req.params, req.body);
  try {
    const teacherId = req.user.userId;
    const { itemId } = req.params;
    const mode = String(req.body?.mode || '').toLowerCase();
    const targetSectionId = String(req.body?.target_section_id);
    const filename = String(req.body?.filename || '').trim();
    const content = req.body?.content;

    if (!['summary','concepts','quiz','exercises'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode' });
    }
    if (!targetSectionId) {
      return res.status(400).json({ error: 'target_section_id required' });
    }

    // verify item exists and you own its real section
    const { data: item, error } = await supabase
      .from('library_items')
      .select('id, section_id')
      .eq('id', itemId)
      .single();
    if (error || !item) return res.status(404).json({ error: 'Item not found' });
    await assertOwnsSection(teacherId, item.section_id);

    // must also own target section
    const toSec = await assertOwnsSection(teacherId, targetSectionId);

    // infer library & assignment for key structure
    const { data: lib } = await supabase
      .from('library_sections')
      .select('id, library_id')
      .eq('id', targetSectionId).single();
    const { data: libRow } = await supabase
      .from('course_libraries')
      .select('id, assignment_id')
      .eq('id', lib.library_id).single();

    // choose default filename & payload
    let fname = filename;
    let bodyBuf, contentType;
    if (mode === 'quiz') {
      const jsonStr = typeof content === 'string' ? content : JSON.stringify(content || {}, null, 2);
      fname = fname || 'Quiz.json';
      bodyBuf = Buffer.from(jsonStr, 'utf-8');
      contentType = 'application/json';
    } else {
      const md = typeof content === 'string' ? content : (content?.markdown || '');
      fname = fname || (mode === 'summary' ? 'Résumé.md' : mode === 'concepts' ? 'Concepts.md' : 'Exercices.md');
      bodyBuf = Buffer.from(md, 'utf-8');
      contentType = 'text/markdown; charset=utf-8';
    }

    if (!supabaseAdmin) {
      return res.status(500).json({ error: 'Saving requires SUPABASE_SERVICE_KEY (Storage write).' });
    }
    const store = supabaseAdmin.storage.from(STORAGE_BUCKET);

    const safe = toStorageSafeName(fname);
    const key = joinKey(libRow.assignment_id, libRow.id, toSec.id, 'ai', `${Date.now()}-${safe}`);

    const up = await store.upload(key, bodyBuf, { contentType, upsert: false });
    if (up.error) throw up.error;
    const pub = store.getPublicUrl(key);
    const url = pub?.data?.publicUrl;

    // IMPORTANT: use kind = 'other' to satisfy your DB check constraint
    const { data: created, error: insErr } = await supabase
      .from('library_items')
      .insert([{ section_id: targetSectionId, name: safe, url, kind: 'other' }])
      .select('id, name, url, kind, created_at').single();
    if (insErr) throw insErr;

    res.status(201).json({ ok: true, item: created });
  } catch (e) {
    console.error('[aiSaveResult]', e);
    res.status(500).json({ error: e.message || 'AI save failed' });
  }
};

/* ===================== Student-facing library endpoints ===================== */

// GET /api/teacher/student/courses (mounted under /api/teacher by routes/library.js as /student/courses)
exports.listStudentCourses = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: student, error: studentErr } = await supabase
      .from('users')
      .select('id, class_id')
      .eq('id', userId)
      .single();

    if (studentErr) {
      console.error('[studentLibrary] student lookup', studentErr);
      return res.status(500).json({ error: 'Unable to resolve student profile' });
    }

    const classId = student?.class_id || null;
    if (!classId) {
      return res.json({ class: null, assignments: [] });
    }

    const [{ data: classRow }, { data: assignments, error: assignErr }] = await Promise.all([
      supabase.from('classes').select('id, name').eq('id', classId).single(),
      supabase
        .from('teacher_assignments')
        .select(`
          id,
          teacher:users!teacher_assignments_teacher_id_fkey ( id, first_name, last_name, email ),
          subject:subjects!teacher_assignments_subject_id_fkey ( id, name ),
          class:classes!teacher_assignments_class_id_fkey ( id, name )
        `)
        .eq('class_id', classId)
        .order('id', { ascending: true })
    ]);

    if (assignErr) {
      console.error('[studentLibrary] assignments lookup', assignErr);
      return res.status(500).json({ error: 'Unable to load teacher assignments' });
    }

    const assignmentRows = Array.isArray(assignments) ? assignments : [];
    const assignmentIds = assignmentRows.map((row) => row.id).filter(Boolean);

    let libraries = [];
    if (assignmentIds.length) {
      const { data: libsData, error: libsErr } = await supabase
        .from('course_libraries')
        .select('id, assignment_id, title, status, created_at, updated_at')
        .in('assignment_id', assignmentIds)
        .order('created_at', { ascending: false });

      if (libsErr) {
        console.error('[studentLibrary] libraries lookup', libsErr);
        return res.status(500).json({ error: 'Unable to load courses' });
      }
      libraries = Array.isArray(libsData) ? libsData : [];
    }

    let summaryByCourse = new Map();
    try {
      const { summaryByCourse: summary } = await loadExerciseData(
        libraries.map((lib) => lib.id),
        userId
      );
      summaryByCourse = summary;
    } catch (exerciseErr) {
      console.error('[studentLibrary] exercise summary', exerciseErr);
      summaryByCourse = new Map();
    }

    const libsByAssignment = new Map();
    libraries.forEach((lib) => {
      if (!lib || !lib.assignment_id) return;
      const bucket = libsByAssignment.get(lib.assignment_id) || [];
      const summary = formatExerciseSummary(summaryByCourse.get(lib.id) || {});
      bucket.push({
        id: lib.id,
        assignment_id: lib.assignment_id,
        title: lib.title,
        status: lib.status,
        created_at: lib.created_at,
        updated_at: lib.updated_at,
        exercise_summary: summary,
      });
      libsByAssignment.set(lib.assignment_id, bucket);
    });

    const payload = assignmentRows.map((row) => ({
      assignment_id: row.id,
      teacher: simplifyTeacher(row.teacher),
      subject: simplifySubject(row.subject),
      class: simplifyClass(row.class),
      courses: libsByAssignment.get(row.id) || [],
    }));

    return res.json({
      class: simplifyClass(classRow || assignmentRows?.[0]?.class || null),
      assignments: payload,
    });
  } catch (err) {
    console.error('[studentLibrary] list courses error', err);
    return res.status(500).json({ error: 'Unable to load courses' });
  }
};

// GET /student/libraries/:libraryId — sections + items for students (read-only)
exports.getStudentLibrary = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { libraryId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!libraryId) {
      return res.status(400).json({ error: 'libraryId required' });
    }

    const { data: student, error: studentErr } = await supabase
      .from('users')
      .select('id, class_id')
      .eq('id', userId)
      .single();

    if (studentErr) {
      console.error('[studentLibrary] student lookup', studentErr);
      return res.status(500).json({ error: 'Unable to resolve student profile' });
    }

    if (!student?.class_id) {
      return res.status(403).json({ error: 'Student has no class assigned' });
    }

    const { data: library, error: libErr } = await supabase
      .from('course_libraries')
      .select('id, assignment_id, title, status, created_at, updated_at')
      .eq('id', libraryId)
      .single();

    if (libErr || !library) {
      return res.status(404).json({ error: 'Library not found' });
    }

    const { data: assignment, error: assignmentErr } = await supabase
      .from('teacher_assignments')
      .select(`
        id,
        class_id,
        teacher:users!teacher_assignments_teacher_id_fkey ( id, first_name, last_name, email ),
        subject:subjects!teacher_assignments_subject_id_fkey ( id, name )
      `)
      .eq('id', library.assignment_id)
      .single();

    if (assignmentErr || !assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    if (assignment.class_id !== student.class_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: sectionsData, error: sectionsErr } = await supabase
      .from('library_sections')
      .select(`
        id,
        title,
        position,
        created_at,
        items:library_items ( id, name, kind, url, size_bytes, position, created_at )
      `)
      .eq('library_id', libraryId)
      .order('position', { ascending: true });

    if (sectionsErr) {
      console.error('[studentLibrary] sections lookup', sectionsErr);
      return res.status(500).json({ error: 'Unable to load course content' });
    }

    const sections = Array.isArray(sectionsData)
      ? sectionsData.map((section) => ({
          id: section.id,
          title: section.title,
          position: section.position,
          created_at: section.created_at,
          items: Array.isArray(section.items)
            ? section.items
                .slice()
                .sort((a, b) => (a?.position || 0) - (b?.position || 0))
                .map((item) => ({
                  id: item.id,
                  name: item.name,
                  kind: item.kind,
                  url: item.url,
                  size_bytes: item.size_bytes,
                  position: item.position,
                  created_at: item.created_at,
                }))
            : [],
        }))
      : [];

    return res.json({
      library: {
        id: library.id,
        assignment_id: library.assignment_id,
        title: library.title,
        status: library.status,
        created_at: library.created_at,
        updated_at: library.updated_at,
        teacher: simplifyTeacher(assignment.teacher),
        subject: simplifySubject(assignment.subject),
        sections,
      },
    });
  } catch (err) {
    console.error('[studentLibrary] get library error', err);
    return res.status(500).json({ error: 'Unable to load library' });
  }
};

exports.listStudentExercises = async (req, res) => {
  const userId = req.user?.id;
  const { courseId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!courseId) {
    return res.status(400).json({ error: 'courseId required' });
  }

  try {
    let context;
    try {
      context = await fetchStudentCourseContext(userId, courseId);
    } catch (err) {
      if (err.code === 'STUDENT_LOOKUP') {
        console.error('[studentExercises] student lookup', err);
        return res.status(500).json({ error: 'Unable to resolve student profile' });
      }
      if (err.code === 'NO_CLASS') {
        return res.status(403).json({ error: 'Student has no class assigned' });
      }
      if (err.code === 'COURSE_NOT_FOUND') {
        return res.status(404).json({ error: 'Course not found' });
      }
      if (err.code === 'FORBIDDEN') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      throw err;
    }

    const { course } = context;

    const { itemsByCourse, summaryByCourse, submissionsByItem } = await loadExerciseData([
      courseId,
    ], userId);

    const exerciseEntries = itemsByCourse.get(courseId) || [];
    const summary = formatExerciseSummary(
      summaryByCourse.get(courseId) || { total: exerciseEntries.length, submitted: 0 }
    );

    exerciseEntries.sort((a, b) => {
      const dateA = new Date(a.item.updated_at || a.item.created_at || 0).getTime();
      const dateB = new Date(b.item.updated_at || b.item.created_at || 0).getTime();
      return dateB - dateA;
    });

    const exercises = exerciseEntries.map(({ item, section }) => ({
      id: item.id,
      name: item.name,
      kind: item.kind,
      url: item.url,
      size_bytes: item.size_bytes,
      created_at: item.created_at,
      updated_at: item.updated_at,
      section: section
        ? {
            id: section.id,
            title: section.title,
          }
        : null,
      submission: presentSubmission(submissionsByItem.get(item.id)),
    }));

    return res.json({
      course: {
        id: course.id,
        assignment_id: course.assignment_id,
        title: course.title,
        status: course.status,
        created_at: course.created_at,
        updated_at: course.updated_at,
        teacher: simplifyTeacher(course.assignment?.teacher),
        subject: simplifySubject(course.assignment?.subject),
        class: simplifyClass(course.assignment?.class),
      },
      summary,
      exercises,
    });
  } catch (err) {
    console.error('[studentExercises] list error', err);
    return res.status(500).json({ error: 'Unable to load exercises' });
  }
};

exports.submitStudentExercise = async (req, res) => {
  const userId = req.user?.id;
  const { courseId, itemId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!courseId || !itemId) {
    return res.status(400).json({ error: 'courseId and itemId required' });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Aucun fichier reçu' });
  }

  try {
    let context;
    try {
      context = await fetchStudentCourseContext(userId, courseId);
    } catch (err) {
      if (err.code === 'STUDENT_LOOKUP') {
        console.error('[studentExercises] student lookup', err);
        return res.status(500).json({ error: 'Unable to resolve student profile' });
      }
      if (err.code === 'NO_CLASS') {
        return res.status(403).json({ error: 'Student has no class assigned' });
      }
      if (err.code === 'COURSE_NOT_FOUND') {
        return res.status(404).json({ error: 'Course not found' });
      }
      if (err.code === 'FORBIDDEN') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      throw err;
    }

    const { data: itemRows, error: itemErr } = await supabase
      .from('library_items')
      .select(
        `id, name, kind, section_id, section:library_sections!library_items_section_id_fkey ( id, title, library_id )`
      )
      .eq('id', itemId)
      .limit(1);

    if (itemErr) {
      console.error('[studentExercises] item lookup', itemErr);
      return res.status(500).json({ error: 'Unable to load exercise resource' });
    }

    const item = Array.isArray(itemRows) && itemRows.length ? itemRows[0] : null;
    if (!item || !item.section) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    if (item.section.library_id !== courseId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (!isExerciseResource(item.section, item)) {
      return res.status(400).json({ error: 'Cette ressource ne correspond pas à un exercice' });
    }

    const safeName = toStorageSafeName(file.originalname || 'devoir');
    const key = joinKey('student', userId, 'course', courseId, `${Date.now()}-${safeName}`);
    const storageClient = (supabaseAdmin || supabase).storage.from(SUBMISSION_BUCKET);

    const { error: uploadErr } = await storageClient.upload(key, file.buffer, {
      cacheControl: '3600',
      contentType: file.mimetype || 'application/octet-stream',
      upsert: false,
    });

    if (uploadErr) {
      console.error('[studentExercises] upload error', uploadErr);
      return res.status(500).json({ error: 'Échec de l\'envoi du fichier' });
    }

    const { data: publicData } = storageClient.getPublicUrl(key);
    const publicUrl = publicData?.publicUrl || null;

    const { data: existingRows, error: existingErr } = await supabase
      .from('student_exercise_submissions')
      .select('id, storage_key')
      .eq('student_id', userId)
      .eq('course_id', courseId)
      .eq('item_id', itemId)
      .limit(1);

    if (existingErr && existingErr.code && existingErr.code !== 'PGRST116') {
      console.error('[studentExercises] existing lookup', existingErr);
      await removeStorageObject(SUBMISSION_BUCKET, key);
      return res.status(500).json({ error: 'Unable to verify existing submission' });
    }

    const existing = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;

    const nowIso = new Date().toISOString();
    const payload = {
      student_id: userId,
      course_id: courseId,
      item_id: itemId,
      file_url: publicUrl,
      file_name: file.originalname || safeName,
      file_size: file.size ?? null,
      mime_type: file.mimetype || null,
      storage_key: key,
      submitted_at: nowIso,
      updated_at: nowIso,
    };

    const { data: upsertRow, error: upsertErr } = await supabase
      .from('student_exercise_submissions')
      .upsert(payload, { onConflict: 'student_id,item_id' })
      .select('id, course_id, item_id, file_url, file_name, file_size, mime_type, storage_key, submitted_at, updated_at')
      .single();

    if (upsertErr) {
      console.error('[studentExercises] upsert error', upsertErr);
      await removeStorageObject(SUBMISSION_BUCKET, key);
      return res.status(500).json({ error: 'Unable to enregistrer la remise' });
    }

    if (existing?.storage_key && existing.storage_key !== key) {
      await removeStorageObject(SUBMISSION_BUCKET, existing.storage_key);
    }

    let summary = formatExerciseSummary({});
    try {
      const { summaryByCourse } = await loadExerciseData([courseId], userId);
      summary = formatExerciseSummary(summaryByCourse.get(courseId) || {});
    } catch (err) {
      console.warn('[studentExercises] summary refresh failed', err?.message || err);
    }

    const submission = presentSubmission(upsertRow);

    return res.status(existing ? 200 : 201).json({
      submission,
      summary,
    });
  } catch (err) {
    console.error('[studentExercises] submit error', err);
    return res.status(500).json({ error: 'Unable to enregistrer la remise' });
  }
};
