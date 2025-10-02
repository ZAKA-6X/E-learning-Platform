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
    const sec = await assertOwnsSection(teacherId, sectionId);

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
