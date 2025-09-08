/**
 * ClicaEd - Post Composer (Publication Section)
 * - On "+ Créer": switch to the Publications section, then render composer
 * - Composer is injected into #post-composer-host (inside Publications)
 * - Hides #feed while composer is open; restores on cancel/submit
 * - Subjects/Matières select is populated from backend (tries /admin/matieres)
 */

(function () {
  const HOST_ID = "post-composer-host"; // container inside Publications
  const FEED_ID = "feed"; // feed container inside Publications
  const SECTION_PUBLICATIONS_ID = "publications";
  const NAV_PUBLICATIONS_ID = "nav-publications";

  const CREATE_POST_ENDPOINT = "/api/posts"; // <— match backend route
  const MAX_TITLE = 150;

  // ----------------- utils -----------------
  function getToken() {
    return localStorage.getItem("token");
  }
  function getSchoolId() {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}").school_id || null;
    } catch {
      return null;
    }
  }

  function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.id) node.id = opts.id;
    if (opts.attrs)
      Object.entries(opts.attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (opts.text) node.textContent = opts.text;
    if (opts.html) node.innerHTML = opts.html;
    return node;
  }

  function audienceCheckbox(id, label) {
    const wrap = el("label", { className: "audience-item" });
    const input = el("input", { attrs: { type: "checkbox", id } });
    wrap.appendChild(input);
    wrap.appendChild(el("span", { text: label }));
    return { wrap, input };
  }

  // ----------------- payload -----------------
  // Build a body that the controller expects.
  function buildPayload({ type, title, media, body, school_id, audience }) {
    const payload = {
      type,
      title,
      body: body || null,
      media: media || null,
      school_id: school_id || null,

      // flags for the controller
      audience_school: !!audience.isSchool,
      audience_class: !!audience.isClass,
      audience_subject: !!audience.isSubject,
    };

    if (audience.isClass && audience.classId) payload.class_id = audience.classId;
    if (audience.isSubject && audience.subjectId)
      payload.subject_id = audience.subjectId;

    return payload;
  }

  // ----------------- section switching (use your nav; fallback if needed) -----------------
  async function ensurePublicationsActive() {
    const navPub = document.getElementById(NAV_PUBLICATIONS_ID);
    const publications = document.getElementById(SECTION_PUBLICATIONS_ID);

    // Trigger your existing nav logic
    if (navPub) {
      navPub.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window })
      );
    }

    // Wait until Publications is visible/active
    const isShown = () => {
      const sec = document.getElementById(SECTION_PUBLICATIONS_ID);
      if (!sec) return false;
      const cs = window.getComputedStyle(sec);
      return (
        sec.classList.contains("active") ||
        (cs.display !== "none" && cs.visibility !== "hidden")
      );
    };

    const deadline = Date.now() + 1000; // wait up to 1s
    while (Date.now() < deadline) {
      if (isShown()) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Fallback: hard-activate
    if (!isShown() && publications) {
      document.querySelectorAll(".content-section").forEach((sec) => {
        sec.classList.remove("active");
        sec.style.display = "none";
      });
      publications.classList.add("active");
      publications.style.display = "block";

      // Sidebar active state
      document
        .querySelectorAll(".left-sidebar .sidebar-item")
        .forEach((a) => a.classList.remove("active"));
      if (navPub) navPub.classList.add("active");
    }

    // Scroll into view
    const pubNow = document.getElementById(SECTION_PUBLICATIONS_ID);
    if (pubNow && typeof pubNow.scrollIntoView === "function") {
      pubNow.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    // Ensure the host exists
    let host = document.getElementById(HOST_ID);
    if (!host) {
      await new Promise((r) => setTimeout(r, 50));
      host = document.getElementById(HOST_ID);
    }
    return host;
  }

  // ----------------- data: subjects (simple) -----------------
  async function populateSubjects(selectEl) {
    selectEl.innerHTML = "";
    selectEl.appendChild(
      el("option", {
        attrs: { value: "", selected: true, disabled: true },
        text: "Choisir une matière…",
      })
    );

    const token = localStorage.getItem("token");

    try {
      const res = await fetch("/admin/matieres", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.error("Failed to fetch matieres:", res.status);
        selectEl.innerHTML = "";
        selectEl.appendChild(
          el("option", {
            attrs: { value: "", selected: true, disabled: true },
            text: "Échec du chargement",
          })
        );
        return;
      }

      const matieres = await res.json();

      selectEl.innerHTML = "";
      selectEl.appendChild(
        el("option", {
          attrs: { value: "", selected: true, disabled: true },
          text: "Choisir une matière…",
        })
      );
      matieres.forEach((matiere) => {
        selectEl.appendChild(
          el("option", { attrs: { value: matiere.id }, text: matiere.name })
        );
      });
    } catch (error) {
      console.error("Error loading matieres:", error);
      selectEl.innerHTML = "";
      selectEl.appendChild(
        el("option", {
          attrs: { value: "", selected: true, disabled: true },
          text: "Échec du chargement",
        })
      );
    }
  }

  // ----------------- composer -----------------
  function renderPostForm() {
    const host = document.getElementById(HOST_ID);
    const feed = document.getElementById(FEED_ID);
    if (!host) return;

    // Hide the feed while composer is open
    if (feed) feed.style.display = "none";
    host.innerHTML = "";

    const form = el("form", { className: "post-card" });
    const bodyWrap = el("div", { className: "post-body" });

    // Type
    const typeGroup = el("div", { className: "post-field" });
    typeGroup.appendChild(
      el("label", {
        className: "post-label",
        attrs: { for: "post-type" },
        text: "Type",
      })
    );
    const typeSelect = el("select", {
      attrs: { id: "post-type", required: "required" },
    });
    ["documentation", "question", "idea", "help", "other"].forEach((t) =>
      typeSelect.appendChild(el("option", { attrs: { value: t }, text: t }))
    );
    typeGroup.appendChild(typeSelect);

    // Title
    const titleGroup = el("div", { className: "post-field" });
    const titleLabel = el("label", {
      className: "post-label",
      attrs: { for: "post-title" },
    });
    const titleCount = el("span", {
      className: "char-count",
      text: `0/${MAX_TITLE}`,
    });
    titleLabel.append("Titre ", titleCount);
    const titleInput = el("input", {
      className: "post-title",
      attrs: {
        id: "post-title",
        type: "text",
        maxlength: MAX_TITLE,
        placeholder: "Votre titre…",
        required: "required",
      },
    });
    titleInput.addEventListener("input", () => {
      titleCount.textContent = `${titleInput.value.length}/${MAX_TITLE}`;
    });
    titleGroup.append(titleLabel, titleInput);

    // Media
    const mediaGroup = el("div", { className: "post-field" });
    mediaGroup.appendChild(
      el("label", {
        className: "post-label",
        attrs: { for: "post-media" },
        text: "Média (URL)",
      })
    );
    const mediaInput = el("input", {
      className: "post-title",
      attrs: {
        id: "post-media",
        type: "url",
        placeholder: "https://exemple.com/...",
      },
    });
    mediaGroup.appendChild(mediaInput);

    // Body (simple editor area)
    const bodyGroup = el("div", { className: "post-field" });
    bodyGroup.appendChild(
      el("label", { className: "post-label", text: "Contenu" })
    );
    const bodyArea = el("div", {
      id: "post-body",
      className: "editor-area",
      attrs: { contenteditable: "true", "data-placeholder": "Exprimez-vous…" },
    });
    bodyGroup
      .appendChild(el("div", { className: "editor" }))
      .appendChild(bodyArea);

    // Audience
    const audGroup = el("div", { className: "post-field" });
    audGroup.appendChild(
      el("label", { className: "post-label", text: "Audience" })
    );
    const audRow = el("div", { className: "audience-row" });
    const cbSchool = audienceCheckbox("aud-school", "École");
    const cbClass = audienceCheckbox("aud-class", "Classe");
    const cbSubject = audienceCheckbox("aud-subject", "Matière");
    audRow.append(cbSchool.wrap, cbClass.wrap, cbSubject.wrap);
    audGroup.appendChild(audRow);

    // Class (optional) — simple text input for class_id (swap to a select when you have an API)
    const classGroup = el("div", {
      className: "post-field",
      attrs: { id: "class-input-group" },
    });
    classGroup.style.display = "none";
    classGroup.append(
      el("label", { className: "post-label", attrs: { for: "class-id" }, text: "Classe (ID)" }),
      el("input", { attrs: { id: "class-id", type: "text", placeholder: "UUID de la classe" } })
    );

    // Subject select
    const subjGroup = el("div", {
      className: "post-field",
      attrs: { id: "subject-select-group" },
    });
    subjGroup.style.display = "none";
    const subjSelect = el("select", { attrs: { id: "subject-select" } });
    subjGroup.append(
      el("label", { className: "post-label", text: "Matière" }),
      subjSelect
    );

    // toggle logic: only one checkbox at a time; show relevant input
    [cbSchool.input, cbClass.input, cbSubject.input].forEach((inp) => {
      inp.addEventListener("change", async () => {
        if (inp.checked) {
          [cbSchool.input, cbClass.input, cbSubject.input].forEach((o) => {
            if (o !== inp) o.checked = false;
          });
        }

        // subject UI
        if (cbSubject.input.checked) {
          subjGroup.style.display = "";
          await populateSubjects(subjSelect);
        } else {
          subjGroup.style.display = "none";
          subjSelect.innerHTML = "";
        }

        // class UI
        classGroup.style.display = cbClass.input.checked ? "" : "none";
      });
    });

    // Footer
    const actions = el("div", { className: "post-footer" });
    const cancelBtn = el("button", {
      className: "btn btn-ghost",
      attrs: { type: "button" },
      text: "Annuler",
    });
    const submitBtn = el("button", {
      className: "btn btn-primary",
      attrs: { type: "submit" },
      text: "Publier",
    });
    actions.append(cancelBtn, submitBtn);

    bodyWrap.append(
      typeGroup,
      titleGroup,
      mediaGroup,
      bodyGroup,
      audGroup,
      classGroup,
      subjGroup
    );
    form.append(bodyWrap, actions);
    host.appendChild(form);

    // cancel
    cancelBtn.addEventListener("click", () => {
      host.innerHTML = "";
      if (feed) feed.style.display = "";
    });

    // submit
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const classIdInput = document.getElementById("class-id");
      const payload = buildPayload({
        type: typeSelect.value,
        title: titleInput.value.trim(),
        media: mediaInput.value.trim() || null,
        body: bodyArea.innerText.trim() || null,
        school_id: getSchoolId(),
        audience: {
          isSchool: cbSchool.input.checked,
          isClass: cbClass.input.checked,
          isSubject: cbSubject.input.checked,
          classId: classIdInput ? (classIdInput.value || null) : null,
          subjectId: subjSelect.value || null,
        },
      });

      // basic client-side guard to match controller rules
      const selected = [payload.audience_school, payload.audience_class, payload.audience_subject].filter(Boolean).length;
      if (selected > 1) {
        alert("Choisissez une seule audience : École OU Classe OU Matière.");
        return;
      }
      if (payload.audience_class && !payload.class_id) {
        alert("Veuillez saisir l'ID de la classe.");
        return;
      }
      if (payload.audience_subject && !payload.subject_id) {
        alert("Veuillez choisir une matière.");
        return;
      }

      try {
        const res = await fetch(CREATE_POST_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        alert("Publication créée !");
        host.innerHTML = "";
        if (feed) feed.style.display = "";
        // TODO: optionally reload the feed here
      } catch (err) {
        alert(err.message || "Erreur lors de la publication");
      }
    });
  }

  // ----------------- public API -----------------
  window.renderPostForm = renderPostForm;

  // Click handler: go to Publications (via your nav), then render composer
  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("btn-creer");
    if (!btn) return;

    btn.addEventListener("click", async () => {
      const host = await ensurePublicationsActive(); // reliably switch to Publications
      if (!host) return;
      renderPostForm();
    });
  });
})();
