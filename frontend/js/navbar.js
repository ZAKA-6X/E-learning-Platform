// admin.js
// Admin panel interactions placeholder
/* admin-dashboard.js
   – Gère hubs (collapsibles), sélection active, routing simple, persistance.
*/

(function () {
  const LS_KEYS = {
    groups: 'adminSidebar.groups',   // { groupId: true/false }
    active: 'adminSidebar.active',   // "navId"
  };

  // ===== Helpers =====
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const $  = (sel, root = document) => root.querySelector(sel);

  // calcule une hauteur max pour l'anim (auto -> px)
  function setGroupExpanded(group, expanded) {
    if (!group) return;
    if (expanded) {
      group.hidden = false;
      group.style.maxHeight = group.scrollHeight + 'px';
      // après transition, retire la valeur pour s'adapter au contenu futur
      group.addEventListener('transitionend', function onEnd() {
        group.style.maxHeight = '';
        group.removeEventListener('transitionend', onEnd);
      });
    } else {
      group.style.maxHeight = group.scrollHeight + 'px'; // set current
      // force reflow
      // eslint-disable-next-line no-unused-expressions
      group.offsetHeight;
      group.style.maxHeight = '0px';
      // à la fin, cache réellement
      group.addEventListener('transitionend', function onEnd() {
        group.hidden = true;
        group.removeEventListener('transitionend', onEnd);
      });
    }
  }

  function saveGroupsState() {
    const state = {};
    $$('.sidebar-section').forEach((sec, i) => {
      const header = $('.sidebar-header.collapsible', sec);
      const group  = $('.sidebar-group', sec);
      if (!header || !group) return;
      const id = header.dataset.groupId || `g${i}`;
      header.dataset.groupId = id;
      state[id] = header.getAttribute('aria-expanded') === 'true';
    });
    try { localStorage.setItem(LS_KEYS.groups, JSON.stringify(state)); } catch {}
  }

  function loadGroupsState() {
    try {
      const obj = JSON.parse(localStorage.getItem(LS_KEYS.groups) || '{}');
      $$('.sidebar-section').forEach((sec, i) => {
        const header = $('.sidebar-header.collapsible', sec);
        const group  = $('.sidebar-group', sec);
        if (!header || !group) return;
        const id = header.dataset.groupId || `g${i}`;
        header.dataset.groupId = id;
        const expanded = obj[id] !== undefined ? !!obj[id] : header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(expanded));
        // chevron
        const chev = $('.fa-chevron-down', header);
        if (chev) chev.style.transform = expanded ? 'rotate(180deg)' : '';
        // group
        if (!expanded) {
          group.hidden = true;
          group.style.maxHeight = '0px';
        }
      });
    } catch {}
  }

  // ===== Collapsibles =====
  function bindCollapsibles() {
    $$('.sidebar-header.collapsible').forEach((btn) => {
      const group = btn.nextElementSibling;
      const chev  = $('.fa-chevron-down', btn);

      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        if (chev) chev.style.transform = expanded ? '' : 'rotate(180deg)';
        setGroupExpanded(group, !expanded);
        saveGroupsState();
      });

      // accessibilité: espace/entrée
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          btn.click();
        }
      });
    });
  }

  // ===== Active nav & routing =====
  // Les liens ont data-nav="xxx"
  // Les vues centrales ont data-view="xxx"
  function setActive(navId, pushHistory = true) {
    if (!navId) return;

    // 1) visuel actif
    $$('.sidebar-item').forEach((a) => {
      a.classList.toggle('active', a.dataset.nav === navId);
    });

    // 2) show view correspondante
    const views = $$('[data-view]');
    let shown = false;
    views.forEach((v) => {
      const match = v.dataset.view === navId;
      v.style.display = match ? '' : 'none';
      if (match) shown = true;
    });

    // 3) s'il n'y a pas de vue correspondante, on ne plante pas
    if (!shown && views.length) {
      // afficher la première vue par défaut
      views[0].style.display = '';
    }

    // 4) mémorise + URL
    try { localStorage.setItem(LS_KEYS.active, navId); } catch {}
    if (pushHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set('view', navId);
      history.pushState({ view: navId }, '', url.toString());
    }

    // 5) ouvrir automatiquement le groupe qui contient le lien actif
    const activeLink = $(`.sidebar-item[data-nav="${navId}"]`);
    if (activeLink) {
      const sec = activeLink.closest('.sidebar-section');
      const header = $('.sidebar-header.collapsible', sec || document);
      const group  = header && header.nextElementSibling;
      if (header && group && header.getAttribute('aria-expanded') !== 'true') {
        header.setAttribute('aria-expanded', 'true');
        const chev = $('.fa-chevron-down', header);
        if (chev) chev.style.transform = 'rotate(180deg)';
        setGroupExpanded(group, true);
        saveGroupsState();
      }
    }
  }

  function bindNavClicks() {
    // clic/re-clic: re-sélectionne et remonte la même vue
    $$('.sidebar-item').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const navId = a.dataset.nav;
        setActive(navId);
      });
    });
  }

  function initViews() {
    // Si vous avez plusieurs vues, marquez-les avec data-view="students", etc.
    // Exemple existant dans votre HTML : <main ... id="view-students" data-view="students">
    // On récupère ?view=... ou le dernier actif sauvegardé.
    const url = new URL(window.location.href);
    const qView = url.searchParams.get('view');
    const saved = localStorage.getItem(LS_KEYS.active);
    const fallback = $('.sidebar-item.active')?.dataset.nav || $$('[data-view]')[0]?.dataset.view;

    setActive(qView || saved || fallback || '', false);

    // back/forward support
    window.addEventListener('popstate', (e) => {
      const view = e.state?.view || new URL(window.location.href).searchParams.get('view');
      setActive(view, false);
    });
  }

  // ===== Recherche élèves (optionnel, déjà dans votre page) =====
  function bindStudentSearch() {
    const search = $('#studentSearch');
    const items  = $$('#studentsUl .list-item');
    if (!search || !items.length) return;

    search.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      items.forEach((li) => {
        const t = li.innerText.toLowerCase();
        li.style.display = t.includes(q) ? '' : 'none';
      });
    });
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', () => {
    loadGroupsState();
    bindCollapsibles();
    bindNavClicks();
    initViews();
    bindStudentSearch();
  });
})();

const navItems = document.querySelectorAll('.sidebar-item');
const sections = document.querySelectorAll('.content-section');

navItems.forEach(item => {
  item.addEventListener('click', e => {
    e.preventDefault();

    // toggle active link
    navItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');

    // hide all sections
    sections.forEach(sec => sec.style.display = 'none');

    // show target section
    const target = document.getElementById(item.dataset.nav);
    if (target) target.style.display = 'block';
  });
});
