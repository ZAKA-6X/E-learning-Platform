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
  };

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
  };

  init();

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
})();
