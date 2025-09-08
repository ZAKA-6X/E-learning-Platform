// controllers/postsController.js
// Uses Supabase client exported from ../config/db
// Your ../config/db should export either `module.exports = supabase`
// or `module.exports = { supabase }`

const supa = require("../config/db");
const supabase = supa.supabase || supa; // supports either export style

exports.addPost = async (req, res) => {
  try {
    const userSchoolId = req.user?.school_id || null;

    const {
      type = null,
      title = null,
      body: content = null,
      media = null,

      audience_school,
      audience_class,
      audience_subject,

      class_id,
      subject_id,
      school_id: schoolIdFromBody
    } = req.body || {};

    const flag = (v) =>
      v === true || v === "true" || v === "on" || v === 1 || v === "1";

    const wantsSchool = flag(audience_school);
    const wantsClass = flag(audience_class);
    const wantsSubject = flag(audience_subject);

    const selectedCount = [wantsSchool, wantsClass, wantsSubject].filter(Boolean).length;
    if (selectedCount > 1) {
      return res.status(400).json({
        error: "Select only one audience: school OR class OR subject."
      });
    }

    const school_id = userSchoolId || schoolIdFromBody || null;
    if (!school_id) {
      return res.status(400).json({ error: "Missing school_id (token or body)." });
    }

    let audience_scope = null;
    if (wantsSchool) {
      audience_scope = school_id;
    } else if (wantsClass) {
      if (!class_id) {
        return res.status(400).json({ error: "class_id is required when class audience is selected." });
      }
      audience_scope = class_id;
    } else if (wantsSubject) {
      if (!subject_id) {
        return res.status(400).json({ error: "subject_id is required when subject audience is selected." });
      }
      audience_scope = subject_id;
    } else {
      // No selection => treat as school-wide (use null if you prefer)
      audience_scope = school_id;
    }

    const { data, error } = await supabase
      .from("posts")
      .insert([
        {
          school_id,
          type,
          title,
          body: content,
          media,
          audience_scope
        }
      ])
      .select("*")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: error.message || "Insert failed" });
    }

    return res.status(201).json({ post: data });
  } catch (err) {
    console.error("Error inserting post:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
