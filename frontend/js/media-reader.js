const els = {
  back: document.getElementById("media-back"),
  detailsToggle: document.querySelector("[data-media-details-toggle]"),
  sidebar: document.querySelector("[data-media-sidebar]"),
  detailsClose: document.querySelector("[data-media-details-close]"),
  overlay: document.querySelector("[data-media-sidebar-overlay]"),
  title: document.getElementById("media-title"),
  breadcrumb: document.getElementById("media-breadcrumb"),
  updated: document.getElementById("media-updated"),
  courseMeta: document.getElementById("media-course-meta"),
  viewer: document.getElementById("media-viewer"),
  loading: document.getElementById("media-loading"),
  docTitle: document.getElementById("media-doc-title"),
  author: document.getElementById("media-author"),
  audience: document.getElementById("media-audience"),
};

const params = new URLSearchParams(window.location.search);
const returnView = params.get('returnView') || '';
const returnSubject = params.get('returnSubject') || '';
const returnCourse = params.get('returnCourse') || '';
const returnSection = params.get('returnSection') || '';
const courseId = params.get("courseId");
const resourceId = params.get("resourceId");
const directFileUrl = params.get("file");
const directTitle = params.get("title") || "Document";
const directKind = params.get("kind") || "document";
const directUpdated = params.get("updated") || "";
const directAuthor = params.get("author") || "";
const directAudience = params.get("audience") || "";
const directDescription = params.get("description") || "";
const directBody = params.get("body") || "";
const directFilename = params.get("filename") || "";
const isStandaloneFile = Boolean(directFileUrl);

const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/pages/login.html";
  throw new Error("Unauthorized");
}

const sidebarMediaQuery = window.matchMedia("(max-width: 1105px)");

const user = (() => {
  try {
    return JSON.parse(localStorage.getItem("user")) || {};
  } catch (err) {
    return {};
  }
})();

const defaultBack = (() => {
  const role = (user?.role || "").toLowerCase();
  if (role === "student") return "/pages/student-dashboard.html";
  if (role === "parent") return "/pages/parent-dashboard.html";
  if (role === "admin") return "/pages/admin-dashboard.html";
  return "/pages/teacher-dashboard.html";
})();

function buildBackUrl() {
  if (!returnView) return null;
  const params = new URLSearchParams();
  params.set('libraryView', returnView);
  if (returnSubject) params.set('librarySubject', returnSubject);
  if (returnCourse) params.set('libraryCourse', returnCourse);
  if (returnSection) params.set('librarySection', returnSection);
  return `/pages/student-dashboard.html?${params.toString()}`;
}

const customBackUrl = buildBackUrl();

if (els.back) {
  els.back.addEventListener("click", (event) => {
    event.preventDefault();
    if (customBackUrl) {
      window.location.href = customBackUrl;
      return;
    }
    if (document.referrer && document.referrer !== window.location.href) {
      window.history.back();
    } else {
      window.location.href = defaultBack;
    }
  });
}

setupResponsiveSidebar();

function setupResponsiveSidebar() {
  if (!els.sidebar) return;

  const openSidebar = () => {
    if (!sidebarMediaQuery.matches) return;
    els.sidebar.classList.add("is-visible");
    document.body.classList.add("media-sidebar-open");
    els.sidebar.setAttribute("aria-hidden", "false");
    els.detailsToggle?.setAttribute("aria-expanded", "true");
    if (els.overlay) {
      els.overlay.hidden = false;
    }

    const focusable = els.sidebar.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus({ preventScroll: true });
  };

  const closeSidebar = ({ restoreFocus } = { restoreFocus: true }) => {
    els.sidebar.classList.remove("is-visible");
    document.body.classList.remove("media-sidebar-open");
    els.detailsToggle?.setAttribute("aria-expanded", "false");
    if (sidebarMediaQuery.matches) {
      els.sidebar.setAttribute("aria-hidden", "true");
    } else {
      els.sidebar.removeAttribute("aria-hidden");
    }
    if (els.overlay) {
      els.overlay.hidden = true;
    }

    if (restoreFocus && sidebarMediaQuery.matches) {
      els.detailsToggle?.focus();
    }
  };

  const syncSidebarForViewport = (matches) => {
    if (matches) {
      els.sidebar.setAttribute("aria-hidden", "true");
      els.detailsToggle?.setAttribute("aria-expanded", "false");
      closeSidebar({ restoreFocus: false });
    } else {
      els.sidebar.classList.remove("is-visible");
      els.sidebar.removeAttribute("aria-hidden");
      document.body.classList.remove("media-sidebar-open");
      els.overlay && (els.overlay.hidden = true);
      els.detailsToggle?.setAttribute("aria-expanded", "false");
    }
  };

  els.detailsToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    if (els.sidebar.classList.contains("is-visible")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  els.detailsClose?.addEventListener("click", (event) => {
    event.preventDefault();
    closeSidebar();
  });

  els.overlay?.addEventListener("click", () => {
    closeSidebar();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("media-sidebar-open")) {
      event.preventDefault();
      closeSidebar();
    }
  });

  const handleViewportChange = (event) => {
    syncSidebarForViewport(event.matches);
  };

  if (typeof sidebarMediaQuery.addEventListener === "function") {
    sidebarMediaQuery.addEventListener("change", handleViewportChange);
  } else if (typeof sidebarMediaQuery.addListener === "function") {
    sidebarMediaQuery.addListener(handleViewportChange);
  }

  syncSidebarForViewport(sidebarMediaQuery.matches);
}

function showError(message) {
  if (els.loading) {
    els.loading.remove();
  }
  if (els.viewer) {
    els.viewer.innerHTML = `
      <div class="media-placeholder">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>${message || "Une erreur est survenue."}</p>
      </div>
    `;
  }
}

function formatDate(value) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
  } catch (err) {
    return "—";
  }
}

function labelForResource(kind) {
  switch ((kind || "document").toLowerCase()) {
    case "video":
      return "Vidéo";
    case "audio":
      return "Audio";
    case "link":
      return "Lien";
    case "quiz":
      return "Quiz";
    case "image":
      return "Image";
    default:
      return "Document";
  }
}

function mediaHref(resourceId, fallbackCourseId) {
  const resolvedCourseId = courseId || fallbackCourseId;
  if (!resolvedCourseId || !resourceId) return null;
  return `/pages/media-reader.html?courseId=${encodeURIComponent(resolvedCourseId)}&resourceId=${encodeURIComponent(resourceId)}`;
}

function absolutizeUrl(url) {
  if (!url) return null;
  if (/^(?:https?|data|blob):/i.test(url)) return url;
  const prefix = url.startsWith("/") ? "" : "/";
  return `${window.location.origin}${prefix}${url}`;
}

function fileExtension(url) {
  if (!url) return "";
  try {
    const clean = url.split("?")[0].split("#")[0];
    const parts = clean.split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "";
  } catch (err) {
    return "";
  }
}

function truncateText(text, max = 180) {
  if (!text) return "";
  const normalized = text.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trim()}…`;
}

function createIframe(url) {
  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.className = "media-iframe";
  iframe.title = "Lecteur de document";
  iframe.setAttribute("loading", "lazy");
  return iframe;
}

function createVideo(url) {
  const video = document.createElement("video");
  video.src = url;
  video.controls = true;
  video.className = "media-video";
  video.playsInline = true;
  return video;
}

function createAudio(url) {
  const audio = document.createElement("audio");
  audio.src = url;
  audio.controls = true;
  audio.className = "media-audio";
  return audio;
}

function createImage(url, title) {
  const img = document.createElement("img");
  img.src = url;
  img.alt = title || "Ressource";
  img.className = "media-image";
  return img;
}

function looksLikeMarkdown(text) {
  if (!text) return false;
  return /(^|\n)#{1,6}\s+/.test(text) || /```/.test(text) || /(^|\n)[-*_]{3,}/.test(text);
}

function renderMarkdownArticle(markdown) {
  const article = document.createElement("article");
  article.className = "media-article media-markdown";

  if (typeof window.marked !== "undefined") {
    const html = window.marked.parse(markdown || "");
    if (window.DOMPurify) {
      article.innerHTML = window.DOMPurify.sanitize(html);
    } else {
      article.innerHTML = html;
    }
  } else {
    article.textContent = markdown || "";
  }

  return article;
}

async function renderMarkdownFromUrl(url) {
  if (!els.viewer) return;
  const placeholder = document.createElement("div");
  placeholder.className = "media-placeholder";
  placeholder.innerHTML = `
    <i class="fa-solid fa-circle-notch fa-spin"></i>
    <p>Chargement du document…</p>
  `;
  els.viewer.appendChild(placeholder);

  try {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const article = renderMarkdownArticle(text);
    placeholder.replaceWith(article);
  } catch (err) {
    console.error("Failed to load markdown", err);
    placeholder.innerHTML = `
      <i class="fa-solid fa-triangle-exclamation"></i>
      <p>Impossible de charger ce document markdown.</p>
    `;
  }
}

function renderResourceViewer(resource) {
  if (!els.viewer) return;
  if (els.loading) {
    els.loading.remove();
  }

  els.viewer.innerHTML = "";

  const kind = (resource?.kind || "document").toLowerCase();
  const url = absolutizeUrl(resource?.resource_url);
  const hasUrl = Boolean(url);
  const hasContent = typeof resource?.content === "string" && resource.content.trim().length > 0;

  if (!hasUrl && !hasContent) {
    const fallback = document.createElement("div");
    fallback.className = "media-placeholder";
    fallback.innerHTML = `
      <i class="fa-solid fa-file"></i>
      <p>Ce document n'est pas disponible pour la lecture.</p>
    `;
    els.viewer.appendChild(fallback);
    return;
  }

  switch (kind) {
    case "video": {
      if (!hasUrl) {
        break;
      }
      els.viewer.appendChild(createVideo(url));
      break;
    }
    case "audio": {
      if (!hasUrl) {
        break;
      }
      els.viewer.appendChild(createAudio(url));
      break;
    }
    case "image": {
      if (!hasUrl) {
        break;
      }
      els.viewer.appendChild(createImage(url, resource?.title));
      break;
    }
    case "markdown": {
      if (hasUrl) {
        renderMarkdownFromUrl(url);
      } else if (hasContent) {
        els.viewer.appendChild(renderMarkdownArticle(resource.content.trim()));
      }
      break;
    }
    case "link": {
      if (hasUrl) {
        els.viewer.innerHTML = `
          <div class="media-placeholder">
            <i class="fa-solid fa-up-right-from-square"></i>
            <p>Cette ressource est un lien externe.</p>
            <a class="action-button" href="${url}" target="_blank" rel="noopener noreferrer">Ouvrir le lien</a>
          </div>
        `;
      }
      break;
    }
    case "quiz": {
      els.viewer.innerHTML = `
        <div class="media-placeholder">
          <i class="fa-solid fa-clipboard-list"></i>
          <p>Cette ressource est un quiz. Accédez-y depuis l'espace quiz.</p>
        </div>
      `;
      break;
    }
    default: {
      if (hasUrl) {
        const ext = fileExtension(url);
        if (ext === "pdf") {
          els.viewer.appendChild(createIframe(url));
        } else if (["mp4", "webm", "ogg"].includes(ext)) {
          els.viewer.appendChild(createVideo(url));
        } else if (["mp3", "wav", "aac", "oga"].includes(ext)) {
          els.viewer.appendChild(createAudio(url));
        } else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
          els.viewer.appendChild(createImage(url, resource?.title));
        } else if (["md", "markdown", "mdown", "mkd"].includes(ext)) {
          renderMarkdownFromUrl(url);
        } else {
          els.viewer.appendChild(createIframe(url));
        }
      } else if (hasContent) {
        if (looksLikeMarkdown(resource.content)) {
          els.viewer.appendChild(renderMarkdownArticle(resource.content.trim()));
        } else {
          const article = document.createElement("article");
          article.className = "media-article";
          article.textContent = resource.content.trim();
          els.viewer.appendChild(article);
        }
      }
      break;
    }
  }

  if (!els.viewer.childElementCount) {
    const fallback = document.createElement("div");
    fallback.className = "media-placeholder";
    fallback.innerHTML = `
      <i class="fa-solid fa-file"></i>
      <p>Ce document n'est pas disponible pour la lecture.</p>
    `;
    els.viewer.appendChild(fallback);
  }
}

function renderStandaloneFile() {
  const url = absolutizeUrl(directFileUrl);
  const resource = {
    title: directTitle,
    kind: directKind,
    resource_url: url,
  };

  if (els.title) {
    els.title.textContent = directTitle;
  }

  document.title = `${directTitle} — Lecteur`;

  if (els.breadcrumb) {
    els.breadcrumb.textContent = directAuthor || directTitle;
  }

  if (els.courseMeta) {
    const summary = truncateText(directBody || directDescription || "");
    els.courseMeta.textContent = summary || "—";
  }

  if (els.docTitle) {
    els.docTitle.textContent = directFilename || directTitle;
  }

  if (els.author) {
    els.author.textContent = directAuthor || "—";
  }

  if (els.audience) {
    els.audience.textContent = directAudience || labelForResource(resource.kind);
  }

  if (els.updated) {
    els.updated.textContent = directUpdated ? formatDate(directUpdated) : "—";
  }

  renderResourceViewer(resource);
}

async function fetchResource() {
  if (!courseId || !resourceId) {
    showError("Paramètres manquants pour identifier la ressource.");
    return;
  }

  try {
    const response = await fetch(`/api/courses/${courseId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload?.error || "Impossible de récupérer le cours.";
      showError(message);
      return;
    }

    const payload = await response.json();
    const course = payload?.item;

    if (!course) {
      showError("Cours introuvable.");
      return;
    }

    const sections = Array.isArray(course.sections) ? course.sections : [];
    const resources = Array.isArray(course.resources) ? course.resources : [];
    const resource = resources.find((item) => String(item.id) === String(resourceId));

    if (!resource) {
      showError("Ressource introuvable.");
      return;
    }

    const resourceTitle = resource.title || "Ressource sans titre";
    const filename = resource.filename || resource.title || "Document";

    if (els.title) {
      els.title.textContent = resourceTitle;
    }

    document.title = `${resourceTitle} — Lecteur`;

    if (els.breadcrumb) {
      const crumbParts = [];
      if (course.title) crumbParts.push(course.title);
      if (course.subject_name) crumbParts.push(course.subject_name);
      if (sections.length) {
        const sectionObj = sections.find((item) => item.id === resource.section_id);
        if (sectionObj?.title) crumbParts.push(sectionObj.title);
      }
      els.breadcrumb.textContent = crumbParts.join(" • ") || "Ressource";
    }

    if (els.updated) {
      els.updated.textContent = formatDate(resource.updated_at || resource.created_at);
    }

    if (els.courseMeta) {
      const metaParts = [];
      if (resource.description) metaParts.push(resource.description);
      if (!metaParts.length && course.subject_name) metaParts.push(course.subject_name);
      if (!metaParts.length && course.class_name) metaParts.push(`Classe ${course.class_name}`);
      if (!metaParts.length && course.teacher_name) metaParts.push(course.teacher_name);
      if (!metaParts.length) {
        const sectionObj = sections.find((item) => item.id === resource.section_id);
        if (sectionObj?.title) metaParts.push(sectionObj.title);
      }
      const summary = truncateText(metaParts.join(" • "));
      els.courseMeta.textContent = summary || "—";
    }

    if (els.docTitle) {
      els.docTitle.textContent = filename;
    }

    if (els.author) {
      const authorName = resource.author?.name || resource.owner?.name || course.teacher_name || "";
      els.author.textContent = authorName || "—";
    }

    if (els.audience) {
      const audienceParts = [];
      if (resource.audience_label) audienceParts.push(resource.audience_label);
      if (!audienceParts.length && course.class_name) audienceParts.push(`Classe ${course.class_name}`);
      if (course.subject_name) audienceParts.push(course.subject_name);
      els.audience.textContent = audienceParts.join(" • ") || labelForResource(resource.kind);
    }

    renderResourceViewer(resource);
  } catch (err) {
    console.error("Failed to fetch resource", err);
    showError("Impossible de charger la ressource.");
  }
}

if (isStandaloneFile) {
  renderStandaloneFile();
} else {
  fetchResource();
}
