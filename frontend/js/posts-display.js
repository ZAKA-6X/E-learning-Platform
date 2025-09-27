document.addEventListener("DOMContentLoaded", () => {
  const feedEl = document.getElementById("feed");
  // === Toolbar container (injected before #feed) ===
  let toolbarEl = document.getElementById("feed-toolbar");
  if (!toolbarEl && feedEl && feedEl.parentNode) {
    toolbarEl = document.createElement("div");
    toolbarEl.id = "feed-toolbar";
    toolbarEl.style.display = "flex";
    toolbarEl.style.flexWrap = "wrap";
    toolbarEl.style.gap = "12px";
    toolbarEl.style.alignItems = "center";
    toolbarEl.style.margin = "0 0 12px 0";
    feedEl.parentNode.insertBefore(toolbarEl, feedEl);
  }

  if (!feedEl) return;

  const state = {
    posts: [],
    comments: new Map(), // postId -> { items: Comment[] }
    view: "list", // or "detail"
    activePostId: null,
    sortBy: "date", // "date" | "votes"
    subjectFilterId: "", // "" = all subjects
    subjects: [],
    subjectsLoaded: false,
    currentUserId: undefined,
  };

  const toast = (message, type) => {
    if (!message) return;
    if (window.notify?.toast) {
      window.notify.toast({ message, type });
    } else {
      window.alert(message);
    }
  };

  function getToken() {
    return localStorage.getItem("token");
  }

  async function authedFetch(url, options = {}) {
    const token = getToken();
    if (!token) throw new Error("AUTH_MISSING");
    const headers = Object.assign({}, options.headers, {
      Authorization: `Bearer ${token}`,
    });
    return fetch(url, { ...options, headers });
  }

  function getCurrentUserId() {
    if (state.currentUserId !== undefined) {
      return state.currentUserId;
    }

    let userId = null;
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) {
          userId = String(parsed.id);
        }
      }
    } catch (err) {
      console.warn("[posts-display] unable to parse current user", err);
    }

    state.currentUserId = userId;
    return userId;
  }

  function isOwnPost(post) {
    const currentId = getCurrentUserId();
    if (!currentId) return false;
    const authorId = post?.author?.id ? String(post.author.id) : null;
    return authorId && authorId === currentId;
  }

  function isOwnComment(comment) {
    const currentId = getCurrentUserId();
    if (!currentId) return false;
    const authorId = comment?.author?.id ? String(comment.author.id) : null;
    return authorId && authorId === currentId;
  }

  async function handleDeletePost(post) {
    if (!post?.id) return;

    let confirmed = true;
    if (window.notify?.confirm) {
      confirmed = await window.notify.confirm({
        title: "Supprimer la publication",
        message: "Êtes-vous sûr de vouloir supprimer cette publication ?",
        confirmText: "Supprimer",
        cancelText: "Annuler",
      });
    } else if (!window.confirm("Supprimer cette publication ?")) {
      confirmed = false;
    }

    if (!confirmed) return;

    try {
      const res = await authedFetch(`/api/posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body?.error || "Impossible de supprimer la publication.", "error");
        return;
      }

      state.posts = state.posts.filter((p) => p.id !== post.id);
      state.comments.delete(post.id);
      state.view = "list";
      state.activePostId = null;
      renderFeed();
      toast("Publication supprimée.", "success");
    } catch (err) {
      if (err?.message === "AUTH_MISSING") {
        toast("Session expirée. Veuillez vous reconnecter.", "error");
        return;
      }
      console.error("[posts-display] delete post failed", err);
      toast("Impossible de supprimer la publication.", "error");
    }
  }

  async function handleDeleteComment(postId, comment) {
    if (!postId || !comment?.id) return;
    let confirmed = true;
    if (window.notify?.confirm) {
      confirmed = await window.notify.confirm({
        title: "Supprimer le commentaire",
        message: "Êtes-vous sûr de vouloir supprimer ce commentaire ?",
        confirmText: "Supprimer",
        cancelText: "Annuler",
      });
    } else if (!window.confirm("Supprimer ce commentaire ?")) {
      confirmed = false;
    }
    if (!confirmed) return;

    try {
      const res = await authedFetch(
        `/api/posts/${postId}/comments/${comment.id}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast(body?.error || "Impossible de supprimer le commentaire.", "error");
        return;
      }

      const entry = state.comments.get(postId);
      if (entry && Array.isArray(entry.items)) {
        entry.items = entry.items.filter((item) => item.id !== comment.id);
        state.comments.set(postId, entry);
      }

      const post = state.posts.find((p) => p.id === postId);
      if (post) {
        post.comment_count = Math.max(0, (post.comment_count || 0) - 1);
        updateCommentCountDisplay(post);
      }

      renderFeed();
      toast("Commentaire supprimé.", "success");
    } catch (err) {
      if (err?.message === "AUTH_MISSING") {
        toast("Session expirée. Veuillez vous reconnecter.", "error");
        return;
      }
      console.error("[posts-display] delete comment failed", err);
      toast("Impossible de supprimer le commentaire.", "error");
    }
  }

  function showMessage(message) {
    feedEl.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "muted";
    msg.textContent = message;
    feedEl.appendChild(msg);
  }

  function openPostMedia(att, post) {
    if (!att || !att.url) return;

    const toAbsolute = (value) => {
      try {
        return new URL(value, window.location.origin).toString();
      } catch (err) {
        return `${window.location.origin}${value.startsWith("/") ? "" : "/"}${value}`;
      }
    };

    const absolute = toAbsolute(att.url);
    const bodyText = post?.body_html ? stripHtml(post.body_html) : "";
    const summary = bodyText.length > 400 ? `${bodyText.slice(0, 400).trim()}…` : bodyText;

    const params = new URLSearchParams({
      file: absolute,
      kind: att.media_type || "document",
      title: post?.title || att.filename || "Document",
      author: post?.author?.name || "",
      audience: post?.audience_label || "",
      updated: post?.created_at || "",
      description: summary,
      filename: att.filename || "",
    });
    const readerUrl = `/pages/media-reader.html?${params.toString()}`;
    window.location.assign(readerUrl);
  }

  function stripHtml(html) {
    if (!html) return "";
    const temp = document.createElement("div");
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || "";
  }

  function getPostDate(post) {
    return new Date(post.created_at || post.published_at || 0).getTime();
  }

  function applyFilterAndSort(posts) {
    let rows = Array.isArray(posts) ? posts.slice() : [];

    // Filter by subject
    if (state.subjectFilterId) {
      rows = rows.filter((p) => {
        // backend returns both `subject_id` and expanded `subject?.id`
        const sid = p.subject_id || p.subject?.id || "";
        return String(sid) === String(state.subjectFilterId);
      });
    }

    // Sort
    rows.sort((a, b) => {
      if (state.sortBy === "votes") {
        const av = Number(a.score || 0);
        const bv = Number(b.score || 0);
        return bv - av; // always highest votes first
      }
      // default: date
      const ad = getPostDate(a);
      const bd = getPostDate(b);
      return bd - ad; // always newest first
    });

    return rows;
  }

  async function ensureSubjectsLoaded() {
    if (state.subjectsLoaded) return;
    try {
      const res = await authedFetch("/subjects/mine");
      const json = await res.json().catch(() => ({}));
      state.subjects = Array.isArray(json?.items) ? json.items : [];
      state.subjectsLoaded = true;
    } catch (e) {
      console.warn("[posts-display] /subjects/mine failed", e);
      state.subjects = [];
      state.subjectsLoaded = true;
    }
  }

function buildToolbar() {
  if (!toolbarEl) return;

  toolbarEl.innerHTML = "";

  // --- Sort By (always descending) ---
  const sortBy = document.createElement("select");
  sortBy.title = "Trier par";
  sortBy.dataset.role = "sort";
  sortBy.innerHTML = `
    <option value="date">Trier par : Date</option>
    <option value="votes">Trier par : Votes</option>
  `;
  sortBy.value = state.sortBy;

  // --- Subject Filter ---
  const subj = document.createElement("select");
  subj.title = "Filtrer par matière";
  subj.dataset.role = "subject";
  const opts = [
    `<option value="">Toutes les matières</option>`,
    ...state.subjects.map(
      (s) =>
        `<option value="${s.id}">${s.name || s.code || "Matière"}</option>`
    ),
  ];
  subj.innerHTML = opts.join("");
  subj.value = state.subjectFilterId;

  // Wire events
  sortBy.addEventListener("change", () => {
    state.sortBy = sortBy.value;
    renderFeed(); // re-render with new sort
  });
  subj.addEventListener("change", () => {
    state.subjectFilterId = subj.value;
    renderFeed();
  });

  // Layout
  toolbarEl.appendChild(sortBy);
  toolbarEl.appendChild(subj);
}


  let lightbox = null;
  let lightboxImg = null;

  function ensureLightbox() {
    if (lightbox) return;

    lightbox = document.createElement("div");
    lightbox.className = "image-lightbox";
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.tabIndex = -1;

    const content = document.createElement("div");
    content.className = "image-lightbox__content";

    lightboxImg = document.createElement("img");
    lightboxImg.className = "image-lightbox__img";
    lightboxImg.alt = "";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "image-lightbox__close";
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", hideLightbox);

    content.appendChild(lightboxImg);
    content.appendChild(closeBtn);
    lightbox.appendChild(content);

    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) hideLightbox();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideLightbox();
    });

    document.body.appendChild(lightbox);
  }

  function showLightbox(src, alt) {
    ensureLightbox();
    if (!lightbox || !lightboxImg) return;
    lightboxImg.src = src;
    lightboxImg.alt = alt || "";
    lightbox.classList.add("is-visible");
    lightbox.focus();
  }

  function hideLightbox() {
    if (!lightbox) return;
    lightbox.classList.remove("is-visible");
    if (lightboxImg) {
      lightboxImg.src = "";
      lightboxImg.alt = "";
    }
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch (err) {
      return iso;
    }
  }

  function audienceLabel(audience) {
    switch ((audience || "school").toLowerCase()) {
      case "class":
        return "Ma classe";
      case "all_classes":
        return "Toute la classe";
      case "school":
      default:
        return "Mon école";
    }
  }

  function roleLabel(role) {
    switch ((role || "").toLowerCase()) {
      case "admin":
        return "Administration";
      case "teacher":
        return "Enseignant";
      case "student":
        return "Élève";
      case "parent":
      case "guardian":
        return "Parent";
      default:
        return "";
    }
  }

  function updateCommentCountDisplay(post) {
    const countEl = feedEl.querySelector(
      `[data-post-id="${post.id}"] .comment-count-number`
    );
    if (countEl) {
      countEl.textContent = post.comment_count || 0;
    }
  }

  function renderAttachments(container, attachments, post) {
    const list = document.createElement("div");
    list.className = "post-attachments";

    attachments.forEach((att) => {
      if (!att || !att.url) return;
      const type = (att.media_type || "").toLowerCase();
      const url = String(att.url);
      const filename = att.filename || "";

      const getExt = (value) => {
        if (!value) return "";
        const cleaned = value.split("?")[0].split("#")[0] || "";
        const parts = cleaned.split(".");
        return parts.length > 1 ? parts.pop().toLowerCase() : "";
      };

      const urlExt = getExt(url);
      const nameExt = getExt(filename);

      const isAudio =
        type === "audio" ||
        [urlExt, nameExt].some((ext) => ["mp3", "wav", "ogg", "m4a", "aac"].includes(ext));

      const isVideo =
        type === "video" ||
        [urlExt, nameExt].some((ext) => ["mp4", "m4v", "webm", "mov"].includes(ext));

      if (type === "image") {
        const figure = document.createElement("figure");
        figure.className = "attachment attachment--image";
        const img = document.createElement("img");
        img.src = att.url;
        img.alt = att.filename || "Image";
        figure.appendChild(img);
        figure.addEventListener("click", (e) => {
          e.stopPropagation();
          showLightbox(att.url, img.alt);
        });
        list.appendChild(figure);
        return;
      }

      if (isAudio) {
        const wrapper = document.createElement("div");
        wrapper.className = "attachment attachment--audio";
        const label = document.createElement("div");
        label.className = "attachment-label";
        label.textContent = filename || "Fichier audio";
        const player = document.createElement("audio");
        player.controls = true;
        player.src = att.url;
        player.preload = "none";
        wrapper.appendChild(label);
        wrapper.appendChild(player);
        list.appendChild(wrapper);
        return;
      }

      if (isVideo) {
        const figure = document.createElement("figure");
        figure.className = "attachment attachment--video";
        figure.tabIndex = 0;

        const video = document.createElement("video");
        video.src = att.url;
        video.controls = true;
        video.preload = "metadata";
        video.tabIndex = -1;
        video.setAttribute("playsinline", "");

        const caption = document.createElement("figcaption");
        caption.className = "attachment-caption";
        caption.textContent = filename || "Vidéo";

        figure.appendChild(video);
        if (filename) figure.appendChild(caption);

        const focusVideo = () => {
          try {
            video.focus({ preventScroll: true });
          } catch {
            video.focus();
          }
        };

        figure.addEventListener("click", (e) => {
          e.stopPropagation();
          focusVideo();
        });

        figure.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            focusVideo();
          }
        });

        list.appendChild(figure);
        return;
      }

      const isPdf = [urlExt, nameExt].some((ext) => ext === "pdf");

      if (isPdf) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "attachment attachment--viewer";
        button.textContent = filename || "Document";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openPostMedia(att, post);
        });
        list.appendChild(button);
        return;
      }

      const link = document.createElement("a");
      link.href = att.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "attachment attachment--link";
      link.textContent = att.filename || "Pièce jointe";
      list.appendChild(link);
    });

    if (list.children.length) {
      container.appendChild(list);
    }
  }

  function applyVoteStyles(targetValue, upBtn, downBtn) {
    upBtn.classList.toggle("is-active", targetValue === 1);
    downBtn.classList.toggle("is-active", targetValue === -1);
  }

  async function handlePostVote(post, direction, controls) {
    try {
      const current = post.user_vote || 0;
      const nextValue = current === direction ? 0 : direction;
      const res = await authedFetch(`/api/posts/${post.id}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nextValue }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("votePost error", data);
        toast(data?.error || "Impossible d'enregistrer votre vote.", "error");
        return;
      }

      post.score = data.score ?? 0;
      post.user_vote = data.user_vote ?? 0;
      controls.score.textContent = post.score;
      applyVoteStyles(post.user_vote, controls.upBtn, controls.downBtn);
    } catch (err) {
      console.error("handlePostVote", err);
      toast("Erreur réseau.", "error");
    }
  }

  function createPostVoteControls(post) {
    const wrap = document.createElement("div");
    wrap.className = "vote-controls";
    wrap.addEventListener("click", (e) => e.stopPropagation());

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "vote-btn vote-btn--up";
    upBtn.title = "Approuver";
    upBtn.textContent = "▲";

    const score = document.createElement("span");
    score.className = "vote-score";
    score.textContent = post.score ?? 0;

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "vote-btn vote-btn--down";
    downBtn.title = "Désapprouver";
    downBtn.textContent = "▼";

    applyVoteStyles(post.user_vote || 0, upBtn, downBtn);

    const controls = { upBtn, downBtn, score };
    upBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handlePostVote(post, 1, controls);
    });
    downBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handlePostVote(post, -1, controls);
    });

    wrap.appendChild(upBtn);
    wrap.appendChild(score);
    wrap.appendChild(downBtn);
    return wrap;
  }

  async function handleCommentVote(comment, direction, controls, postId) {
    try {
      const current = comment.user_vote || 0;
      const nextValue = current === direction ? 0 : direction;
      const res = await authedFetch(`/api/posts/comments/${comment.id}/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: nextValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("voteComment error", data);
        toast(data?.error || "Impossible d'enregistrer le vote.", "error");
        return;
      }
      comment.score = data.score ?? 0;
      comment.user_vote = data.user_vote ?? 0;
      controls.score.textContent = comment.score;
      applyVoteStyles(comment.user_vote, controls.upBtn, controls.downBtn);
    } catch (err) {
      console.error("handleCommentVote", err);
      toast("Erreur réseau.", "error");
    }
  }

  function createCommentVoteControls(comment, postId) {
    const wrap = document.createElement("div");
    wrap.className = "vote-controls vote-controls--comment";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "vote-btn vote-btn--up";
    upBtn.textContent = "▲";

    const score = document.createElement("span");
    score.className = "vote-score";
    score.textContent = comment.score ?? 0;

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "vote-btn vote-btn--down";
    downBtn.textContent = "▼";

    applyVoteStyles(comment.user_vote || 0, upBtn, downBtn);

    const controls = { upBtn, downBtn, score };
    upBtn.addEventListener("click", () =>
      handleCommentVote(comment, 1, controls, postId)
    );
    downBtn.addEventListener("click", () =>
      handleCommentVote(comment, -1, controls, postId)
    );

    wrap.appendChild(upBtn);
    wrap.appendChild(score);
    wrap.appendChild(downBtn);
    return wrap;
  }

  function createCommentElement(comment, postId) {
    const item = document.createElement("article");
    item.className = "comment";

    const meta = document.createElement("div");
    meta.className = "comment-meta";

    const metaLeft = document.createElement("div");
    metaLeft.className = "comment-meta-left";

    const author = document.createElement("span");
    author.className = "comment-author";
    author.textContent = comment.author?.name || "Utilisateur";

    metaLeft.appendChild(author);
    const role = roleLabel(comment.author?.role);
    if (role) {
      const badge = document.createElement("span");
      badge.className = "comment-author-role";
      badge.textContent = role;
      metaLeft.appendChild(badge);
    }

    const metaRight = document.createElement("div");
    metaRight.className = "comment-meta-right";

    const date = document.createElement("time");
    date.className = "comment-date";
    date.dateTime = comment.created_at || "";
    date.textContent = formatDate(comment.created_at);
    metaRight.appendChild(date);

    if (isOwnComment(comment)) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "comment-delete-btn";
      deleteBtn.textContent = "Supprimer";
      deleteBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleDeleteComment(postId, comment);
      });
      metaRight.appendChild(deleteBtn);
    }

    meta.appendChild(metaLeft);
    meta.appendChild(metaRight);

    const body = document.createElement("div");
    body.className = "comment-body";
    body.textContent = comment.body;

    const actions = document.createElement("div");
    actions.className = "comment-actions";
    const voteControls = createCommentVoteControls(comment, postId);
    actions.appendChild(voteControls);

    item.appendChild(meta);
    item.appendChild(body);
    item.appendChild(actions);
    return item;
  }

  function createCommentForm(post, section) {
    const form = document.createElement("form");
    form.className = "comment-form";
    form.noValidate = true;

    const textarea = document.createElement("textarea");
    textarea.name = "body";
    textarea.placeholder = "Écrire un commentaire…";
    textarea.required = true;

    const actions = document.createElement("div");
    actions.className = "comment-form-actions";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = "Commenter";

    actions.appendChild(submit);
    form.appendChild(textarea);
    form.appendChild(actions);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = textarea.value.trim();
      if (!text) return;

      submit.disabled = true;
      try {
        const res = await authedFetch(`/api/posts/${post.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("addComment error", data);
          toast(data?.error || "Impossible d'ajouter le commentaire.", "error");
          return;
        }

        textarea.value = "";
        const entry = state.comments.get(post.id) || { items: [] };
        entry.items.push(data);
        state.comments.set(post.id, entry);
        post.comment_count = (post.comment_count || 0) + 1;
        updateCommentCountDisplay(post);
        renderComments(section, post);
      } catch (err) {
        console.error("addComment", err);
        toast("Erreur réseau.", "error");
      } finally {
        submit.disabled = false;
      }
    });

    return form;
  }

  function renderComments(section, post) {
    const entry = state.comments.get(post.id) || { items: [] };
    section.innerHTML = "";

    const list = document.createElement("div");
    list.className = "comments-list";
    entry.items.forEach((comment) => {
      list.appendChild(createCommentElement(comment, post.id));
    });

    section.appendChild(list);
    section.appendChild(createCommentForm(post, section));
  }

  async function ensureCommentsLoaded(post, section) {
    const cached = state.comments.get(post.id);
    if (cached && Array.isArray(cached.items)) {
      renderComments(section, post);
      return;
    }

    section.innerHTML = '<div class="muted">Chargement des commentaires…</div>';
    try {
      const res = await authedFetch(`/api/posts/${post.id}/comments`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        console.error("listComments error", data);
        section.innerHTML = '<div class="muted">Chargement impossible.</div>';
        return;
      }
      const items = Array.isArray(data) ? data : [];
      state.comments.set(post.id, { items });
      post.comment_count = items.length;
      updateCommentCountDisplay(post);
      renderComments(section, post);
    } catch (err) {
      console.error("ensureCommentsLoaded", err);
      section.innerHTML = '<div class="muted">Erreur réseau.</div>';
    }
  }

  function renderPost(post, options = {}) {
    const { showBack = false, autoShowComments = false } = options;
    const card = document.createElement("article");
    card.className = "post-card feed-post";
    card.dataset.postId = post.id;

    if (showBack) {
      const headerActions = document.createElement("div");
      headerActions.className = "post-header-actions";

      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "post-back-btn";
      backBtn.textContent = "← Retour aux publications";
      backBtn.addEventListener("click", (event) => {
        event.preventDefault();
        state.view = "list";
        state.activePostId = null;
        renderFeed();
      });
      headerActions.appendChild(backBtn);

      if (isOwnPost(post)) {
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "post-delete-btn";
        deleteBtn.textContent = "Supprimer";
        deleteBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          handleDeletePost(post);
        });
        headerActions.appendChild(deleteBtn);
      }

      card.appendChild(headerActions);
    }

    if (post.title) {
      const title = document.createElement("h3");
      title.className = "post-title";
      title.textContent = post.title;
      card.appendChild(title);
    }

    const meta = document.createElement("div");
    meta.className = "post-meta";

    if (post.author?.name) {
      const author = document.createElement("span");
      author.className = "post-author";
      author.textContent = post.author.name;
      meta.appendChild(author);
    }

    const role = roleLabel(post.author?.role);
    if (role) {
      const roleEl = document.createElement("span");
      roleEl.className = "post-author-role";
      roleEl.textContent = role;
      meta.appendChild(roleEl);
    }

    const time = document.createElement("time");
    time.className = "post-date";
    time.dateTime = post.created_at || post.published_at || "";
    time.textContent = formatDate(post.created_at || post.published_at);
    meta.appendChild(time);

    const audience = document.createElement("span");
    audience.className = "post-audience";
    audience.textContent = post.audience_label || audienceLabel(post.audience);
    meta.appendChild(audience);

    card.appendChild(meta);

    if (post.body_html) {
      const body = document.createElement("div");
      body.className = "post-body";
      body.innerHTML = post.body_html;
      card.appendChild(body);
    }

    if (Array.isArray(post.attachments) && post.attachments.length) {
      renderAttachments(card, post.attachments, post);
    }

    const actions = document.createElement("div");
    actions.className = "post-actions";

    const actionsLeft = document.createElement("div");
    actionsLeft.className = "post-actions-left";
    actionsLeft.appendChild(createPostVoteControls(post));

    const commentInfo = document.createElement("div");
    commentInfo.className = "comment-info";
    commentInfo.innerHTML = `
      <i class="fa-regular fa-comments"></i>
      <span class="comment-count-number">${post.comment_count || 0}</span>
    `;
    actionsLeft.appendChild(commentInfo);

    actions.appendChild(actionsLeft);
    card.appendChild(actions);

    if (autoShowComments) {
      const commentSection = document.createElement("section");
      commentSection.className = "post-comments";
      card.appendChild(commentSection);
      ensureCommentsLoaded(post, commentSection);
    }

    return card;
  }

  function renderFeed() {
    feedEl.innerHTML = "";

    const all = Array.isArray(state.posts) ? state.posts : [];
    const posts = applyFilterAndSort(all);
    if (!posts.length) {
      showMessage("Aucune publication pour le moment.");
      return;
    }

    if (state.view === "detail") {
      const active = posts.find((p) => p.id === state.activePostId);
      if (!active) {
        // If the active post got filtered out, go back to list
        state.view = "list";
        state.activePostId = null;
        renderFeed();
        return;
      }
      const card = renderPost(active, {
        showBack: true,
        autoShowComments: true,
      });
      feedEl.appendChild(card);
      return;
    }

    posts.forEach((post) => {
      const card = renderPost(post);

      card.classList.add("is-clickable");
      card.addEventListener("click", () => {
        showDetail(post.id);
      });

      feedEl.appendChild(card);
    });
  }

  function showDetail(postId) {
    state.view = "detail";
    state.activePostId = postId;
    renderFeed();
  }

  async function loadPosts(showSpinner = true) {
    const token = getToken();
    if (!token) {
      showMessage("Veuillez vous reconnecter pour voir les publications.");
      return;
    }

    if (showSpinner) {
      showMessage("Chargement des publications…");
    }

    try {
      const res = await authedFetch("/api/posts");
      if (!res.ok) {
        const errBody = await res.text();
        console.error("/api/posts error", errBody);
        showMessage("Impossible de charger les publications.");
        return;
      }
      const data = await res.json();
      state.posts = Array.isArray(data) ? data : [];
      await ensureSubjectsLoaded();
      buildToolbar();
      renderFeed();
    } catch (err) {
      console.error("loadPosts error", err);
      showMessage("Erreur réseau : veuillez réessayer.");
    }
  }

  loadPosts();

  document.addEventListener("post:created", () => {
    state.sortBy = "date";
    state.subjectFilterId = "";
    state.view = "list";
    state.activePostId = null;

    const sortSelect = toolbarEl?.querySelector('select[data-role="sort"]');
    if (sortSelect) sortSelect.value = "date";
    const subjectSelect = toolbarEl?.querySelector('select[data-role="subject"]');
    if (subjectSelect) subjectSelect.value = "";

    loadPosts(false);
  });
});
