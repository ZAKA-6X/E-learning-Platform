/* teacher-dashboard.js — with uploads + course edit/delete + section delete + drag&drop move
   + in-page modals (uiConfirm/uiPrompt/uiAlert) replacing browser dialogs
*/

/* ---------- tiny DOM utils ---------- */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const show = el => el && el.classList.remove('hidden');
const hide = el => el && el.classList.add('hidden');

/* ---------- API helper ---------- */
const API_BASE = '/api/teacher';
const LIB_BASE = '/api/teacher';
const TOKEN = localStorage.getItem('token') || localStorage.getItem('authToken') || '';

async function api(path, { method='GET', body=null, headers={}, raw=false } = {}) {
  const opts = { method, credentials: 'include', headers: { ...headers } };
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body; // browser sets content-type
  }
  if (TOKEN) opts.headers['Authorization'] = `Bearer ${TOKEN}`;

  const res = await fetch(path, opts);
  if (!res.ok) {
    const text = await res.text().catch(()=> '');
    const err = new Error(text || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (raw) return res;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res.text();
}

/* ---------- global state ---------- */
const state = {
  filters: { classId:'', subjectId:'' },
  offerings: [],
  currentOffering: null,
  libraries: [],
  activeLibrary: null,
  sections: [],
};

/* ============================================================
   BOOT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  bindGlobalDialogs();
  bindCreateCourseOnce();
  bindCreateSectionOnce();
  bindAddItemOnce();
  bindUploadOnce();

  await loadOfferings();
});

/* ============================================================
   OFFERINGS LIST
   ============================================================ */
async function loadOfferings() {
  const wrap = $('#offerings-container');
  const empty = $('#offerings-empty');
  if (!wrap) return;

  wrap.innerHTML = '';
  hide(empty);

  try {
    const list = await api(`${API_BASE}/offerings`);
    state.offerings = Array.isArray(list) ? list : [];

    if (!state.offerings.length) {
      show(empty);
      return;
    }

    wrap.innerHTML = state.offerings.map(o => {
      const cls = escapeHtml(o.class_name || '');
      const subj = escapeHtml(o.subject_name || '');
      return `
        <article class="course-card" data-offering="${o.offering_id ?? o.id ?? o.assignment_id ?? ''}">
          <div class="course-card__title">${cls || '—'}</div>
          <div class="course-card__subtitle">${subj || ''}</div>
          <div class="course-card__actions">
            <button class="btn-secondary js-open-offering">Ouvrir</button>
          </div>
        </article>
      `;
    }).join('');

    $$('.js-open-offering', wrap).forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.course-card');
        const id = card?.dataset.offering;
        const off = state.offerings.find(x => (x.offering_id ?? x.id ?? x.assignment_id) == id);
        if (off) openOffering(off);
      });
    });

    $('#courses-count') && ($('#courses-count').textContent = String(state.offerings.length));

  } catch (err) {
    console.error('[loadOfferings]', err);
    show($('#offerings-empty'));
  }
}

/* ============================================================
   OFFERING DETAIL
   ============================================================ */
async function openOffering(offering) {
  state.currentOffering = offering;

  const section = $('#offering-detail');
  const loading = $('#offering-detail-loading');
  const content = $('#offering-detail-content');
  const errorBox = $('#offering-detail-error');
  if (!section) return;

  show(section);
  show(loading);
  hide(content);
  hide(errorBox);

  const titleEl = $('#offering-name') || $('#offering-detail-title');
  titleEl && (titleEl.textContent = `${offering.subject_name || ''} — ${offering.class_name || ''}`);

  try {
    const id = offering.offering_id ?? offering.id ?? offering.assignment_id ?? offering.assignmentId;
    if (!id) throw new Error('Missing offering id');
    const detail = await api(`${API_BASE}/offering/${id}`);
    const countEl = $('#offering-students-count') || $('#offering-detail-subtitle');
    if (countEl && typeof countEl.textContent === 'string') {
      const n = String(detail?.students_count ?? 0);
      if (countEl.id === 'offering-detail-subtitle') countEl.textContent = `Élèves : ${n}`;
      else countEl.textContent = n;
    }

    await loadLibrariesForCurrentOffering();

    hide(loading);
    show(content);

    const back = $('#offering-detail-back');
    if (back && !back.dataset.bound) {
      back.dataset.bound = '1';
      back.addEventListener('click', () => {
        section.classList.add('hidden');
      });
    }

  } catch (err) {
    console.error('[openOffering]', err);
    hide(loading);
    show(errorBox);
  }
}

/* ============================================================
   LIBRARIES (courses)
   ============================================================ */
async function loadLibrariesForCurrentOffering() {
  const aId =
    state.currentOffering?.offering_id ??
    state.currentOffering?.id ??
    state.currentOffering?.assignment_id ??
    state.currentOffering?.assignmentId;

  const grid = $('#courses-list');
  const empty = $('#courses-empty');
  if (!grid) return;

  grid.innerHTML = '';
  hide(empty);

  if (!aId) {
    show(empty);
    return;
  }

  try {
    const libs = await api(`${LIB_BASE}/offerings/${aId}/libraries`);
    state.libraries = Array.isArray(libs) ? libs : [];

    if (!state.libraries.length) {
      show(empty);
    } else {
      grid.innerHTML = state.libraries.map(lib => `
        <article class="course-card" data-lib="${lib.id}">
          <div class="course-card__title">${escapeHtml(lib.title || 'Cours')}</div>
          <div class="course-card__subtitle muted">${lib.created_at ? new Date(lib.created_at).toLocaleDateString() : ''}</div>
          <div class="course-card__actions">
            <button class="btn-secondary js-open-lib">Ouvrir</button>
            <button class="icon-btn js-lib-rename" title="Renommer">✏️</button>
            <button class="icon-btn js-lib-delete" title="Supprimer">🗑️</button>
          </div>
        </article>
      `).join('');

      // open
      $$('.js-open-lib', grid).forEach(btn => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.course-card');
          openCourse(card.dataset.lib);
        });
      });

      // rename (modal)
      $$('.js-lib-rename', grid).forEach(btn => {
        btn.onclick = async () => {
          const id = btn.closest('.course-card').dataset.lib;
          const current = state.libraries.find(l => String(l.id) === String(id));
          const name = await uiPrompt({
            title: 'Renommer le cours',
            label: 'Nouveau nom',
            value: current?.title || ''
          });
          if (!name) return;
          try {
            await api(`${LIB_BASE}/libraries/${id}`, { method:'PATCH', body:{ title: name }});
            await loadLibrariesForCurrentOffering();
          } catch (err) {
            await uiAlert(`Renommage échoué (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
          }
        };
      });

      // delete (modal)
      $$('.js-lib-delete', grid).forEach(btn => {
        btn.onclick = async () => {
          const id = btn.closest('.course-card').dataset.lib;
          const ok = await uiConfirm(
            'Supprimer ce cours et toutes ses ressources ?',
            { title: 'Supprimer le cours', okText: 'Supprimer', cancelText: 'Annuler' }
          );
          if (!ok) return;
          try {
            await api(`${LIB_BASE}/libraries/${id}`, { method:'DELETE' });
            if (state.activeLibrary && String(state.activeLibrary.id) === String(id)) {
              state.activeLibrary = null;
              $('#lib-sections').innerHTML = '';
              $('#lib-badge').hidden = true;
            }
            await loadLibrariesForCurrentOffering();
          } catch (err) {
            await uiAlert(`Suppression échouée (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
          }
        };
      });
    }

  } catch (err) {
    await uiAlert(`Impossible de charger les cours (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
    console.error('[loadLibrariesForCurrentOffering]', err);
    show(empty);
  }

  const btnCreate = $('#btn-create-course');
  if (btnCreate) {
    btnCreate.disabled = false;
    if (!btnCreate.dataset.bound) {
      btnCreate.dataset.bound = '1';
      btnCreate.addEventListener('click', () => openDlg('#dlg-create-lib'));
    }
  }
}

/* create course dialog */
function bindCreateCourseOnce() {
  const form = $('#form-create-lib');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = ($('#inp-lib-title')?.value || '').trim();
    if (!title) return;
    const aId =
      state.currentOffering?.offering_id ??
      state.currentOffering?.id ??
      state.currentOffering?.assignment_id ??
      state.currentOffering?.assignmentId;
    if (!aId) return;

    try {
      await api(`${LIB_BASE}/offerings/${aId}/libraries`, { method:'POST', body:{ title }});
      closeDlg('#dlg-create-lib');
      const inp = $('#inp-lib-title'); if (inp) inp.value = '';
      await loadLibrariesForCurrentOffering();
    } catch (err) {
      await uiAlert(`Création échouée (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
      console.error('[create course]', err);
    }
  });
}

/* ============================================================
   SINGLE LIBRARY (course)
   ============================================================ */
async function openCourse(libraryId) {
  state.activeLibrary = state.libraries.find(l => String(l.id) === String(libraryId)) || { id: libraryId };

  const btn = $('#btn-new-section');
  if (btn) {
    btn.disabled = false;
    btn.onclick = () => openDlg('#dlg-create-section');
  }
  await loadSections(libraryId);
}

async function loadSections(libraryId) {
  const wrap = $('#lib-sections');
  const empty = $('#lib-sections-empty');
  const badge = $('#lib-badge');
  if (!wrap || !empty || !badge) return;

  wrap.innerHTML = '';
  hide(empty);
  badge.hidden = true;

  try {
    const secs = await api(`${LIB_BASE}/libraries/${libraryId}/sections`);
    state.sections = Array.isArray(secs) ? secs : [];
  } catch (err) {
    await uiAlert(`Chargement des dossiers échoué (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
    state.sections = [];
  }
  renderSections(libraryId, state.sections);
}

function renderSections(libraryId, secs) {
  const wrap = $('#lib-sections');
  const empty = $('#lib-sections-empty');
  const badge = $('#lib-badge');
  if (!wrap || !empty || !badge) return;

  if (!secs.length) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    empty.classList.remove('hidden');
    badge.hidden = true;
    return;
  }

  empty.classList.add('hidden');
  wrap.hidden = false;
  badge.hidden = false;
  badge.textContent = String(secs.length);

  wrap.innerHTML = secs.map(s => `
    <div class="resource-card" data-section="${s.id}">
      <div class="resource-card__head">
        <h6>${escapeHtml(s.title || 'Dossier')}</h6>
        <div class="card-actions">
          <button class="icon-btn js-add-item" title="Ajouter un lien">+</button>
          <button class="icon-btn js-upload" title="Téléverser des fichiers">📤</button>
          <button class="icon-btn js-delete-section" title="Supprimer le dossier">🗑️</button>
        </div>
      </div>
      <div class="resource-card__list" id="res-list-${s.id}"></div>
      <button class="link-btn js-load-items">Afficher les ressources</button>
    </div>
  `).join('');

  // toggle list
  $$('.js-load-items', wrap).forEach(btn => {
    btn.onclick = async () => {
      const card = btn.closest('.resource-card');
      const sectionId = card.dataset.section;
      const list = $(`#res-list-${sectionId}`);
      if (!list) return;
      if (list.dataset.loaded === '1') {
        list.innerHTML = '';
        list.dataset.loaded = '0';
        return;
      }
      list.textContent = 'Chargement...';
      try {
        const items = await api(`${LIB_BASE}/sections/${sectionId}/items`);
        list.innerHTML = items.map(it => `
          <div class="res-row" draggable="true" data-item="${it.id}" data-section="${sectionId}">
            <a class="res-item" href="${escapeAttr(it.url)}" target="_blank" rel="noopener">
              <span class="res-kind">${escapeHtml(it.kind)}</span>
              <span class="res-name">${escapeHtml(it.name)}</span>
            </a>
            <div class="res-actions">
              <button class="icon-btn js-it-rename" title="Renommer / Modifier l’URL">✏️</button>
              <button class="icon-btn js-it-delete" title="Supprimer">🗑️</button>
            </div>
          </div>
        `).join('') || '<div class="muted">Aucune ressource.</div>';
        list.dataset.loaded = '1';

        // bind item actions
        bindItemActions(list, card);

        // enable drag&drop on freshly loaded items
        enableDragOnItems(list);
      } catch (err) {
        list.innerHTML = `<div class="error">Échec du chargement</div>`;
      }
    };
  });

  // add by URL
  $$('.js-add-item', wrap).forEach(btn => {
    btn.onclick = () => {
      const sectionId = btn.closest('.resource-card').dataset.section;
      $('#inp-item-section-id').value = sectionId;
      openDlg('#dlg-add-item');
    };
  });

  // file upload (open upload dialog)
  $$('.js-upload', wrap).forEach(btn => {
    btn.onclick = () => {
      const sectionId = btn.closest('.resource-card').dataset.section;
      $('#up-section-id').value = sectionId;
      const f = $('#up-files'); if (f) f.value = '';
      openDlg('#dlg-upload');
    };
  });

  // delete section (modal)
  $$('.js-delete-section', wrap).forEach(btn => {
    btn.onclick = async () => {
      const sectionId = btn.closest('.resource-card').dataset.section;
      const ok = await uiConfirm(
        'Supprimer ce dossier et toutes ses ressources ?',
        { title:'Supprimer le dossier', okText:'Supprimer' }
      );
      if (!ok) return;
      try {
        await api(`${LIB_BASE}/sections/${sectionId}`, { method: 'DELETE' });
        await loadSections(libraryId);
      } catch (err) {
        await uiAlert(`Suppression du dossier échouée (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
      }
    };
  });

  // enable drop targets on each section card
  $$('.resource-card', wrap).forEach(card => enableDropOnSection(card, libraryId));
}

function bindItemActions(list, card) {
  // rename item (modal + optional URL)
  $$('.js-it-rename', list).forEach(act => {
    act.onclick = async () => {
      const row = act.closest('.res-row');
      const itemId = row.dataset.item;
      const sectionId = card.dataset.section;

      const newName = await uiPrompt({
        title: 'Renommer la ressource',
        label: 'Nouveau titre',
        value: row.querySelector('.res-name')?.textContent || ''
      });
      if (!newName) return;

      const wantUrl = await uiConfirm(
        'Modifier aussi l’URL de la ressource ?',
        { title: 'Modifier l’URL ?', okText: 'Oui', cancelText: 'Non' }
      );

      let body = { name: newName };
      if (wantUrl) {
        const currentHref = row.querySelector('.res-item')?.getAttribute('href') || '';
        const newUrl = await uiPrompt({
          title: 'Nouvelle URL',
          label: 'URL',
          value: currentHref
        });
        if (newUrl) body.url = newUrl;
      }

      try {
        await api(`${LIB_BASE}/sections/${sectionId}/items/${itemId}`, {
          method:'PATCH',
          body
        });
        // reload that section list
        const btn = card.querySelector('.js-load-items');
        const list = card.querySelector('.resource-card__list');
        if (list) list.dataset.loaded = '0';
        if (btn) btn.click();
      } catch (err) {
        await uiAlert(`Modification échouée (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
      }
    };
  });

  // delete item (modal)
  $$('.js-it-delete', list).forEach(act => {
    act.onclick = async () => {
      const ok = await uiConfirm('Supprimer cette ressource ?', { title:'Supprimer la ressource', okText:'Supprimer' });
      if (!ok) return;

      const row = act.closest('.res-row');
      const itemId = row.dataset.item;
      const sectionId = card.dataset.section;

      try {
        await api(`${LIB_BASE}/sections/${sectionId}/items/${itemId}`, { method:'DELETE' });
        // reload that section
        const btn = card.querySelector('.js-load-items');
        const list = card.querySelector('.resource-card__list');
        if (list) list.dataset.loaded = '0';
        if (btn) btn.click();
      } catch (err) {
        await uiAlert(`Suppression échouée (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
      }
    };
  });
}

/* ---------------- Drag & Drop: items ---------------- */
function enableDragOnItems(listEl) {
  $$('.res-row[draggable="true"]', listEl).forEach(row => {
    row.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.effectAllowed = 'move';
      const payload = JSON.stringify({
        itemId: row.dataset.item,
        fromSectionId: row.dataset.section,
      });
      ev.dataTransfer.setData('text/plain', payload);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
  });
}

function enableDropOnSection(sectionCardEl, libraryId) {
  const sectionId = sectionCardEl.dataset.section;
  sectionCardEl.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    sectionCardEl.classList.add('drop-target');
  });
  sectionCardEl.addEventListener('dragleave', () => {
    sectionCardEl.classList.remove('drop-target');
  });
  sectionCardEl.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    sectionCardEl.classList.remove('drop-target');
    let payload;
    try { payload = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}'); } catch {}
    const { itemId, fromSectionId } = payload || {};
    if (!itemId || !fromSectionId || fromSectionId === sectionId) return;

    try {
      await api(`${LIB_BASE}/sections/${fromSectionId}/items/${itemId}/move`, {
        method: 'POST',
        body: { target_section_id: sectionId }
      });
      // Simplest refresh: reload all sections of this library
      await loadSections(libraryId);
    } catch (err) {
      await uiAlert(`Déplacement échoué (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
    }
  });
}

/* create section binder */
function bindCreateSectionOnce() {
  const form = $('#form-create-section');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = ($('#inp-section-title')?.value || '').trim();
    const libId = state.activeLibrary?.id;
    if (!title || !libId) return;
    try {
      await api(`${LIB_BASE}/libraries/${libId}/sections`, { method:'POST', body:{ title }});
      closeDlg('#dlg-create-section');
      const inp = $('#inp-section-title'); if (inp) inp.value = '';
      await loadSections(libId);
    } catch (err) {
      const msg = (err.status === 409) ? 'Ce dossier existe déjà.' : (err.message || 'Erreur');
      await uiAlert(`Ajout de dossier échoué\n${msg}`, { title:'Erreur' });
    }
  });
}

/* add item (by URL) binder */
function bindAddItemOnce() {
  const form = $('#form-add-item');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sectionId = $('#inp-item-section-id')?.value;
    const kind = $('#inp-item-kind')?.value || 'link';
    const name = ($('#inp-item-name')?.value || '').trim();
    const url  = ($('#inp-item-url')?.value || '').trim();
    if (!sectionId || !name || !url) return;

    try {
      await api(`${LIB_BASE}/sections/${sectionId}/items`, { method:'POST', body:{ name, url, kind }});
      closeDlg('#dlg-add-item');
      const btn = $(`[data-section="${sectionId}"] .js-load-items`);
      if (btn) btn.click();
      const ni = $('#inp-item-name'); if (ni) ni.value = '';
      const ui = $('#inp-item-url');  if (ui) ui.value = '';
    } catch (err) {
      await uiAlert(`Ajout de ressource échoué (${err.status || ''})\n${err.message || err}`, { title:'Erreur' });
    }
  });
}

/* file upload binder (multi-file) */
function bindUploadOnce() {
  const btn = $('#btn-upload-go');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    const sid = $('#up-section-id')?.value;
    const files = $('#up-files')?.files;
    if (!sid || !files || !files.length) {
      await uiAlert('Sélectionnez au moins un fichier.', { title:'Information' });
      return;
    }

    btn.disabled = true;
    try {
      const fd = new FormData();
      for (const f of files) fd.append('files', f);

      const res = await fetch(`${LIB_BASE}/sections/${sid}/items/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
        headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : undefined
      });
      if (!res.ok) {
        const msg = await res.text().catch(()=> '');
        throw new Error(msg || `HTTP ${res.status}`);
      }

      closeDlg('#dlg-upload');

      // refresh that section list (force toggle reload)
      const list = $(`#res-list-${sid}`);
      if (list) list.dataset.loaded = '0';
      const toggle = $(`[data-section="${sid}"] .js-load-items`);
      if (toggle) toggle.click();

    } catch (err) {
      await uiAlert(`Upload échoué\n${err.message || err}`, { title:'Erreur' });
    } finally {
      btn.disabled = false;
    }
  });
}

/* ============================================================
   Dialog helpers
   ============================================================ */
function bindGlobalDialogs() {
  $$('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-close');
      closeDlg(`#${id}`);
    });
  });
}
function openDlg(sel) {
  const dlg = $(sel);
  if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
  else dlg && dlg.classList.remove('hidden');
}
function closeDlg(sel) {
  const dlg = $(sel);
  if (dlg && typeof dlg.close === 'function') dlg.close();
  else dlg && dlg.classList.add('hidden');
}

/* ========= In-page modal helpers (confirm/prompt/alert) ========= */
function uiConfirm(message, { title='Confirmation', okText='Confirmer', cancelText='Annuler' } = {}) {
  return new Promise(resolve => {
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    $('#confirm-ok').textContent = okText;
    $('#confirm-cancel').textContent = cancelText;

    const form = $('#form-confirm');
    const onCancel = () => { cleanup(); resolve(false); };
    const onSubmit = (e) => { e.preventDefault(); cleanup(); resolve(true); };

    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      $('#confirm-cancel').removeEventListener('click', onCancel);
      closeDlg('#dlg-confirm');
    }

    form.addEventListener('submit', onSubmit);
    $('#confirm-cancel').addEventListener('click', onCancel);
    openDlg('#dlg-confirm');
  });
}

function uiPrompt({ title='Modifier', label='Valeur', value='', helper='', okText='Enregistrer', cancelText='Annuler' } = {}) {
  return new Promise(resolve => {
    $('#prompt-title').textContent = title;
    $('#prompt-label').textContent = label;
    $('#prompt-input').value = value ?? '';
    $('#prompt-helper').textContent = helper;
    $('#prompt-ok').textContent = okText;
    $('#prompt-cancel').textContent = cancelText;

    const form = $('#form-prompt');
    const onCancel = () => { cleanup(); resolve(null); };
    const onSubmit = (e) => {
      e.preventDefault();
      const v = $('#prompt-input').value.trim();
      if (!v) { $('#prompt-input').focus(); return; }
      cleanup(); resolve(v);
    };

    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      $('#prompt-cancel').removeEventListener('click', onCancel);
      closeDlg('#dlg-prompt');
    }

    form.addEventListener('submit', onSubmit);
    $('#prompt-cancel').addEventListener('click', onCancel);
    openDlg('#dlg-prompt');
    $('#prompt-input').focus(); $('#prompt-input').select();
  });
}

function uiAlert(message, { title='Information', okText='OK' } = {}) {
  return new Promise(resolve => {
    $('#alert-title').textContent = title;
    $('#alert-message').textContent = message;
    $('#alert-ok').textContent = okText;

    const form = $('#form-alert');
    const onSubmit = (e) => { e.preventDefault(); cleanup(); resolve(); };

    function cleanup() {
      form.removeEventListener('submit', onSubmit);
      closeDlg('#dlg-alert');
    }

    form.addEventListener('submit', onSubmit);
    openDlg('#dlg-alert');
  });
}

/* ---------- utils ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) {
  return String(s ?? '').replace(/"/g, '&quot;');
}