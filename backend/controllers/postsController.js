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

function looksLikeFetchFailure(err) {
  const msg = err?.message || err?.error || "";
  return typeof msg === "string" && msg.toLowerCase().includes("fetch failed");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0));

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
    let post = null;
    let postError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await supabase
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

      post = result.data;
      postError = result.error;

      if (!postError || !looksLikeFetchFailure(postError)) {
        break;
      }

      console.warn(
        `[addPost] insert retry ${attempt} due to fetch failure`
      );
      await sleep(150 * attempt);
    }

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

/** List published posts visible to the authenticated user */
exports.listPosts = async (req, res) => {
  try {
    const userId = req.user?.id;
    const schoolId = req.user?.school_id;
    if (!userId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id, class_id, first_name, last_name, email")
      .eq("id", userId)
      .single();

    if (userError && userError.code !== "PGRST116") {
      console.error("[listPosts] user lookup error", userError);
      return res.status(500).json({ error: "Cannot resolve user context" });
    }

    const classId = userRow?.class_id ?? null;

    const selectColumns = `
      id,
      title,
      body_html,
      audience,
      class_id,
      status,
      created_at,
      updated_at,
      author:users!posts_user_id_fkey(id, first_name, last_name, email),
      post_attachments(id, url, filename, media_type, size_bytes, created_at)
    `;

    let query = supabase
      .from("posts")
      .select(selectColumns)
      .eq("school_id", schoolId)
      .eq("status", "published")
      .order("created_at", { ascending: false });

    if (classId) {
      const classFilter = [
        "audience.eq.school",
        "audience.eq.all_classes",
        `and(audience.eq.class,class_id.eq.${classId})`,
      ].join(",");
      query = query.or(classFilter);
    } else {
      query = query.in("audience", ["school", "all_classes"]);
    }

    const { data: postsData, error: postsError } = await query;

    if (postsError) {
      console.error("[listPosts] fetch posts error", postsError);
      return res
        .status(500)
        .json({ error: postsError.message || "Query failed" });
    }

    const response = (postsData || []).map((post) => {
      const author = post.author || null;
      const parts = [];
      if (author?.first_name) parts.push(author.first_name);
      if (author?.last_name) parts.push(author.last_name);
      const displayName = (parts.join(" ") || author?.email || "Utilisateur").trim();

      return {
        id: post.id,
        title: post.title,
        body_html: post.body_html,
        audience: post.audience,
        class_id: post.class_id,
        created_at: post.created_at,
        published_at: post.updated_at || null,
        author: author
          ? {
              id: author.id,
              name: displayName,
              avatar_url: null,
            }
          : null,
        attachments: Array.isArray(post.post_attachments)
          ? post.post_attachments
          : [],
      };
    });

    return res.json(response);
  } catch (err) {
    console.error("[listPosts] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};
