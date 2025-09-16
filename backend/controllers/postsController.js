// controllers/postsController.js
const supabase = require("../config/db");


/** Map friendly labels or raw values to the DB enum */
function normalizeAudience(value) {
  if (!value) return "school";
  const v = String(value).toLowerCase().trim();
  if (v === "all_classes" || v.includes("toute")) return "all_classes";
  if (v === "class" || v.includes("ma classe")) return "class";
  return "school";
}

function detectMediaType(file) {
  const type = file.mimetype || "";
  const name = file.originalname || "";

  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf" || name.toLowerCase().endsWith(".pdf"))
    return "pdf";
  return "other";
}

/** Keep file names safe and short for storage paths */
function sanitizeFilename(name) {
  return String(name || "file")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150);
}

/** Create Post + (optional) PDF attachments */
exports.addPost = async (req, res) => {
  try {
    const userId = req.user?.id;
    const schoolId = req.user?.school_id;
    if (!userId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title, body_html, audience } = req.body || {};
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    const audienceEnum = normalizeAudience(audience);

    // Resolve class_id if needed
    let classId = null;
    if (audienceEnum === "class") {
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("class_id")
        .eq("id", userId)
        .single();

      if (userError) {
        console.error("[addPost] class lookup error", userError);
        return res.status(500).json({ error: "Cannot resolve class" });
      }
      classId = userRow?.class_id || null;
      if (!classId) {
        return res.status(400).json({ error: "User has no class assigned" });
      }
    }

    // 1) Insert the post
    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert({
        school_id: schoolId,
        user_id: userId,
        title,
        body_html: body_html || null,
        audience: audienceEnum,
        class_id: classId,
        status: "published",
      })
      .select("*")
      .single();

    if (postError) {
      console.error("[addPost] insert post error", postError);
      return res.status(400).json({ error: postError.message || "Insert failed" });
    }

    // 2) Handle attachments
    const files = Array.isArray(req.files) ? req.files : [];
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "posts_media";
    const attachments = [];

    for (const f of files) {
      try {

        const clean = sanitizeFilename(f.originalname || "file");
        const key = `school/${schoolId}/user/${userId}/post/${post.id}/${Date.now()}-${clean}`;

        const { error: upErr } = await supabase.storage
          .from(bucket)
          .upload(key, f.buffer, {
            contentType: f.mimetype || "application/octet-stream",
            upsert: false,
          });

        if (upErr) {
          console.error("[addPost] storage upload error", upErr);
          continue;
        }

        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
        const publicUrl = pub?.publicUrl;


        const { data: att, error: attErr } = await supabase
          .from("post_attachments")
          .insert({
            post_id: post.id,
            url: publicUrl,
            filename: f.originalname || clean,
            size_bytes: f.size ?? null,
            media_type: detectMediaType(f),
          })
          .select("*")
          .single();

        if (attErr) {
          console.error("[addPost] insert attachment error", attErr);
          continue;
        }
        attachments.push(att);
      } catch (e) {
        console.error("[addPost] file loop error", e);
      }
    }

    return res.status(201).json({ ...post, attachments });
  } catch (err) {
    console.error("[addPost] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};

