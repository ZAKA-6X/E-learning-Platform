/* posts.js - Publications composer lifecycle with fresh form per click */
document.addEventListener("DOMContentLoaded", () => {
  // ---------- tiny helpers ----------
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function on(el, ev, fn, opts) {
    if (el) el.addEventListener(ev, fn, opts);
  }

  function getEditor(scope) {
    return qs("#post-body", scope);
  }

  // ---------- nav to Publications and toggle composer ----------
  function showSection(sectionId) {
    var nav =
      qs("#nav-" + sectionId) ||
      qs('[data-section-link="' + sectionId + '"]') ||
      qs('a[href="#' + sectionId + '"]');
    if (nav) {
      nav.click();
    } else {
      qsa(".content-section").forEach(function (sec) {
        sec.classList.remove("active");
        if (sec.id === sectionId) sec.classList.add("active");
      });
      qsa(".left-sidebar .sidebar-item").forEach(function (a) {
        a.classList.remove("active");
      });
      var side = qs("#nav-" + sectionId);
      if (side) side.classList.add("active");
    }
  }

  function setPublicationsContentVisible(visible) {
    var pub = qs("#publications");
    if (!pub) return;
    var kids = Array.prototype.slice.call(pub.children || []);
    kids.forEach(function (el) {
      if (el.id === "post-composer-host") return;
      el.style.display = visible ? "" : "none";
    });
  }

  // ---------- always mount a fresh composer ----------
  function loadComposerFresh(cb) {
    var host = qs("#post-composer-host");
    if (!host) {
      cb(null);
      return;
    }

    var src = host.getAttribute("data-src");
    var selector = host.getAttribute("data-selector") || "form.post-card";
    if (!src) {
      console.warn("[posts.js] Missing data-src on #post-composer-host");
      cb(null);
      return;
    }

    function mount(html) {
      var tpl = document.createElement("template");
      tpl.innerHTML = html;
      var form = tpl.content.querySelector(selector);
      if (!form) {
        console.error(
          '[posts.js] Could not find selector "' + selector + '" in template'
        );
        cb(null);
        return;
      }
      host.innerHTML = ""; // discard any previous draft
      host.appendChild(form); // fresh form instance
      cb(form);
    }

    if (host._composerTemplateHTML) {
      mount(host._composerTemplateHTML);
      return;
    }

    fetch(src, { credentials: "same-origin" })
      .then((r) => r.text())
      .then((html) => {
        host._composerTemplateHTML = html;
        mount(html);
      })
      .catch((e) => {
        console.error("[posts.js] Load composer failed:", e);
        cb(null);
      });
  }

  function showComposer() {
    showSection("publications");
    var host = qs("#post-composer-host");
    if (!host) return;

    setPublicationsContentVisible(false);
    host.style.display = "";

    // Always load a fresh form (new DOM instance)
    loadComposerFresh(function (form) {
      if (!form) return;

      // Wire Cancel once per fresh form
      var cancelBtn = qs("#cancel-btn", form);
      if (cancelBtn) {
        on(cancelBtn, "click", function () {
          hideComposer();
        });
      }

      // Toolbar (prevent focus loss so caret stays in editor)
      qsa(".tool-btn[data-cmd]", form).forEach(function (btn) {
        on(btn, "mousedown", function (e) {
          e.preventDefault();
        });
        on(btn, "click", function () {
          var cmd = btn.getAttribute("data-cmd");
          var editor = getEditor(form);
          if (cmd === "createLink") {
            var url = window.prompt("Lien URL:");
            if (url) document.execCommand("createLink", false, url);
          } else {
            document.execCommand(cmd, false, null);
          }
        });
      });

      // PDF media UX (multi-file chips) — styled to match your CSS
      setupFileMediaUI(form);
      // Submit → backend for this fresh form
      wireSubmit(form);
    });
  }

  function hideComposer() {
    var host = qs("#post-composer-host");
    if (!host) return;
    host.innerHTML = ""; // discard current draft entirely
    setPublicationsContentVisible(true);
  }

  // ---------- File media UX (multi-file, any type, click zone, drag-drop) ----------
  function setupFileMediaUI(form) {
    const input = form.querySelector("#post-media");
    if (!input) return;

    // Autoriser tous les types
    input.removeAttribute("accept");
    input.multiple = true;
    input.style.display = "none";

    // Zone (utilise ta CSS .post-media)
    const zone =
      input.closest(".post-media") ||
      (() => {
        const z = document.createElement("div");
        z.className = "post-media";
        input.parentNode.insertBefore(z, input);
        z.appendChild(input);
        return z;
      })();

    // Libellé
    let label = zone.querySelector("label");
    if (!label) {
      label = document.createElement("label");
      label.textContent = "Cliquez ou glissez des fichiers ici";
      zone.appendChild(label);
    } else if (!label.textContent.trim()) {
      label.textContent = "Cliquez ou glissez des fichiers ici";
    }

    // Ligne "infos + Supprimer tout"
    const controls = document.createElement("div");
    Object.assign(controls.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      marginTop: "6px",
    });

    const hint = document.createElement("div");
    hint.className = "form-hint";
    hint.setAttribute("aria-live", "polite");
    hint.textContent = "Aucun fichier sélectionné.";

    const clearAll = document.createElement("button");
    clearAll.type = "button";
    clearAll.className = "btn-chip danger";
    clearAll.textContent = "Supprimer tout";
    clearAll.style.display = "none";

    controls.appendChild(hint);
    controls.appendChild(clearAll);
    zone.parentNode.insertBefore(controls, zone.nextSibling);

    // Liste des fichiers (on réutilise tes styles .pdf-list / .pdf-chip pour garder le thème)
    const list = document.createElement("div");
    list.className = "pdf-list"; // style existant
    list.style.display = "none";
    controls.parentNode.insertBefore(list, controls.nextSibling);

    // État interne — la source de vérité des fichiers sélectionnés
    let dt = new DataTransfer();
    // Exposer au form pour l'utiliser ailleurs
    form._getSelectedFiles = () => Array.from(dt.files);

    // Remettre la zone à zéro (utilisé après upload, cancel et "Supprimer tout")
    function clearFiles() {
      dt = new DataTransfer();
      // Some browsers treat input.files as readonly – ignore if so
      try {
        input.files = dt.files;
      } catch (_) {}
      renderList();
    }
    form._resetSelectedFiles = clearFiles;

    function humanSize(bytes) {
      if (bytes < 1024) return bytes + " B";
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function extFromName(name = "") {
      const m = name.match(/\.([a-z0-9]+)$/i);
      return m ? m[1].toLowerCase() : "";
    }

    function iconFor(file) {
      const type = file.type || "";
      const ext = extFromName(file.name);
      if (type.startsWith("image/")) return "🖼️";
      if (type.startsWith("video/")) return "🎬";
      if (type.startsWith("audio/")) return "🎵";
      if (type === "application/pdf" || ext === "pdf") return "📄";
      if (/zip|rar|7z|tar|gz|bz2|xz/i.test(ext)) return "🗜️";
      if (/doc|docx/i.test(ext)) return "📝";
      if (/xls|xlsx|csv/i.test(ext)) return "📊";
      if (/ppt|pptx/i.test(ext)) return "📽️";
      if (/txt|md|rtf|log/i.test(ext)) return "📃";
      if (
        /code|json|js|ts|py|java|cpp|c|cs|go|rs|php|rb|html|css|xml|yml|yaml/i.test(
          ext
        )
      )
        return "💻";
      return "📦";
    }

    function prettyType(file) {
      if (file.type) return file.type.toUpperCase();
      const e = extFromName(file.name);
      return e ? e.toUpperCase() : "FICHIER";
    }

    function updateZoneState() {
      zone.classList.toggle("has-file", dt.files.length > 0);
    }

    function renderList() {
      list.innerHTML = "";
      const n = dt.files.length;

      if (n === 0) {
        list.style.display = "none";
        clearAll.style.display = "none";
        hint.textContent = "Aucun fichier sélectionné.";
      } else {
        list.style.display = "";
        clearAll.style.display = "";
        hint.textContent = `${n} fichier${n > 1 ? "s" : ""} sélectionné${
          n > 1 ? "s" : ""
        }.`;

        Array.from(dt.files).forEach((file, idx) => {
          const row = document.createElement("div");
          row.className = "pdf-chip"; // style existant

          const icon = document.createElement("span");
          icon.className = "pdf-ico";
          icon.textContent = iconFor(file);

          const info = document.createElement("div");
          info.className = "pdf-info";

          const name = document.createElement("div");
          name.className = "pdf-name";
          name.textContent = file.name;

          const meta = document.createElement("div");
          meta.className = "pdf-meta";
          meta.textContent = `${humanSize(file.size)} · ${prettyType(file)}`;

          info.appendChild(name);
          info.appendChild(meta);

          const actions = document.createElement("div");
          actions.className = "pdf-actions";

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.className = "btn-chip danger";
          removeBtn.textContent = "Supprimer";
          removeBtn.addEventListener("click", () => {
            const ndt = new DataTransfer();
            Array.from(dt.files).forEach((f, i) => {
              if (i !== idx) ndt.items.add(f);
            });
            dt = ndt;
            input.files = dt.files;
            updateZoneState();
            renderList();
          });

          actions.appendChild(removeBtn);
          row.appendChild(icon);
          row.appendChild(info);
          row.appendChild(actions);
          list.appendChild(row);
        });
      }
      updateZoneState();
    }

    function addFiles(files) {
      let added = 0;
      Array.from(files || []).forEach((file) => {
        // Éviter les doublons par (name + size + lastModified)
        const dupe = Array.from(dt.files).some(
          (f) =>
            f.name === file.name &&
            f.size === file.size &&
            f.lastModified === file.lastModified
        );
        if (!dupe) {
          dt.items.add(file);
          added++;
        }
      });
      if (added) {
        input.files = dt.files;
        renderList();
      }
    }

    // Ouvrir le picker en cliquant la zone (sauf clics sur boutons)
    zone.addEventListener("click", (e) => {
      if (
        e.target.closest(".pdf-chip") ||
        e.target.classList.contains("btn-chip")
      )
        return;
      input.click();
    });

    input.addEventListener("change", () => {
      addFiles(input.files);
      // Réinitialiser pour permettre de re-sélectionner le même fichier ensuite
      input.value = "";
    });

    // Drag & drop visuels
    function setDrag(isOver) {
      zone.classList.toggle("is-dragover", !!isOver);
    }
    ["dragenter", "dragover"].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(true);
      })
    );
    ["dragleave", "dragend"].forEach((ev) =>
      zone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDrag(false);
      })
    );
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag(false);
      if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
    });

    clearAll.addEventListener("click", clearFiles);

    // Init
    renderList();
  }

  // ---------- submit wiring (only after form exists) ----------
  function wireSubmit(form) {
    if (!form) return;

    const $ = (sel, root) => (root || document).querySelector(sel);
    const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

    const titleEl = $("#post-title", form);
    const audienceEl = $("#post-audience", form);
    const bodyEl = $("#post-body", form);
    const mediaEl = $("#post-media", form);
    const cancelBtn = $("#cancel-btn", form);
    const submitBtn = $("#submit-btn", form);

    function mapAudience(label) {
      switch (label) {
        case "Mon école":
          return "school";
        case "Toute la classe":
          return "all_classes";
        case "Ma classe":
          return "class";
        default:
          return "school";
      }
    }
    function busy(isBusy) {
      if (!submitBtn) return;
      submitBtn.disabled = !!isBusy;
      submitBtn.textContent = isBusy ? "Publication…" : "Publier";
    }

    async function handleSubmit(e) {
      e.preventDefault();
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Vous n'êtes pas authentifié.");
        return;
      }

      const title = (titleEl?.value || "").trim();
      const audienceLabel = audienceEl?.value || "Mon école";
      const audience = mapAudience(audienceLabel);
      const body_html = bodyEl?.innerHTML?.trim() || "";

      if (!title) {
        alert("Le titre est requis.");
        return;
      }

      // Build multipart form data
      const fd = new FormData();
      fd.append("title", title);
      fd.append("audience", audience);
      fd.append("body_html", body_html);

      // Fichiers sélectionnés : utiliser la DataTransfer exposée par setupFileMediaUI
      const picked =
        typeof form._getSelectedFiles === "function"
          ? form._getSelectedFiles()
          : mediaEl && mediaEl.files
          ? Array.from(mediaEl.files)
          : [];
      picked.forEach((file) => fd.append("media", file));

      try {
        busy(true);
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }, // don't set Content-Type for FormData
          body: fd,
        });
        const text = await res.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (parseErr) {
          console.warn("[posts.js] JSON parse error", parseErr, text);
        }
        if (!res.ok) {
          console.error("Create post error:", data || text);
          const message =
            (data && (data.error || data.message)) ||
            text ||
            "Erreur lors de la publication.";
          alert(message);
          return;
        }

        form.reset?.();
        if (bodyEl) bodyEl.innerHTML = "";
        if (typeof form._resetSelectedFiles === "function") {
          form._resetSelectedFiles();
        }
        alert("Publication créée !");
        document.dispatchEvent(
          new CustomEvent("post:created", { detail: data })
        );
        hideComposer();
      } catch (err) {
        console.error(err);
        alert("Erreur réseau.");
      } finally {
        busy(false);
      }
    }

    on(form, "submit", handleSubmit);
    on(cancelBtn, "click", (e) => {
      e.preventDefault();
      form.reset?.();
      if (bodyEl) bodyEl.innerHTML = "";
      if (typeof form._resetSelectedFiles === "function") {
        form._resetSelectedFiles();
      }
      document.dispatchEvent(new Event("post:cancelled"));
    });
  }

  // ---------- boot ----------
  function boot() {
    var createBtn = qs("#btn-creer");
    if (createBtn)
      on(createBtn, "click", function (e) {
        e.preventDefault();
        showComposer();
      });

    // Standalone template usage (if you open student-post.html directly)
    var standaloneForm = qs("form.post-card");
    if (standaloneForm && !createBtn) {
      setupEditorImageUI(document);
      setupFileMediaUI(standaloneForm); // fix: pass the right form
      wireSubmit(standaloneForm);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
});
