// controllers/postsController.js
const supabase = require("../config/db");

/** Map friendly labels or raw values to the DB enum (SCHOOL | CLASS | SUBJECT) */
function normalizeAudience(value) {
  if (!value) return "SCHOOL";
  const v = String(value).toLowerCase().trim();

  // French-friendly mappings
  if (v === "class" || v.includes("ma classe")) return "CLASS";
  if (v === "subject" || v.includes("matiere") || v.includes("matière"))
    return "SUBJECT";

  // default
  return "SCHOOL";
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

async function runWithRetry(requestFactory, attempts = 3, label = "supabase") {
  let lastResult = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await requestFactory();
      const err = result?.error;
      if (!err || !looksLikeFetchFailure(err)) {
        return result;
      }
      lastResult = result;
      console.warn(`[${label}] retry ${attempt} due to fetch failure`);
    } catch (err) {
      if (!looksLikeFetchFailure(err)) throw err;
      lastResult = { error: err };
      console.warn(`[${label}] retry ${attempt} due to fetch failure`);
    }
    if (attempt < attempts) await sleep(150 * attempt);
  }
  return lastResult || { error: new Error("Fetch failed") };
}

function formatUserIdentity(user) {
  if (!user) return null;
  const parts = [];
  if (user.first_name) parts.push(user.first_name);
  if (user.last_name) parts.push(user.last_name);
  const name = (parts.join(" ") || user.email || "Utilisateur").trim();
  return {
    id: user.id,
    name,
    avatar_url: user.avatar_url ?? null,
    role: user.role || null,
  };
}

function normalizeVoteValue(raw) {
  if (raw === undefined || raw === null || raw === "") return 0;
  if (raw === "up") return 1;
  if (raw === "down") return -1;
  const num = Number(raw);
  if (num === 1 || num === -1 || num === 0) return num;
  return null;
}

async function recalcScore(table, keyColumn, keyValue) {
  const result = await runWithRetry(
    () => supabase.from(table).select("value").eq(keyColumn, keyValue),
    3,
    `recalcScore.${table}`
  );

  const data = result.data;
  const error = result.error;

  if (error && error.code !== "PGRST116") {
    return { error };
  }

  const rows = Array.isArray(data) ? data : [];
  const score = rows.reduce((acc, row) => acc + Number(row?.value || 0), 0);
  return { data: score };
}

/** Create Post + (optional) PDF attachments */
exports.addPost = async (req, res) => {
  try {
    const userId = req.user?.id;
    const schoolId = req.user?.school_id;
    if (!userId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { title, body_html } = req.body || {};
    const audienceEnum = normalizeAudience(req.body?.audience); // SCHOOL | CLASS | SUBJECT

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    // Matrix:
    // - SCHOOL  -> class_id=null, subject_id=null
    // - CLASS   -> class_id=user.class_id, subject_id=null
    // - SUBJECT -> subject_id=req.body.subject_id (validated), class_id=null
    let classId = null;
    let subjectId = null;

    if (audienceEnum === "CLASS") {
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
      subjectId = null;
    } else if (audienceEnum === "SUBJECT") {
      const rawSubjectId = (req.body?.subject_id || "").trim();
      if (!rawSubjectId) {
        return res
          .status(400)
          .json({ error: "subject_id is required for SUBJECT audience" });
      }

      // Validate subject belongs to the same school
      const { data: subj, error: subjErr } = await supabase
        .from("subjects")
        .select("id, school_id")
        .eq("id", rawSubjectId)
        .single();

      if (subjErr || !subj || subj.school_id !== schoolId) {
        console.error("[addPost] invalid subject for school", subjErr);
        return res
          .status(400)
          .json({ error: "Invalid subject for this school" });
      }

      subjectId = rawSubjectId;
      classId = null;
    } else {
      // SCHOOL
      classId = null;
      subjectId = null;
    }

    // 1) Insert the post
    const insertResult = await runWithRetry(
      () =>
        supabase
          .from("posts")
          .insert({
            school_id: schoolId,
            user_id: userId,
            title,
            body_html: body_html || null,
            audience: audienceEnum, // SCHOOL | CLASS | SUBJECT
            class_id: classId, // only for CLASS
            subject_id: subjectId, // only for SUBJECT
          })
          .select("*")
          .single(),
      3,
      "addPost.insert"
    );

    const post = insertResult.data;
    const postError = insertResult.error;

    if (postError) {
      console.error("[addPost] insert post error", postError);
      return res
        .status(400)
        .json({ error: postError.message || "Insert failed" });
    }

    // 2) Handle attachments
    const files = Array.isArray(req.files) ? req.files : [];
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || "posts_media";
    const attachments = [];

    for (const f of files) {
      try {
        const clean = sanitizeFilename(f.originalname || "file");
        const key = `school/${schoolId}/user/${userId}/post/${
          post.id
        }/${Date.now()}-${clean}`;

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

    const selectColumns = `
      id,
      title,
      body_html,
      audience,
      class_id,
      subject_id,
      created_at,
      updated_at,
      author:users!posts_user_id_fkey(id, first_name, last_name, email, role),
      school:schools!posts_school_id_fkey(id, name),
      class:classes!posts_class_id_fkey(id, name),
      subject:subjects!posts_subject_id_fkey(id, name),
      post_attachments(id, url, filename, media_type, size_bytes, created_at)
    `;

    const buildPostsQuery = () =>
      supabase
        .from("posts")
        .select(selectColumns)
        .eq("school_id", schoolId)
        .order("created_at", { ascending: false });

    const postsResult = await runWithRetry(
      () => buildPostsQuery(),
      3,
      "listPosts.posts"
    );

    const postsData = postsResult.data;
    const postsError = postsResult.error;

    if (postsError) {
      console.error("[listPosts] fetch posts error", postsError);
      return res
        .status(500)
        .json({ error: postsError.message || "Query failed" });
    }

    const postIds = (postsData || []).map((p) => p.id).filter(Boolean);

    const scoreByPost = {};
    const userVoteByPost = {};
    const commentCountByPost = {};

    if (postIds.length) {
      const votesResult = await runWithRetry(
        () =>
          supabase
            .from("post_votes")
            .select("post_id, value")
            .in("post_id", postIds),
        3,
        "listPosts.votes"
      );

      const votesRows = votesResult.data;
      const votesError = votesResult.error;

      if (!votesError && Array.isArray(votesRows)) {
        votesRows.forEach((row) => {
          const key = row?.post_id;
          if (!key) return;
          scoreByPost[key] = (scoreByPost[key] || 0) + Number(row.value || 0);
        });
      }

      const userVotesResult = await runWithRetry(
        () =>
          supabase
            .from("post_votes")
            .select("post_id, value")
            .eq("user_id", userId)
            .in("post_id", postIds),
        3,
        "listPosts.userVotes"
      );

      const userVotesRows = userVotesResult.data;

      if (Array.isArray(userVotesRows)) {
        userVotesRows.forEach((row) => {
          if (row?.post_id)
            userVoteByPost[row.post_id] = Number(row.value || 0);
        });
      }

      const commentCountsResult = await runWithRetry(
        () =>
          supabase
            .from("post_comments")
            .select("post_id")
            .in("post_id", postIds),
        3,
        "listPosts.commentCounts"
      );

      const commentCountsRows = commentCountsResult.data;

      if (Array.isArray(commentCountsRows)) {
        commentCountsRows.forEach((row) => {
          const key = row?.post_id;
          if (!key) return;
          commentCountByPost[key] = (commentCountByPost[key] || 0) + 1;
        });
      }
    }

    const response = (postsData || []).map((post) => {
      const author = post.author || null;
      const school = post.school || null;
      const cls = post.class || null;
      const subj = post.subject || null;

      return {
        id: post.id,
        title: post.title,
        body_html: post.body_html,
        audience: post.audience,
        class_id: post.class_id,
        subject_id: post.subject_id,
        created_at: post.created_at,
        published_at: post.updated_at || null,
        author: formatUserIdentity(author),

        // added for display
        school: school ? { id: school.id, name: school.name } : null,
        class:  cls ? { id: cls.id, name: cls.name } : null,
        subject: subj ? { id: subj.id, name: subj.name } : null,

        // ✅ NEW FIELD
        audience_label:
          post.audience === "SCHOOL"
            ? (school?.name || "Mon école")
            : post.audience === "CLASS"
            ? (cls?.name || "Ma classe")
            : post.audience === "SUBJECT"
            ? (subj?.name || "Matière")
            : "",

        attachments: Array.isArray(post.post_attachments)
          ? post.post_attachments
          : [],
        score: scoreByPost[post.id] || 0,
        user_vote: userVoteByPost[post.id] || 0,
        comment_count: commentCountByPost[post.id] || 0,
      };
    });



    return res.json(response);
  } catch (err) {
    console.error("[listPosts] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};

exports.addComment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const postId = Number(req.params.postId);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const textRaw = req.body?.body ?? req.body?.text ?? "";
    const text = String(textRaw).trim();
    if (!text)
      return res.status(400).json({ error: "Comment text is required" });

    let parentId = req.body?.parent_id ?? null;
    if (parentId !== null && parentId !== undefined && parentId !== "") {
      parentId = Number(parentId);
      if (!Number.isInteger(parentId) || parentId <= 0) {
        return res.status(400).json({ error: "Invalid parent comment" });
      }
      const parentResult = await runWithRetry(
        () =>
          supabase
            .from("post_comments")
            .select("id, post_id")
            .eq("id", parentId)
            .single(),
        3,
        "addComment.parent"
      );

      const parent = parentResult.data;
      const parentError = parentResult.error;

      if (parentError || !parent) {
        return res.status(400).json({ error: "Parent comment not found" });
      }
      if (parent.post_id !== postId) {
        return res.status(400).json({ error: "Parent comment mismatch" });
      }
    } else {
      parentId = null;
    }

    const insertResult = await runWithRetry(
      () =>
        supabase
          .from("post_comments")
          .insert({
            post_id: postId,
            user_id: userId,
            body: text,
            parent_id: parentId,
          })
          .select(
            "id, post_id, body, parent_id, created_at, user:user_id (id, first_name, last_name, email, role)"
          )
          .single(),
      3,
      "addComment.insert"
    );

    const data = insertResult.data;
    const error = insertResult.error;

    if (error) {
      console.error("[addComment] insert error", error);
      return res.status(400).json({ error: error.message || "Insert failed" });
    }

    return res.status(201).json({
      id: data.id,
      body: data.body,
      parent_id: data.parent_id,
      created_at: data.created_at,
      author: formatUserIdentity(data.user),
      score: 0,
      user_vote: 0,
    });
  } catch (err) {
    console.error("[addComment] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};

exports.listComments = async (req, res) => {
  try {
    const userId = req.user?.id;
    const postId = Number(req.params.postId);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const commentsResult = await runWithRetry(
      () =>
        supabase
          .from("post_comments")
          .select(
            "id, post_id, body, parent_id, created_at, user:user_id (id, first_name, last_name, email, role)"
          )
          .eq("post_id", postId)
          .order("created_at", { ascending: true }),
      3,
      "listComments.fetch"
    );

    const comments = commentsResult.data;
    const error = commentsResult.error;

    if (error) {
      if (looksLikeFetchFailure(error)) {
        console.warn("[listComments] fetch failed — returning empty list");
        return res.json([]);
      }
      console.error("[listComments] fetch error", error);
      return res.status(500).json({ error: error.message || "Query failed" });
    }

    const rows = Array.isArray(comments) ? comments : [];
    if (!rows.length) return res.json([]);

    const commentIds = rows.map((c) => c.id).filter(Boolean);
    const scoreById = {};
    const userVoteById = {};

    if (commentIds.length) {
      const voteResult = await runWithRetry(
        () =>
          supabase
            .from("post_comment_votes")
            .select("comment_id, value")
            .in("comment_id", commentIds),
        3,
        "listComments.votes"
      );

      const voteRows = voteResult.data;
      const voteError = voteResult.error;

      if (!voteError && Array.isArray(voteRows)) {
        voteRows.forEach((row) => {
          const key = row?.comment_id;
          if (!key) return;
          scoreById[key] = (scoreById[key] || 0) + Number(row.value || 0);
        });
      }

      const userVoteResult = await runWithRetry(
        () =>
          supabase
            .from("post_comment_votes")
            .select("comment_id, value")
            .eq("user_id", userId)
            .in("comment_id", commentIds),
        3,
        "listComments.userVotes"
      );

      const userVoteRows = userVoteResult.data;

      if (Array.isArray(userVoteRows)) {
        userVoteRows.forEach((row) => {
          if (row?.comment_id) {
            userVoteById[row.comment_id] = Number(row.value || 0);
          }
        });
      }
    }

    const payload = rows.map((comment) => ({
      id: comment.id,
      body: comment.body,
      parent_id: comment.parent_id,
      created_at: comment.created_at,
      author: formatUserIdentity(comment.user),
      score: scoreById[comment.id] || 0,
      user_vote: userVoteById[comment.id] || 0,
    }));

    return res.json(payload);
  } catch (err) {
    console.error("[listComments] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};

exports.votePost = async (req, res) => {
  try {
    const userId = req.user?.id;
    const postId = Number(req.params.postId);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const value = normalizeVoteValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: "Invalid vote value" });
    }

    if (value === 0) {
      const deleteResult = await runWithRetry(
        () =>
          supabase
            .from("post_votes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", userId),
        3,
        "votePost.delete"
      );
      const error = deleteResult.error;
      if (error && error.code !== "PGRST116") {
        console.error("[votePost] delete error", error);
        return res
          .status(500)
          .json({ error: error.message || "Delete failed" });
      }
    } else {
      const upsertResult = await runWithRetry(
        () =>
          supabase.from("post_votes").upsert(
            [
              {
                post_id: postId,
                user_id: userId,
                value,
              },
            ],
            { onConflict: "post_id,user_id" }
          ),
        3,
        "votePost.upsert"
      );

      const error = upsertResult.error;

      if (error) {
        console.error("[votePost] upsert error", error);
        return res
          .status(500)
          .json({ error: error.message || "Upsert failed" });
      }
    }

    const { data: score, error: scoreError } = await recalcScore(
      "post_votes",
      "post_id",
      postId
    );

    if (scoreError) {
      console.error("[votePost] score error", scoreError);
      return res
        .status(500)
        .json({ error: scoreError.message || "Score failed" });
    }

    return res.json({
      post_id: postId,
      score: score ?? 0,
      user_vote: value,
    });
  } catch (err) {
    console.error("[votePost] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};

exports.voteComment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const commentId = Number(req.params.commentId);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ error: "Invalid comment id" });
    }

    const value = normalizeVoteValue(req.body?.value);
    if (value === null) {
      return res.status(400).json({ error: "Invalid vote value" });
    }

    if (value === 0) {
      const deleteResult = await runWithRetry(
        () =>
          supabase
            .from("post_comment_votes")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", userId),
        3,
        "voteComment.delete"
      );
      const error = deleteResult.error;
      if (error && error.code !== "PGRST116") {
        console.error("[voteComment] delete error", error);
        return res
          .status(500)
          .json({ error: error.message || "Delete failed" });
      }
    } else {
      const upsertResult = await runWithRetry(
        () =>
          supabase.from("post_comment_votes").upsert(
            [
              {
                comment_id: commentId,
                user_id: userId,
                value,
              },
            ],
            { onConflict: "comment_id,user_id" }
          ),
        3,
        "voteComment.upsert"
      );
      const error = upsertResult.error;
      if (error) {
        console.error("[voteComment] upsert error", error);
        return res
          .status(500)
          .json({ error: error.message || "Upsert failed" });
      }
    }

    const { data: score, error: scoreError } = await recalcScore(
      "post_comment_votes",
      "comment_id",
      commentId
    );

    if (scoreError) {
      console.error("[voteComment] score error", scoreError);
      return res
        .status(500)
        .json({ error: scoreError.message || "Score failed" });
    }

    return res.json({
      comment_id: commentId,
      score: score ?? 0,
      user_vote: value,
    });
  } catch (err) {
    console.error("[voteComment] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const userId = req.user?.id;
    const schoolId = req.user?.school_id;
    const postId = Number(req.params.postId);

    if (!userId || !schoolId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    const lookupResult = await runWithRetry(
      () =>
        supabase
          .from("posts")
          .select("id")
          .eq("id", postId)
          .eq("user_id", userId)
          .eq("school_id", schoolId)
          .single(),
      3,
      "deletePost.lookup"
    );

    const lookupError = lookupResult.error;

    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return res.status(404).json({ error: "Post not found" });
      }
      console.error("[deletePost] lookup error", lookupError);
      return res
        .status(500)
        .json({ error: lookupError.message || "Lookup failed" });
    }

    if (!lookupResult.data) {
      return res.status(404).json({ error: "Post not found" });
    }

    const deleteResult = await runWithRetry(
      () =>
        supabase
          .from("posts")
          .delete()
          .eq("id", postId)
          .eq("user_id", userId)
          .eq("school_id", schoolId),
      3,
      "deletePost.delete"
    );

    const deleteError = deleteResult.error;
    if (deleteError) {
      console.error("[deletePost] delete error", deleteError);
      return res
        .status(500)
        .json({ error: deleteError.message || "Delete failed" });
    }

    return res.status(204).send();
  } catch (err) {
    console.error("[deletePost] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const userId = req.user?.id;
    const postId = Number(req.params.postId);
    const commentId = Number(req.params.commentId);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ error: "Invalid post id" });
    }

    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ error: "Invalid comment id" });
    }

    const lookupResult = await runWithRetry(
      () =>
        supabase
          .from("post_comments")
          .select("id")
          .eq("id", commentId)
          .eq("post_id", postId)
          .eq("user_id", userId)
          .single(),
      3,
      "deleteComment.lookup"
    );

    const lookupError = lookupResult.error;
    if (lookupError) {
      if (lookupError.code === "PGRST116") {
        return res.status(404).json({ error: "Comment not found" });
      }
      console.error("[deleteComment] lookup error", lookupError);
      return res
        .status(500)
        .json({ error: lookupError.message || "Lookup failed" });
    }

    if (!lookupResult.data) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const deleteResult = await runWithRetry(
      () =>
        supabase
          .from("post_comments")
          .delete()
          .eq("id", commentId)
          .eq("post_id", postId)
          .eq("user_id", userId),
      3,
      "deleteComment.delete"
    );

    const deleteError = deleteResult.error;
    if (deleteError) {
      console.error("[deleteComment] delete error", deleteError);
      return res
        .status(500)
        .json({ error: deleteError.message || "Delete failed" });
    }

    return res.status(204).send();
  } catch (err) {
    console.error("[deleteComment] exception", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
};
