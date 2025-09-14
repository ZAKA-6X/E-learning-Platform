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
          } else if (cmd === "insertImage") {
            captureSelection(editor);
            ensureImagePicker(form).click();
          } else {
            document.execCommand(cmd, false, null);
          }
        });
      });

      // Rich text image UX
      setupEditorImageUI(form);
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

  // ---------- selection helpers (for image insert) ----------
  function selectionInsideEditor(editor) {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || !sel.rangeCount) return false;
    var r = sel.getRangeAt(0);
    return (
      editor &&
      editor.contains(r.startContainer) &&
      editor.contains(r.endContainer)
    );
  }
  function captureSelection(editor) {
    if (!editor) return;
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || !sel.rangeCount) return;
    var r = sel.getRangeAt(0);
    if (editor.contains(r.startContainer) && editor.contains(r.endContainer)) {
      editor._savedRange = r.cloneRange();
    }
  }
  function restoreSavedRange(editor) {
    if (!editor || !editor._savedRange) return false;
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(editor._savedRange);
    return true;
  }
  function createRangeAtEnd(editor) {
    ensureEditableTail(editor);
    var range = document.createRange();
    if (editor.lastChild && editor.lastChild.nodeType === Node.TEXT_NODE) {
      range.setStart(editor.lastChild, editor.lastChild.length);
    } else {
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    return range;
  }
  function ensureEditableTail(editor) {
    if (!editor.lastChild || editor.lastChild.nodeType !== Node.TEXT_NODE) {
      editor.appendChild(document.createTextNode(" "));
    }
  }
  function applyRange(range) {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel) return;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ---------- image insert + UI ----------
  function ensureImagePicker(scope) {
    var input = qs("#post-image-picker", scope);
    if (input) return input;
    input = document.createElement("input");
    input.type = "file";
    input.id = "post-image-picker";
    input.accept = "image/*";
    input.style.display = "none";
    scope.appendChild(input);

    on(input, "change", function () {
      var editor = getEditor(scope);
      if (!editor) return;
      var file = input.files && input.files[0];
      input.value = "";
      if (!file || !file.type || file.type.indexOf("image/") !== 0) return;

      var fr = new FileReader();
      fr.onload = function () {
        if (!selectionInsideEditor(editor)) {
          if (!restoreSavedRange(editor)) applyRange(createRangeAtEnd(editor));
        }
        insertImageNode(editor, fr.result, file.name || "image");
      };
      fr.readAsDataURL(file);
    });
    return input;
  }

  function insertImageNode(editor, src, alt) {
    if (!alt) alt = "image";
    editor.focus();

    var sel = window.getSelection ? window.getSelection() : null;
    var range =
      selectionInsideEditor(editor) && sel && sel.rangeCount
        ? sel.getRangeAt(0)
        : createRangeAtEnd(editor);
    applyRange(range);

    var wrap = document.createElement("span");
    wrap.className = "ce-image";
    wrap.setAttribute("contenteditable", "false");

    var img = document.createElement("img");
    img.src = src;
    img.alt = alt;
    img.draggable = false;
    wrap.appendChild(img);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ce-image-remove";
    btn.setAttribute("aria-label", "Supprimer l'image");
    btn.innerHTML = "&times;";
    wrap.appendChild(btn);

    range.collapse(true);
    range.insertNode(wrap);

    var spacer = document.createTextNode(" ");
    if (wrap.parentNode) wrap.parentNode.insertBefore(spacer, wrap.nextSibling);

    var after = document.createRange();
    after.setStartAfter(spacer);
    after.collapse(true);
    applyRange(after);

    selectImage(wrap, editor);
  }

  function setupEditorImageUI(scope) {
    var editor = getEditor(scope);
    if (!editor) return;

    on(editor, "keyup", function () {
      captureSelection(editor);
    });
    on(editor, "mouseup", function () {
      captureSelection(editor);
    });
    on(editor, "focus", function () {
      captureSelection(editor);
    });

    on(editor, "click", function (e) {
      var removeBtn =
        e.target && e.target.closest
          ? e.target.closest(".ce-image-remove")
          : null;
      if (removeBtn) {
        var wrap = removeBtn.closest(".ce-image");
        if (wrap) {
          var nextFocus = wrap.nextSibling || wrap.previousSibling;
          wrap.remove();
          if (nextFocus && nextFocus.nodeType === Node.TEXT_NODE)
            placeCaret(nextFocus, nextFocus.length);
          else editor.focus();
        }
        return;
      }
      var imgWrap =
        e.target && e.target.closest ? e.target.closest(".ce-image") : null;
      var prev = qs(".ce-image.is-selected", editor);
      if (imgWrap) {
        if (prev && prev !== imgWrap) prev.classList.remove("is-selected");
        imgWrap.classList.toggle("is-selected");
      } else if (prev) prev.classList.remove("is-selected");
    });

    on(document, "click", function (e) {
      if (!editor.contains(e.target)) {
        var any = qs(".ce-image.is-selected", editor);
        if (any) any.classList.remove("is-selected");
      }
    });

    on(editor, "keydown", function (e) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      var selected = qs(".ce-image.is-selected", editor);
      if (!selected) return;
      e.preventDefault();
      var nextFocus = selected.nextSibling || selected.previousSibling;
      selected.remove();
      if (nextFocus && nextFocus.nodeType === Node.TEXT_NODE)
        placeCaret(nextFocus, nextFocus.length);
      else editor.focus();
    });
  }

  function placeCaret(textNode, offset) {
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel) return;
    var range = document.createRange();
    var off = Math.min(offset || 0, textNode.length || 0);
    range.setStart(textNode, off);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function selectImage(wrap, editor) {
    qsa(".ce-image.is-selected", editor).forEach(function (w) {
      if (w !== wrap) w.classList.remove("is-selected");
    });
    wrap.classList.add("is-selected");
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

    // État interne
    let dt = new DataTransfer();

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

    // Sélection native
    input.addEventListener("change", () => {
      addFiles(input.files);
      input.value = ""; // dt = source of truth
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

    // Supprimer tout
    clearAll.addEventListener("click", () => {
      dt = new DataTransfer();
      input.files = dt.files;
      renderList();
    });

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

      // PDFs (multi)
      if (mediaEl && mediaEl.files && mediaEl.files.length) {
        Array.from(mediaEl.files).forEach((file) => fd.append("media", file));
      }

      try {
        busy(true);
        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }, // don't set Content-Type for FormData
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          console.error("Create post error:", data);
          alert(data?.error || "Erreur lors de la publication.");
          return;
        }

        form.reset?.();
        if (bodyEl) bodyEl.innerHTML = "";
        alert("Publication créée !");
        document.dispatchEvent(
          new CustomEvent("post:created", { detail: data })
        );
        // Optionally: hideComposer();
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
      setupFileMediaUI(form);
      wireSubmit(standaloneForm);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
});
