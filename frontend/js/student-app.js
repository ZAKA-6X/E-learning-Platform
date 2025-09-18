document.addEventListener("DOMContentLoaded", () => {
  const feedEl = document.getElementById("feed");
  if (!feedEl) return;

  const state = {
    posts: [],
  };

  function showMessage(message) {
    feedEl.innerHTML = "";
    const msg = document.createElement("div");
    msg.className = "muted";
    msg.textContent = message;
    feedEl.appendChild(msg);
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

  function renderAttachments(container, attachments) {
    const list = document.createElement("div");
    list.className = "post-attachments";

    attachments.forEach((att) => {
      if (!att || !att.url) return;
      const type = (att.media_type || "").toLowerCase();
      const url = String(att.url);
      const filename = att.filename || "";
      const isAudio =
        type === "audio" ||
        /\.(mp3|wav|ogg|m4a|aac)$/i.test(filename) ||
        /\.(mp3|wav|ogg|m4a|aac)(?:\?.*)?$/i.test(url);

      if (type === "image") {
        const figure = document.createElement("figure");
        figure.className = "attachment attachment--image";
        const img = document.createElement("img");
        img.src = att.url;
        img.alt = att.filename || "Image";
        figure.appendChild(img);
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

  function renderPost(post) {
    const card = document.createElement("article");
    card.className = "post-card feed-post";

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

    const time = document.createElement("time");
    time.className = "post-date";
    time.dateTime = post.created_at || post.published_at || "";
    time.textContent = formatDate(post.created_at || post.published_at);
    meta.appendChild(time);

    const audience = document.createElement("span");
    audience.className = "post-audience";
    audience.textContent = audienceLabel(post.audience);
    meta.appendChild(audience);

    card.appendChild(meta);

    if (post.body_html) {
      const body = document.createElement("div");
      body.className = "post-body";
      body.innerHTML = post.body_html;
      card.appendChild(body);
    }

    if (Array.isArray(post.attachments) && post.attachments.length) {
      renderAttachments(card, post.attachments);
    }

    return card;
  }

  function render(posts) {
    state.posts = posts;
    feedEl.innerHTML = "";

    if (!posts.length) {
      showMessage("Aucune publication pour le moment.");
      return;
    }

    posts.forEach((p) => {
      const card = renderPost(p);
      feedEl.appendChild(card);
    });
  }

  async function loadPosts(showSpinner = true) {
    const token = localStorage.getItem("token");
    if (!token) {
      showMessage("Veuillez vous reconnecter pour voir les publications.");
      return;
    }

    if (showSpinner) {
      showMessage("Chargement des publications…");
    }

    try {
      const res = await fetch("/api/posts", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error("/api/posts error", errBody);
        showMessage("Impossible de charger les publications.");
        return;
      }

      const data = await res.json();
      render(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("loadPosts error", err);
      showMessage("Erreur réseau : veuillez réessayer.");
    }
  }

  loadPosts();

  document.addEventListener("post:created", () => {
    loadPosts(false);
  });
});
