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

    // Resolve class_id from users when targeting 'class' audience
    let classId = null;
    if (audienceEnum === "class") {
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("class_id")
        .eq("id", userId)
        .single();

      if (userError) {
        console.error(
          "[postsController.addPost] class lookup error",
          userError
        );
        return res
          .status(500)
          .json({ error: userError.message || "Cannot resolve class" });
      }
      classId = userRow?.class_id || null;
      if (!classId) {
        return res.status(400).json({ error: "User has no class assigned" });
      }
    }

    // 1) Insert the post first
    const insertPayload = {
      school_id: schoolId,
      user_id: userId,
      title,
      body_html: body_html || null,
      audience: audienceEnum,
      class_id: classId,
      status: "published",
    };

    const { data: post, error: postError } = await supabase
      .from("posts")
      .insert(insertPayload)
      .select("*")
      .single();

    if (postError) {
      console.error("[postsController.addPost] insert post error", postError);
      return res
        .status(400)
        .json({ error: postError.message || "Insert failed" });
    }

    // Success: attachments removed in rollback
    return res.status(201).json(post);

  } catch (err) {
    console.error("[postsController.addPost] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};
