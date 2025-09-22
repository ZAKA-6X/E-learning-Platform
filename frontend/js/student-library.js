(function () {
  const panel = document.querySelector("[data-library]");
  if (!panel) return;

  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "/pages/login.html";
    return;
  }

  const els = {
    loading: panel.querySelector("[data-library-loading]"),
    error: panel.querySelector("[data-library-error]"),
    errorText: panel.querySelector("[data-library-error] span"),
    empty: panel.querySelector("[data-library-empty]"),
    emptyText: panel.querySelector("[data-library-empty] p"),
    grid: panel.querySelector("[data-library-grid]"),
  };

  const defaultEmpty = els.emptyText?.textContent || "";
  const defaultError = els.errorText?.textContent || "";

  const show = (el) => {
  if (!el) return;
  el.hidden = false;
  el.style.removeProperty("display"); // cancel forced display:none
};
const hide = (el) => {
  if (!el) return;
  el.hidden = true;
  el.style.display = "none"; // enforce hidden even if CSS overrides
};

  // --- State machine --------------------------------------------------------
const STATES = Object.freeze({
  LOADING: "loading",
  ERROR: "error",
  EMPTY: "empty",
  DATA: "data",
});

  const clearTexts = () => {
    if (els.emptyText) els.emptyText.textContent = defaultEmpty;
    if (els.errorText) els.errorText.textContent = defaultError;
  };

  const clearGrid = () => {
    if (els.grid) els.grid.innerHTML = "";
  };

const setState = (state) => {
  panel.dataset.libraryState = state; // helpful marker for debugging

  switch (state) {
    case STATES.LOADING:
      show(els.loading);  hide(els.error); hide(els.empty); hide(els.grid);
      break;
    case STATES.ERROR:
      hide(els.loading);  show(els.error); hide(els.empty); hide(els.grid);
      break;
    case STATES.EMPTY:
      hide(els.loading);  hide(els.error); show(els.empty); hide(els.grid);
      break;
    case STATES.DATA:
      hide(els.loading);  hide(els.error); hide(els.empty); show(els.grid);
      break;
    default:
      hide(els.loading);  hide(els.error); hide(els.empty); hide(els.grid);
  }
};
  // -------------------------------------------------------------------------

  const formatDate = (value) => {
    if (!value) return "";
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(date);
    } catch {
      return "";
    }
  };

  const createMetaItem = (icon, text) => {
    if (!text) return null;
    const li = document.createElement("li");
    const iconEl = document.createElement("i");
    iconEl.className = `fa-solid ${icon}`;
    iconEl.setAttribute("aria-hidden", "true");
    li.appendChild(iconEl);
    const span = document.createElement("span");
    span.textContent = text;
    li.appendChild(span);
    return li;
  };

  const createCourseCard = (course) => {
    const card = document.createElement("article");
    card.className = "library-card";
    card.dataset.courseId = course.id;

    const header = document.createElement("div");
    header.className = "library-card__header";

    const title = document.createElement("h3");
    title.className = "library-card__title";
    title.textContent = course.title || "Cours sans titre";
    header.appendChild(title);

    const badgeLabel = course.subject_name || course.code || "";
    if (badgeLabel) {
      const badge = document.createElement("span");
      badge.className = "library-card__badge";
      badge.textContent = badgeLabel;
      header.appendChild(badge);
    }

    card.appendChild(header);

    const metaList = document.createElement("ul");
    metaList.className = "library-card__meta";

    const classDetails = [course.class_name, course.class_room].filter(Boolean).join(" • ");
    const updatedLabel = formatDate(course.updated_at || course.created_at);

    const metaItems = [
      createMetaItem("fa-user", course.teacher_name ? `Enseignant · ${course.teacher_name}` : ""),
      createMetaItem("fa-users", classDetails ? `Classe · ${classDetails}` : ""),
      createMetaItem("fa-hashtag", course.code ? `Code · ${course.code}` : ""),
      createMetaItem("fa-calendar-day", updatedLabel ? `Mise à jour · ${updatedLabel}` : ""),
    ].filter(Boolean);

    if (metaItems.length) metaItems.forEach((item) => metaList.appendChild(item));
    if (metaItems.length) card.appendChild(metaList);

    return card;
  };

  const renderCourses = (courses) => {
    if (!els.grid) return;
    clearGrid();
    courses.forEach((course) => {
      const card = createCourseCard(course);
      if (card) els.grid.appendChild(card);
    });
    setState(STATES.DATA);
  };

const handleEmptyState = (reason) => {
  if (els.emptyText) {
    switch (reason) {
      case "NO_CLASS":
        els.emptyText.textContent =
          "Aucun cours disponible tant que votre classe n'est pas encore assignée.";
        break;
      case "NO_COURSES":
        els.emptyText.textContent =
          "Aucun cours publié pour votre classe pour le moment.";
        break;
      default:
        els.emptyText.textContent =
          defaultEmpty || "Aucun cours disponible pour le moment.";
    }
  }
  setState(STATES.EMPTY);
};


  const handleError = (message) => {
    if (els.errorText) {
      els.errorText.textContent = message || defaultError || "Impossible de charger les cours.";
    }
    setState(STATES.ERROR);
  };

  // Keep only the latest request's result (avoid stale UI)
  let requestSeq = 0;
  let controller = null;

  const loadCourses = async () => {
    requestSeq += 1;
    const seq = requestSeq;

    // Cancel any in-flight request
    try { controller?.abort(); } catch {}
    controller = new AbortController();

    // Prepare UI for fresh load
    clearTexts();
    clearGrid();            // remove any static/demo cards immediately
    setState(STATES.LOADING);

    try {
      const response = await fetch("/api/courses/student", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });

      // If another request started after this one, ignore this result
      if (seq !== requestSeq) return;

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/pages/login.html";
        return;
      }

      // Handle 204 No Content safely
      const hasBody = response.status !== 204;
      const payload = hasBody ? (await response.json().catch(() => ({}))) : {};

      if (!response.ok) {
        const errorMsg = payload?.error || payload?.message || "Impossible de charger les cours.";
        handleError(errorMsg);
        return;
      }

      const courses = Array.isArray(payload.items) ? payload.items : [];

      if (!courses.length) {
        handleEmptyState(payload?.meta?.reason);
        return;
      }

      renderCourses(courses);
    } catch (err) {
      if (err?.name === "AbortError") return; // ignored: superseded by a newer request
      handleError(err?.message);
    }
  };

  loadCourses();
})();
