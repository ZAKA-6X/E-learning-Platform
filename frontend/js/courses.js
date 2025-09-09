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
    btnNew: document.getElementById("btn-new-course"),
    btnEmptyNew: document.getElementById("btn-empty-new"),
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

  let state = { raw: [], busy: false };

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
    const items = state.raw;
    el.count && (el.count.textContent = `${items.length} cours`);
    const empty = items.length === 0;
    el.empty.classList.toggle("hidden", !empty);
    el.container.classList.toggle("hidden", empty);
    if (empty) return;
    el.container.innerHTML = "";
    items.forEach(c => {
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

  function escapeHtml(s) {
    return (s || "").replace(/[&<>\"']/g, (m) =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;" }[m])
    );
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
