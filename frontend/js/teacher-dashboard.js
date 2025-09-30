/* teacher-dashboard.js — robust boot + full flow
   v20250930-3
*/

/* ---------------- Small DOM helpers ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $all = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const show = (el) => el && el.classList && el.classList.remove('hidden');
const hide = (el) => el && el.classList && el.classList.add('hidden');
const setText = (el, txt) => { if (el) el.textContent = txt; };

/* ---------------- Auth / API helper ---------------- */
const TOKEN = localStorage.getItem('token') || localStorage.getItem('authToken') || '';

console.log('teacher-dashboard.js loaded v20250930-3');

async function api(path, opts = {}) {
  const headers = Object.assign(
    {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
    },
    opts.headers || {}
  );

  const url = path.startsWith('/api') ? path : `/api${path}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let errText = '';
    try { errText = await res.text(); } catch (_) {}
    const msg = `[api] ${res.status} ${res.statusText} @ ${url} :: ${errText}`;
    console.error(msg);
    throw new Error(errText || res.statusText || 'Request failed');
  }

  // JSON or empty
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

/* ---------------- Global state ---------------- */
const state = {
  filters: { classId: '', subjectId: '' },
  offerings: [],
  currentOffering: null,    // { offering_id, class_name, subject_name, ... }
  libraries: [],            // courses for current offering
  activeLibrary: null,      // selected course
  sections: [],             // folders for active library
};

/* ---------------- Boot ---------------- */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!TOKEN) {
      console.warn('[teacher] no token -> redirect to login');
      location.href = '/';
      return;
    }
    console.log('[teacher] boot DOM ready -> load filters & offerings');
    await loadFilters();
    await loadOfferings();
  } catch (err) {
    console.error('[teacher] boot failed', err);
  }
});

/* ============================================================
   FILTERS
   ============================================================ */
async function loadFilters() {
  console.log('[filters] GET /api/teacher/filters');
  const data = await api('/teacher/filters').catch((e) => {
    console.error('[filters] failed', e);
    return { classes: [], subjects: [] };
  });

  const classSel = $('#filter-class');
  const subjSel = $('#filter-subject');

  if (classSel) {
    // reset
    classSel.innerHTML = `<option value="">Classe : toutes</option>`;
    (data.classes || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      classSel.appendChild(opt);
    });
    classSel.onchange = () => {
      state.filters.classId = classSel.value;
      loadOfferings();
    };
  }

  if (subjSel) {
    subjSel.innerHTML = `<option value="">Matière : toutes</option>`;
    (data.subjects || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      subjSel.appendChild(opt);
    });
    subjSel.onchange = () => {
      state.filters.subjectId = subjSel.value;
      loadOfferings();
    };
  }
}

/* ============================================================
   OFFERINGS (classes x subjects assigned to teacher)
   ============================================================ */
async function loadOfferings() {
  const params = new URLSearchParams();
  if (state.filters.classId) params.set('classId', state.filters.classId);
  if (state.filters.subjectId) params.set('subjectId', state.filters.subjectId);

  const url = `/teacher/offerings${params.toString() ? `?${params.toString()}` : ''}`;
  console.log('[offerings] GET', url);

  // Skeletons on
  const cont = $('#offerings-container');
  const empty = $('#offerings-empty');
  if (cont) {
    cont.innerHTML = `
      <div class="course-card skeleton" aria-hidden="true"></div>
      <div class="course-card skeleton" aria-hidden="true"></div>
      <div class="course-card skeleton" aria-hidden="true"></div>
    `;
    hide(empty);
  }

  const data = await api(url).catch(e => {
    console.error('[offerings] failed', e);
    return [];
  });
  state.offerings = data || [];

  renderOfferings();
}

function renderOfferings() {
  const cont = $('#offerings-container');
  const empty = $('#offerings-empty');
  if (!cont) return;

  if (!state.offerings.length) {
    cont.innerHTML = '';
    show(empty);
    return;
  }

  hide(empty);

  // pick the right id regardless of the key name
  cont.innerHTML = state.offerings.map(o => {
    const oid = o.id ?? o.assignment_id ?? o.assignmentId ?? o.offering_id;
    const subject = o.subject_name || o.subject || 'Matière';
    const cls     = o.class_name   || o.class    || 'Classe';
    return `
      <article class="course-card" data-offering="${oid}">
        <header>
          <div class="course-card__subject">${subject}</div>
          <div class="course-card__class muted">${cls}</div>
        </header>
        <footer>
          <button class="btn-secondary" data-open-offering="${oid}">Ouvrir</button>
        </footer>
      </article>
    `;
  }).join('');

  $all('[data-open-offering]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.openOffering;
      if (!id) {
        console.warn('[offerings] missing id on card', btn.closest('.course-card'));
        return;
      }
      openOffering(id);
    };
  });
}


/* ============================================================
   OFFERING DETAIL: header + load courses (libraries)
   ============================================================ */
async function openOffering(offeringId) {
  if (!offeringId) {
    console.error('[offering] open called with empty id');
    return;
  }

  console.log('[offering] open', offeringId);

  // Show detail section
  const section = $('#offering-detail');
  const loading = $('#offering-detail-loading');
  const content = $('#offering-detail-content');
  const errorBox = $('#offering-detail-error');
  show(section);
  show(loading);
  hide(content);
  hide(errorBox);

  // Header elements
  const crumb = $('#offering-detail-breadcrumb');
  const title = $('#offering-detail-title');
  const subtitle = $('#offering-detail-subtitle');
  const statusEl = $('#offering-detail-status');

  try {
    // Fetch offering detail (returns courses array too)
    const d = await api(`/teacher/offering/${offeringId}`);
    state.currentOffering = d;

    setText(crumb, d.class_name || '');
    setText(title, `${d.subject_name || ''} – ${d.class_name || ''}`);
    setText(subtitle, `Élèves : ${d.students_count ?? 0}`);
    setText(statusEl, d.status || '—');

    // Now load libraries (courses) for this offering
    await loadLibrariesForCurrentOffering();

    hide(loading);
    show(content);

    // back button
    $('#offering-detail-back')?.addEventListener('click', () => {
      hide(section);
    }, { once: true });

    // create course
    $('#btn-create-course')?.addEventListener('click', async () => {
      if (!state.currentOffering) return;
      const title = prompt('Titre du cours ?');
      if (!title) return;
      await api(`/teacher/offerings/${state.currentOffering.offering_id}/libraries`, {
        method: 'POST',
        body: { title }
      });
      await loadLibrariesForCurrentOffering();
    });

  } catch (err) {
    console.error('[offering] failed', err);
    hide(loading);
    hide(content);
    show(errorBox);
  }
}

/* ============================================================
   COURSES (libraries) under offering
   ============================================================ */
async function loadLibrariesForCurrentOffering() {
  const aId = state.currentOffering?.offering_id;
  if (!aId) return;

  console.log('[courses] GET /api/teacher/offerings/%s/libraries', aId);
  const libs = await api(`/teacher/offerings/${aId}/libraries`).catch(e => {
    console.error('[courses] list failed', e);
    return [];
  });
  state.libraries = libs || [];
  renderCoursesList(state.libraries);

  // reset folders area until a course is opened
  const newSectionBtn = $('#btn-new-section');
  const libBadge = $('#lib-badge');
  const libSections = $('#lib-sections');
  const libSectionsEmpty = $('#lib-sections-empty');
  if (newSectionBtn) newSectionBtn.disabled = true;
  if (libBadge) { libBadge.hidden = true; libBadge.textContent = '0'; }
  if (libSections) { libSections.hidden = true; libSections.innerHTML = ''; }
  if (libSectionsEmpty) libSectionsEmpty.classList.add('hidden');
}

function renderCoursesList(courses) {
  const host  = $('#courses-list');
  const empty = $('#courses-empty');
  const badge = $('#courses-badge');

  if (!host || !empty || !badge) {
    console.warn('Courses block missing in HTML');
    return;
  }

  if (!courses || !courses.length) {
    empty.classList.remove('hidden');
    host.innerHTML = '';
    badge.hidden = true;
    return;
  }

  empty.classList.add('hidden');
  badge.hidden = false;
  badge.textContent = courses.length;

  host.innerHTML = courses.map(c => `
    <article class="course-card" data-lib="${c.id}">
      <header><div class="course-card__subject">${c.title}</div></header>
      <footer><button class="btn-secondary" data-open-course="${c.id}">Ouvrir le cours</button></footer>
    </article>
  `).join('');

  host.querySelectorAll('[data-open-course]').forEach(btn=>{
    btn.onclick = () => openCourse(btn.dataset.openCourse);
  });
}

/* ============================================================
   FOLDERS (sections) + RESOURCES (items)
   ============================================================ */
async function openCourse(libraryId) {
  console.log('[course] open', libraryId);
  state.activeLibrary = state.libraries.find(l => l.id === libraryId) || { id: libraryId };

  const newSectionBtn = $('#btn-new-section');
  if (newSectionBtn) {
    newSectionBtn.disabled = false;
    newSectionBtn.onclick = () => openDlg('#dlg-create-section');
  }

  $('#form-create-section')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = $('#inp-section-title')?.value?.trim();
    if (!title) return;
    await api(`/teacher/libraries/${state.activeLibrary.id}/sections`, {
      method: 'POST',
      body: { title }
    });
    closeDlg('#dlg-create-section');
    $('#inp-section-title') && ($('#inp-section-title').value = '');
    await loadSections(state.activeLibrary.id);
  }, { once: true });

  await loadSections(libraryId);
}

async function loadSections(libraryId) {
  console.log('[sections] GET /api/teacher/libraries/%s/sections', libraryId);
  const sections = await api(`/teacher/libraries/${libraryId}/sections`).catch(e => {
    console.error('[sections] list failed', e);
    return [];
  });
  state.sections = sections || [];
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
  badge.textContent = secs.length.toString();

  wrap.innerHTML = secs.map(s => `
    <div class="resource-card" data-section="${s.id}">
      <div class="resource-card__head">
        <h6>${s.title}</h6>
        <button class="icon-btn js-add-item" title="Ajouter une ressource">+</button>
      </div>
      <div class="resource-card__list" id="res-list-${s.id}"></div>
      <button class="link-btn js-load-items">Afficher les ressources</button>
    </div>
  `).join('');

  // wire up "Afficher les ressources"
  wrap.querySelectorAll('.js-load-items').forEach(btn => {
    btn.onclick = async () => {
      const sectionId = btn.closest('.resource-card').dataset.section;
      const list = $(`#res-list-${sectionId}`);
      if (list) list.innerHTML = 'Chargement…';
      const items = await api(`/teacher/sections/${sectionId}/items`).catch(e => {
        console.error('[items] list failed', e);
        return [];
      });
      if (list) {
        list.innerHTML = items.length
          ? items.map(i => `<div class="res-item"><span>${i.name}</span> <a href="${i.url}" target="_blank" rel="noopener">ouvrir</a></div>`).join('')
          : '<div class="muted">Aucune ressource</div>';
      }
    };
  });

  // wire up "+ Ressource"
  wrap.querySelectorAll('.js-add-item').forEach(btn => {
    btn.onclick = () => {
      const sectionId = btn.closest('.resource-card').dataset.section;
      $('#inp-item-section-id').value = sectionId;
      openDlg('#dlg-add-item');
    };
  });

  // Add-item form
  $('#form-add-item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sectionId = $('#inp-item-section-id')?.value;
    const kind = $('#inp-item-kind')?.value || 'link';
    const name = $('#inp-item-name')?.value?.trim();
    const url  = $('#inp-item-url')?.value?.trim();
    if (!sectionId || !name || !url) return;

    await api(`/teacher/sections/${sectionId}/items`, {
      method: 'POST',
      body: { name, url, kind }
    });

    closeDlg('#dlg-add-item');
    // reload visible list
    const listBtn = $(`[data-section="${sectionId}"] .js-load-items`);
    listBtn && listBtn.click();
    // reset inputs
    $('#inp-item-name') && ($('#inp-item-name').value = '');
    $('#inp-item-url') && ($('#inp-item-url').value = '');
  }, { once: true });
}

/* ---------------- Dialog helpers (keep existing styles/HTML) ---------------- */
function openDlg(sel) { const d = $(sel); if (d && typeof d.showModal === 'function') d.showModal(); }
function closeDlg(sel) { const d = $(sel); if (d && typeof d.close === 'function') d.close(); }
$all('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.getAttribute('data-close');
    closeDlg(`#${id}`);
  });
});
