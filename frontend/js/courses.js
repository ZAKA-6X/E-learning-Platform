// frontend/js/courses.js
(function () {
  const token = localStorage.getItem("token");
  if (!token) { window.location.href = "/pages/login.html"; return; }

  const API = {
    subjectsMine: "/subjects/mine",
    classesMine:  "/classes/mine",
    courses:      "/api/courses",
  };

  const el = {
    count: document.getElementById("courses-count"),
    container: document.getElementById("courses-container"),
    empty: document.getElementById("courses-empty"),
    emptyTitle: document.querySelector("#courses-empty h3"),
    emptyDesc: document.querySelector("#courses-empty .muted"),
    header: document.querySelector(".courses-header"),
    btnNew: document.getElementById("btn-new-course"),
    btnEmptyNew: document.getElementById("btn-empty-new"),
    search: document.getElementById("course-search"),
    filterButtons: Array.from(document.querySelectorAll(".courses-header .segmented-item")),
    sortSelect: document.getElementById("course-sort"),
    viewButtons: Array.from(document.querySelectorAll(".courses-header .view-btn")),
    dlg: document.getElementById("course-dialog"),
    dlgTitle: document.getElementById("course-dialog-title"),
    dlgClose: document.getElementById("dlg-close"),
    dlgCancel: document.getElementById("dlg-cancel"),
    form: document.getElementById("course-form"),
    cfTitle: document.getElementById("cf-title"),
    cfSubject: document.getElementById("cf-subject"),
    cfClass: document.getElementById("cf-class"),
    cfStatus: document.getElementById("cf-status"),
    detailSection: document.getElementById("course-detail"),
    detailBack: document.getElementById("course-detail-back"),
    detailStatus: document.getElementById("course-detail-status"),
    detailBreadcrumb: document.getElementById("course-detail-breadcrumb"),
    detailTitle: document.getElementById("course-detail-title"),
    detailSubtitle: document.getElementById("course-detail-subtitle"),
    detailSearch: document.getElementById("course-detail-search"),
    detailLoading: document.getElementById("course-detail-loading"),
    detailContent: document.getElementById("course-detail-content"),
    detailError: document.getElementById("course-detail-error"),
    detailResources: document.getElementById("course-detail-resources"),
    detailResourcesEmpty: document.getElementById("course-detail-resources-empty"),
    detailResourcesCount: document.getElementById("course-detail-resources-count"),
    detailAddResource: document.getElementById("course-detail-add-resource"),
    sectionDlg: document.getElementById("section-dialog"),
    sectionForm: document.getElementById("section-form"),
    sectionTitle: document.getElementById("section-title"),
    sectionDescription: document.getElementById("section-description"),
    sectionMediaTitle: document.getElementById("section-media-title"),
    sectionMedia: document.getElementById("section-media"),
    sectionDlgClose: document.getElementById("section-dlg-close"),
    sectionDlgCancel: document.getElementById("section-dlg-cancel"),
  };

  if (el.detailAddResource) {
    el.detailAddResource.disabled = true;
  }

  if (el.emptyTitle && !el.emptyTitle.dataset.defaultText) {
    el.emptyTitle.dataset.defaultText = el.emptyTitle.textContent || "";
  }
  if (el.emptyDesc && !el.emptyDesc.dataset.defaultText) {
    el.emptyDesc.dataset.defaultText = el.emptyDesc.textContent || "";
  }

  let state = {
    raw: [],
    busy: false,
    filter: "all",
    search: "",
    sort: "updated_desc",
    view: "grid",
    selectedId: null,
    detail: null,
    detailSearch: "",
    sectionBusy: false,
  };

  init();

  function toast(message, type = "info") {
    if (!message) return;
    if (window.notify?.toast) {
      window.notify.toast({ message, type });
    } else {
      window.alert(message);
    }
  }

  function authHeaders() {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  async function init() {
    await Promise.all([loadSubjects(), loadClasses()]);
    await loadCourses();

    el.btnNew?.addEventListener("click", openCreate);
    el.btnEmptyNew?.addEventListener("click", openCreate);
    el.dlgClose?.addEventListener("click", () => el.dlg.close());
    el.dlgCancel?.addEventListener("click", () => el.dlg.close());
    el.form?.addEventListener("submit", onSave);

    el.detailBack?.addEventListener("click", closeDetail);
    el.detailAddResource?.addEventListener("click", openSectionDialog);
    el.sectionDlgClose?.addEventListener("click", () => closeSectionDialog(false));
    el.sectionDlgCancel?.addEventListener("click", () => closeSectionDialog(false));
    el.sectionForm?.addEventListener("submit", onSectionSubmit);

    if (el.search) {
      const debounced = debounce((value) => {
        state.search = value.trim();
        renderList();
      }, 200);
      el.search.addEventListener("input", (e) => {
        debounced(e.target.value || "");
      });
    }

    if (el.filterButtons.length) {
      el.filterButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = btn.dataset.filter || btn.dataset.value || "all";
          if (state.filter === next) return;
          state.filter = next;
          updateFilterUI();
          renderList();
        });
      });
      updateFilterUI();
    }

    if (el.sortSelect) {
      el.sortSelect.addEventListener("change", (e) => {
        state.sort = e.target.value || "updated_desc";
        renderList();
      });
      if (el.sortSelect.value) state.sort = el.sortSelect.value;
    }

    if (el.viewButtons.length) {
      el.viewButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const next = btn.dataset.view || "grid";
          if (state.view === next) return;
          state.view = next;
          updateViewUI();
          renderList();
        });
      });
      updateViewUI();
    }

    if (el.detailSearch) {
      const debouncedDetail = debounce((value) => {
        state.detailSearch = value.trim();
        renderDetailResources();
      }, 200);
      el.detailSearch.addEventListener("input", (e) => {
        debouncedDetail(e.target.value || "");
      });
    }

    const resEmptyMsg = el.detailResourcesEmpty?.querySelector("p");
    if (resEmptyMsg && !resEmptyMsg.dataset.defaultText) {
      resEmptyMsg.dataset.defaultText = resEmptyMsg.textContent || "";
    }
  }

  async function fetchJSON(url, opts={}) {
    const res = await fetch(url, opts);
    let body = null;
    try { body = await res.json(); } catch {}
    if (!res.ok) {
      const msg = body?.error || body?.message || `${res.status} ${res.statusText}`;
      throw new Error(msg);
    }
    return body;
  }

  async function loadSubjects() {
    const data = await fetchJSON(API.subjectsMine, { headers: authHeaders() });
    el.cfSubject.innerHTML = "";
    (data.items || []).forEach(s => el.cfSubject.appendChild(new Option(s.name, s.id)));
  }

  async function loadClasses() {
    const data = await fetchJSON(API.classesMine, { headers: authHeaders() });
    el.cfClass.innerHTML = "";
    (data.items || []).forEach(c => el.cfClass.appendChild(new Option(c.name, c.id)));
  }

  async function loadCourses() {
    try {
      const data = await fetchJSON(API.courses, { headers: authHeaders() });
      state.raw = data.items || [];
      renderList();
    } catch (e) {
      console.error("GET /api/courses failed:", e.message);
      state.raw = [];
      renderList();
    }
  }

  function renderList() {
    const items = deriveItems();

    if (el.count) {
      el.count.textContent = `${items.length} cours`;
    }

    const hasRaw = state.raw.length > 0;
    const empty = items.length === 0;

    if (el.empty) {
      el.empty.classList.toggle("hidden", !empty);
      if (empty) {
        const title = el.emptyTitle;
        const desc = el.emptyDesc;
        if (hasRaw) {
          if (title) title.textContent = "Aucun cours correspondant";
          if (desc) desc.textContent = "Ajustez vos filtres ou votre recherche.";
        } else {
          if (title && title.dataset.defaultText)
            title.textContent = title.dataset.defaultText;
          if (desc && desc.dataset.defaultText)
            desc.textContent = desc.dataset.defaultText;
        }
      }
    }

    el.container?.classList.toggle("hidden", empty);
    el.container?.classList.toggle("course-grid", state.view === "grid");
    el.container?.classList.toggle("course-list", state.view === "list");

    if (empty || !el.container) {
      if (el.container) el.container.innerHTML = "";
      return;
    }

    el.container.innerHTML = "";
    items.forEach((c) => {
      const card = document.createElement("div");
      card.className = "course-card";
      card.dataset.courseId = c.id;
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      if (state.selectedId === c.id) card.classList.add("active");
      card.innerHTML = `
        <div class="top">
          <div class="title"><i class="fa-solid fa-book"></i><span>${escapeHtml(c.title || "")}</span></div>
          <span class="badge ${c.status==='published'?'green':'orange'}">
            ${c.status==='published' ? 'Publié' : 'Brouillon'}
          </span>
        </div>
        <div class="meta">
          <span><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(c.subject_name || c.subject_id || '—')}</span>
          &nbsp;•&nbsp;
          <span><i class="fa-solid fa-people-group"></i> ${escapeHtml(c.class_name || c.class_id || '—')}</span>
        </div>
      `;
      card.addEventListener("click", () => openDetail(c.id));
      card.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          openDetail(c.id);
        }
      });
      el.container.appendChild(card);
    });
  }

  function deriveItems() {
    let items = Array.isArray(state.raw) ? [...state.raw] : [];

    if (state.filter !== "all") {
      items = items.filter((item) =>
        (item.status || "").toLowerCase() === state.filter
      );
    }

    if (state.search) {
      const needle = normalize(state.search);
      items = items.filter((item) => {
        const haystack = normalize(
          `${item.title || ""} ${item.subject_name || ""} ${item.class_name || ""}`
        );
        return haystack.includes(needle);
      });
    }

    const sortKey = state.sort;
    const collator = new Intl.Collator("fr", { sensitivity: "base" });
    items.sort((a, b) => {
      switch (sortKey) {
        case "updated_asc":
          return compareDateAsc(a.updated_at, b.updated_at);
        case "title_asc":
          return collator.compare(a.title || "", b.title || "");
        case "title_desc":
          return collator.compare(b.title || "", a.title || "");
        case "students_desc":
          return compareNumberDesc(a.students_count, b.students_count);
        case "students_asc":
          return compareNumberAsc(a.students_count, b.students_count);
        case "updated_desc":
        default:
          return compareDateDesc(a.updated_at, b.updated_at);
      }
    });

    return items;
  }

  function escapeHtml(s) {
    return (s || "").replace(/[&<>\"']/g, (m) =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m])
    );
  }

  function normalize(str) {
    return String(str || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      .toLowerCase();
  }

  function compareDateAsc(lhs, rhs) {
    const a = lhs ? Date.parse(lhs) || 0 : 0;
    const b = rhs ? Date.parse(rhs) || 0 : 0;
    return a - b;
  }

  function compareDateDesc(lhs, rhs) {
    return compareDateAsc(rhs, lhs);
  }

  function compareNumberAsc(lhs, rhs) {
    const aNum = Number(lhs);
    const bNum = Number(rhs);
    const a = Number.isFinite(aNum) ? aNum : 0;
    const b = Number.isFinite(bNum) ? bNum : 0;
    return a - b;
  }

  function compareNumberDesc(lhs, rhs) {
    return compareNumberAsc(rhs, lhs);
  }

  function debounce(fn, wait) {
    let t;
    return (value) => {
      clearTimeout(t);
      t = setTimeout(() => fn(value), wait);
    };
  }

  function updateFilterUI() {
    el.filterButtons.forEach((btn) => {
      const value = btn.dataset.filter || btn.dataset.value || "all";
      const isActive = value === state.filter;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });
  }

  function updateViewUI() {
    el.viewButtons.forEach((btn) => {
      const value = btn.dataset.view || "grid";
      const isActive = value === state.view;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  function openCreate() {
    el.dlgTitle.textContent = "Nouveau cours";
    el.cfTitle.value = "";
    el.cfSubject.selectedIndex = 0;
    el.cfClass.selectedIndex = 0;
    el.cfStatus.value = "draft";
    if (typeof el.dlg.showModal === "function") el.dlg.showModal();
    else el.dlg.setAttribute("open", "");
  }

  async function onSave(e) {
    e.preventDefault();
    if (state.busy) return;

    const payload = {
      title: el.cfTitle.value.trim(),
      subject_id: el.cfSubject.value,
      class_id: el.cfClass.value,
      status: el.cfStatus.value === "Publié" ? "published" : el.cfStatus.value
    };

    if (!payload.title || !payload.subject_id || !payload.class_id) {
      alert("Veuillez remplir les champs obligatoires.");
      return;
    }

    try {
      state.busy = true;
      const res = await fetch(API.courses, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || body?.message || "Erreur");

      state.raw.unshift(body.item);
      el.dlg.close();
      renderList();
    } catch (err) {
      console.error("create course:", err);
      alert(`Erreur lors de la création du cours.\n${err.message}`);
    } finally {
      state.busy = false;
    }
  }

  async function openDetail(courseId) {
    if (!courseId) return;
    state.selectedId = courseId;
    state.detail = null;
    state.detailSearch = "";
    if (el.detailSearch) el.detailSearch.value = "";

    setActiveCardUI();
    setDetailVisibility(true);
    showDetailLoading();

    try {
      const data = await fetchJSON(`${API.courses}/${courseId}`, { headers: authHeaders() });
      state.detail = data?.item || null;
      renderDetail();
    } catch (err) {
      console.error("load course detail:", err);
      showDetailError(err?.message || "Erreur lors du chargement du cours");
    }
  }

  function closeDetail() {
    state.selectedId = null;
    state.detail = null;
    state.detailSearch = "";
    if (el.detailSearch) el.detailSearch.value = "";
    closeSectionDialog(true);
    setDetailVisibility(false);
    setActiveCardUI();
    renderList();
  }

  function setDetailVisibility(show) {
    const isShow = Boolean(show);
    el.detailSection?.classList.toggle("hidden", !isShow);
    el.container?.classList.toggle("hidden", isShow);
    el.header?.classList.toggle("hidden", isShow);
    if (el.detailAddResource) {
      el.detailAddResource.disabled = !isShow;
    }
    if (isShow) {
      el.empty?.classList.add("hidden");
    }
  }

  function showDetailLoading() {
    el.detailLoading?.classList.remove("hidden");
    el.detailContent?.classList.add("hidden");
    el.detailError?.classList.add("hidden");
  }

  function showDetailError(message) {
    el.detailLoading?.classList.add("hidden");
    el.detailContent?.classList.add("hidden");
    if (el.detailError) {
      const msg = el.detailError.querySelector("p");
      if (msg) msg.textContent = message;
      el.detailError.classList.remove("hidden");
    }
  }

  function renderDetail() {
    if (!state.detail) {
      showDetailError("Cours introuvable.");
      return;
    }

    el.detailLoading?.classList.add("hidden");
    el.detailError?.classList.add("hidden");
    el.detailContent?.classList.remove("hidden");

    const detail = state.detail;
    const status = (detail.status || "draft").toLowerCase();

    if (el.detailStatus) {
      el.detailStatus.textContent = status === "published" ? "Publié" : "Brouillon";
      el.detailStatus.classList.toggle("is-draft", status !== "published");
    }
    if (el.detailTitle) el.detailTitle.textContent = detail.title || "Sans titre";

    if (el.detailBreadcrumb) el.detailBreadcrumb.textContent = buildBreadcrumb(detail);
    if (el.detailSubtitle) el.detailSubtitle.textContent = buildSubtitle(detail);

    renderDetailResources();

    setActiveCardUI();
  }

  function renderDetailResources() {
    if (!el.detailResources) return;

    const detail = state.detail;
    const resources = Array.isArray(detail?.resources) ? detail.resources : [];
    const sections = Array.isArray(detail?.sections) ? detail.sections : [];
    const mapSections = new Map(sections.map((s) => [s.id, s.title]));

    const totalCount = resources.length;
    if (el.detailResourcesCount) el.detailResourcesCount.textContent = String(totalCount);

    let filtered = resources;
    if (state.detailSearch) {
      const needle = normalize(state.detailSearch);
      filtered = resources.filter((item) => {
        const haystack = normalize(
          `${item.title || ""} ${item.description || ""} ${mapSections.get(item.section_id) || ""} ${(item.kind || "")}`
        );
        return haystack.includes(needle);
      });
    }

    const msgEl = el.detailResourcesEmpty?.querySelector("p");
    if (msgEl) {
      const defaultText = msgEl.dataset.defaultText || msgEl.textContent || "";
      msgEl.textContent = state.detailSearch && totalCount > 0
        ? "Aucune ressource correspondante."
        : defaultText;
    }

    if (!filtered.length) {
      el.detailResources.innerHTML = "";
      el.detailResourcesEmpty?.classList.remove("hidden");
      return;
    }

    el.detailResourcesEmpty?.classList.add("hidden");
    el.detailResources.innerHTML = "";

    filtered.forEach((item) => {
      const card = document.createElement("article");
      card.className = "resource-card";

      const top = document.createElement("div");
      top.className = "resource-card__top";

      const icon = document.createElement("div");
      icon.className = "resource-card__icon";
      icon.innerHTML = `<i class="fa-solid ${iconForResource(item.kind)}"></i>`;
      top.appendChild(icon);

      const kindWrap = document.createElement("div");
      const kind = document.createElement("div");
      kind.className = "resource-card__kind";
      kind.textContent = labelForResource(item.kind);
      kindWrap.appendChild(kind);
      top.appendChild(kindWrap);
      card.appendChild(top);

      const title = document.createElement("h5");
      title.className = "resource-card__title";
      title.textContent = item.title || "Sans titre";
      card.appendChild(title);

      if (item.description) {
        const desc = document.createElement("div");
        desc.className = "resource-card__meta";
        desc.textContent = item.description;
        card.appendChild(desc);
      }

      const meta = document.createElement("div");
      meta.className = "resource-card__meta";
      const parts = [];
      const sectionName = mapSections.get(item.section_id);
      if (sectionName) parts.push(sectionName);
      if (item.updated_at) parts.push(formatDate(item.updated_at));
      meta.textContent = parts.join(" • ") || "—";
      card.appendChild(meta);

      if (item.resource_url) {
        const actions = document.createElement("div");
        actions.className = "resource-card__actions";
        const link = document.createElement("a");
        link.href = item.resource_url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Ouvrir";
        actions.appendChild(link);
        card.appendChild(actions);
      }

      el.detailResources.appendChild(card);
    });
  }

  function openSectionDialog() {
    if (!state.selectedId) {
      toast("Sélectionnez un cours avant d'ajouter une section.", "warning");
      return;
    }
    if (!el.sectionDlg) return;
    resetSectionForm();
    if (typeof el.sectionDlg.showModal === "function") {
      el.sectionDlg.showModal();
    } else {
      el.sectionDlg.setAttribute("open", "");
    }
    el.sectionTitle?.focus();
  }

  function closeSectionDialog(force) {
    if (!el.sectionDlg) return;
    if (!force && state.sectionBusy) return;
    if (typeof el.sectionDlg.close === "function") {
      try {
        el.sectionDlg.close();
      } catch {}
    } else {
      el.sectionDlg.removeAttribute("open");
    }
    resetSectionForm();
  }

  function resetSectionForm() {
    if (!el.sectionForm) return;
    el.sectionForm.reset();
    if (el.sectionMedia) {
      el.sectionMedia.value = "";
    }
  }

  async function onSectionSubmit(e) {
    e.preventDefault();
    if (state.sectionBusy) return;
    if (!state.selectedId) {
      toast("Aucun cours sélectionné.", "warning");
      return;
    }

    const title = el.sectionTitle?.value?.trim() || "";
    if (!title) {
      toast("Le titre de la section est obligatoire.", "warning");
      return;
    }

    const file = el.sectionMedia?.files?.[0] || null;
    if (!file) {
      toast("Veuillez choisir un fichier (PDF, image ou vidéo).", "warning");
      return;
    }

    const formData = new FormData();
    formData.append("title", title);
    if (el.sectionDescription?.value?.trim()) {
      formData.append("description", el.sectionDescription.value.trim());
    }
    if (el.sectionMediaTitle?.value?.trim()) {
      formData.append("resource_title", el.sectionMediaTitle.value.trim());
    }
    formData.append("media", file);

    try {
      state.sectionBusy = true;
      const res = await fetch(`${API.courses}/${state.selectedId}/sections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || body?.message || "Erreur serveur");

      const section = body.section || null;
      const resource = body.resource || null;

      if (section) {
        if (!Array.isArray(state.detail.sections)) state.detail.sections = [];
        state.detail.sections.push(section);
        state.detail.section_count = state.detail.sections.length;
      }

      if (resource) {
        if (!Array.isArray(state.detail.resources)) state.detail.resources = [];
        state.detail.resources.push(resource);
        state.detail.resource_count = state.detail.resources.length;
      }

      renderDetailResources();
      closeSectionDialog(true);
      toast("Section ajoutée avec succès", "success");
    } catch (err) {
      console.error("create section:", err);
      toast(err.message || "Impossible de créer la section", "error");
    } finally {
      state.sectionBusy = false;
    }
  }

  function setActiveCardUI() {
    if (!el.container) return;
    const cards = el.container.querySelectorAll(".course-card");
    cards.forEach((card) => {
      const id = card.dataset.courseId || null;
      card.classList.toggle("active", id && id === state.selectedId);
    });
  }

  function buildBreadcrumb(detail) {
    const parts = [];
    if (detail.subject_name) parts.push(detail.subject_name);
    if (detail.category) parts.push(detail.category);
    if (detail.level) parts.push(detail.level);
    return parts.length ? parts.join(" • ") : "—";
  }

  function buildSubtitle(detail) {
    const parts = [];
    if (detail.class_name) parts.push(`Classe ${detail.class_name}`);
    const students = Number(detail.students_count);
    if (Number.isFinite(students) && students > 0) {
      parts.push(`${students} élève${students > 1 ? "s" : ""}`);
    }
    if (detail.teacher_name) parts.push(detail.teacher_name);
    return parts.length ? parts.join(" • ") : "—";
  }

  function iconForResource(kind) {
    switch ((kind || "document").toLowerCase()) {
      case "video":
        return "fa-circle-play";
      case "audio":
        return "fa-music";
      case "link":
        return "fa-link";
      case "quiz":
        return "fa-question";
      case "document":
      default:
        return "fa-file-lines";
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
      case "document":
      default:
        return "Document";
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
})();
