const els = {
  back: document.getElementById("media-back"),
  title: document.getElementById("media-title"),
  breadcrumb: document.getElementById("media-breadcrumb"),
  section: document.getElementById("media-section"),
  updated: document.getElementById("media-updated"),
  kind: document.getElementById("media-kind"),
  courseMeta: document.getElementById("media-course-meta"),
  descriptionBlock: document.getElementById("media-description-block"),
  description: document.getElementById("media-description"),
  download: document.getElementById("media-download"),
  openExternal: document.getElementById("media-open-external"),
  fallback: document.getElementById("media-fallback"),
  viewer: document.getElementById("media-viewer"),
  loading: document.getElementById("media-loading"),
  sectionList: document.getElementById("media-section-list"),
};

const params = new URLSearchParams(window.location.search);
const courseId = params.get("courseId");
const resourceId = params.get("resourceId");

const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/pages/login.html";
  throw new Error("Unauthorized");
}

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

if (els.back) {
  els.back.addEventListener("click", (event) => {
    event.preventDefault();
    if (document.referrer && document.referrer !== window.location.href) {
      window.history.back();
    } else {
      window.location.href = defaultBack;
    }
  });
}

function showError(message) {
  if (els.loading) {
    els.loading.remove();
  }
  if (els.viewer) {
    els.viewer.innerHTML = `
      <div class="media-error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <p>${message || "Une erreur est survenue."}</p>
      </div>
    `;
  }
  if (els.download) {
    els.download.hidden = true;
  }
  if (els.fallback) {
    els.fallback.hidden = true;
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

function iconForResource(kind) {
  switch ((kind || "document").toLowerCase()) {
    case "video":
      return "fa-circle-play";
    case "audio":
      return "fa-music";
    case "image":
      return "fa-image";
    case "link":
      return "fa-link";
    case "quiz":
      return "fa-question";
    default:
      return "fa-file-lines";
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

function renderResourceViewer(resource) {
  if (!els.viewer) return;
  if (els.loading) {
    els.loading.remove();
  }

  els.viewer.innerHTML = "";
  els.fallback.hidden = true;

  const kind = (resource?.kind || "document").toLowerCase();
  const url = absolutizeUrl(resource?.resource_url);
  const hasUrl = Boolean(url);
  const hasContent = typeof resource?.content === "string" && resource.content.trim().length > 0;

  if (!hasUrl && !hasContent) {
    els.fallback.hidden = false;
    return;
  }

  if (els.download) {
    els.download.hidden = !hasUrl;
    if (hasUrl) {
      els.download.href = url;
    }
  }

  if (els.openExternal) {
    els.openExternal.hidden = !hasUrl;
    if (hasUrl) {
      els.openExternal.href = url;
    }
  }

  switch (kind) {
    case "video": {
      if (!hasUrl) {
        els.fallback.hidden = false;
        break;
      }
      els.viewer.appendChild(createVideo(url));
      break;
    }
    case "audio": {
      if (!hasUrl) {
        els.fallback.hidden = false;
        break;
      }
      els.viewer.appendChild(createAudio(url));
      break;
    }
    case "image": {
      if (!hasUrl) {
        els.fallback.hidden = false;
        break;
      }
      els.viewer.appendChild(createImage(url, resource?.title));
      break;
    }
    case "link": {
      // External links are better viewed outside for security reasons
      els.fallback.hidden = false;
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
        } else {
          els.viewer.appendChild(createIframe(url));
        }
      } else if (hasContent) {
        const article = document.createElement("article");
        article.className = "media-article";
        article.textContent = resource.content.trim();
        els.viewer.appendChild(article);
      } else {
        els.fallback.hidden = false;
      }
      break;
    }
  }

  if (!els.viewer.childElementCount) {
    els.fallback.hidden = false;
  }
}

function renderCourseMeta(course) {
  if (!els.courseMeta) return;
  const parts = [];
  if (course?.subject_name) parts.push(course.subject_name);
  if (course?.class_name) parts.push(`Classe ${course.class_name}`);
  if (course?.teacher_name) parts.push(course.teacher_name);
  if (!parts.length && (course?.updated_at || course?.created_at)) {
    const date = formatDate(course.updated_at || course.created_at);
    if (date && date !== "—") parts.push(`Mis à jour ${date}`);
  }
  els.courseMeta.textContent = parts.join(" • ") || "—";
}

function renderSectionList(course, currentResource) {
  if (!els.sectionList) return;

  const container = els.sectionList;
  container.innerHTML = "";

  const sections = Array.isArray(course?.sections) ? course.sections : [];
  const resources = Array.isArray(course?.resources) ? course.resources : [];
  const currentResourceId = currentResource?.id != null ? String(currentResource.id) : null;
  const currentSectionId = currentResource?.section_id != null ? String(currentResource.section_id) : null;

  if (!sections.length && !resources.length) {
    const empty = document.createElement("p");
    empty.className = "media-section-card__empty";
    empty.textContent = "Aucune section n'est encore disponible pour ce cours.";
    container.appendChild(empty);
    return;
  }

  const resourcesBySection = new Map();
  resources.forEach((item) => {
    const key = item.section_id != null ? String(item.section_id) : null;
    if (!resourcesBySection.has(key)) {
      resourcesBySection.set(key, []);
    }
    resourcesBySection.get(key).push(item);
  });

  const appendSectionCard = (section, list, { highlight = false, fallbackTitle = null, fallbackDescription = null } = {}) => {
    const card = document.createElement("article");
    card.className = "media-section-card";
    if (highlight) card.classList.add("is-active");

    const header = document.createElement("div");
    header.className = "media-section-card__header";

    const titleEl = document.createElement("h3");
    titleEl.textContent = fallbackTitle || section?.title || "Section";
    header.appendChild(titleEl);

    const metaEl = document.createElement("p");
    metaEl.className = "media-section-card__meta";
    const count = list.length;
    metaEl.textContent = count ? `${count} ressource${count > 1 ? "s" : ""}` : "Aucune ressource";
    header.appendChild(metaEl);

    card.appendChild(header);

    const description = (section?.description || "").trim() || fallbackDescription;
    if (description) {
      const descEl = document.createElement("p");
      descEl.className = "media-section-card__description";
      descEl.textContent = description;
      card.appendChild(descEl);
    }

    if (list.length) {
      const listEl = document.createElement("ul");
      listEl.className = "media-section-card__list";

      list.forEach((resource) => {
        const li = document.createElement("li");
        li.className = "media-section-card__item";
        const resourceId = resource?.id != null ? String(resource.id) : null;
        const href = mediaHref(resourceId, course?.id);

        if (resourceId && resourceId === currentResourceId) {
          li.classList.add("is-current");
        }

        if (href) {
          const link = document.createElement("a");
          link.className = "media-section-card__link";
          link.href = href;
          if (resourceId && resourceId === currentResourceId) {
            link.setAttribute("aria-current", "page");
          }

          const iconWrap = document.createElement("span");
          iconWrap.className = "media-section-card__icon";
          iconWrap.innerHTML = `<i class="fa-solid ${iconForResource(resource.kind)}"></i>`;
          link.appendChild(iconWrap);

          const textWrap = document.createElement("span");
          textWrap.className = "media-section-card__text";

          const title = document.createElement("span");
          title.className = "media-section-card__title";
          title.textContent = resource.title || "Sans titre";
          textWrap.appendChild(title);

          const kindEl = document.createElement("span");
          kindEl.className = "media-section-card__kind";
          const metaParts = [labelForResource(resource.kind)];
          const date = formatDate(resource.updated_at || resource.created_at);
          if (date && date !== "—") metaParts.push(date);
          kindEl.textContent = metaParts.join(" • ");
          textWrap.appendChild(kindEl);

          link.appendChild(textWrap);
          li.appendChild(link);
        } else {
          const title = document.createElement("span");
          title.className = "media-section-card__title";
          title.textContent = resource.title || "Sans titre";
          li.appendChild(title);
        }

        listEl.appendChild(li);
      });

      card.appendChild(listEl);
    } else {
      const emptyMsg = document.createElement("p");
      emptyMsg.className = "media-section-card__empty";
      emptyMsg.textContent = "Pas encore de ressources dans cette section.";
      card.appendChild(emptyMsg);
    }

    container.appendChild(card);
  };

  sections.forEach((section) => {
    const sectionKey = section?.id != null ? String(section.id) : null;
    const list = resourcesBySection.get(sectionKey) || [];
    const highlight = sectionKey && sectionKey === currentSectionId;
    appendSectionCard(section, list, { highlight });
    resourcesBySection.delete(sectionKey);
  });

  resourcesBySection.forEach((list, key) => {
    if (!list.length) return;
    const highlight = (key === null && !currentSectionId) || (key != null && key === currentSectionId);
    appendSectionCard(
      null,
      list,
      {
        highlight,
        fallbackTitle: key === null ? "Autres ressources" : `Section ${key}`,
        fallbackDescription: key === null
          ? "Ressources non rattachées à une section spécifique."
          : "Cette section n'est pas encore configurée dans le cours.",
      }
    );
  });
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

    if (els.title) {
      els.title.textContent = resource.title || "Ressource sans titre";
    }

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

    if (els.section) {
      const sectionObj = sections.find((item) => item.id === resource.section_id);
      els.section.textContent = sectionObj?.title || "—";
    }

    if (els.updated) {
      els.updated.textContent = formatDate(resource.updated_at || resource.created_at);
    }

    if (els.kind) {
      els.kind.textContent = labelForResource(resource.kind);
    }

    if (els.descriptionBlock && els.description) {
      if (resource.description) {
        els.description.textContent = resource.description;
        els.descriptionBlock.hidden = false;
      } else {
        els.descriptionBlock.hidden = true;
      }
    }

    renderCourseMeta(course);
    renderSectionList(course, resource);
    renderResourceViewer(resource);
  } catch (err) {
    console.error("Failed to fetch resource", err);
    showError("Impossible de charger la ressource.");
  }
}

fetchResource();
