'use strict';

// ClicaEd - Universal Navbar Controller
// Features:
// - Role-aware nav items filtering via data-roles="student,admin"
// - Section routing via data-section or inferred from id="nav-xxx" -> #xxx
// - Active state + aria-current, show/hide .content-section
// - Hash routing (#sectionId) + localStorage persistence per dashboard & role
// - Works with multiple scopes via [data-dashboard-scope]; falls back to whole document
// - Sidebar toggle support for elements with .sidebar-toggle and .right-sidebar

(function () {
  const STORAGE_NS = 'clicaed.nav';

  const qsAll = (root, sel) => Array.from(root.querySelectorAll(sel));

  const safeParse = (value) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  function decodeJwtRoleFromToken() {
    const token =
      localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    if (!token.includes('.')) return null;
    try {
      const base64 = token.split('.')[1];
      const json = JSON.parse(
        atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
      );
      return json?.role || json?.user_role || null;
    } catch {
      return null;
    }
  }

  function getRole() {
    return (
      document.body?.dataset?.role ||
      localStorage.getItem('role') ||
      decodeJwtRoleFromToken() ||
      'student'
    );
  }

  function getDashboardId() {
    // Allow pages to set <body data-dashboard="student">; else use path
    return document.body?.dataset?.dashboard || window.location.pathname;
  }

  function applyAvatarInitial() {
    const profileName = (localStorage.getItem('user_profile_name') || '').trim();
    const storedUser = safeParse(localStorage.getItem('user'));

    const initialSource =
      profileName ||
      (storedUser?.first_name || '').trim() ||
      (storedUser?.email || '').trim() ||
      (storedUser?.role || '').trim();

    const letter = initialSource
      ? initialSource
          .trim()
          .charAt(0)
          .toUpperCase()
      : 'U';

    qsAll(document, '.user-avatar').forEach((node) => {
      const current = (node.textContent || '').trim();
      if (!current || current === 'U' || node.dataset.forceInitial === 'true') {
        node.textContent = letter || 'U';
      }
    });
  }

  function removeStorageKey(storage, key) {
    try {
      storage?.removeItem?.(key);
    } catch {}
  }

  function performLogout() {
    const keys = ['token', 'user', 'user_profile_name'];
    keys.forEach((key) => {
      removeStorageKey(localStorage, key);
      removeStorageKey(sessionStorage, key);
    });

    try {
      Object.keys(localStorage || {})
        .filter((key) => key.startsWith(`${STORAGE_NS}:last:`))
        .forEach((key) => removeStorageKey(localStorage, key));
    } catch {}

    window.location.href = '/pages/login.html';
  }

  function initUserMenus() {
    const menus = document.querySelectorAll('[data-user-menu]');
    if (!menus.length) return;

    let openState = null;

    const closeActiveMenu = (focusTrigger = false) => {
      if (!openState) return;
      const { panel, trigger } = openState;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (focusTrigger) {
        trigger.focus({ preventScroll: true });
      }
      openState = null;
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleEscapeKey);
    };

    const handleDocumentClick = (event) => {
      if (!openState) return;
      if (openState.menu.contains(event.target)) return;
      closeActiveMenu();
    };

    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeActiveMenu(true);
      }
    };

    menus.forEach((menu) => {
      const trigger = menu.querySelector('[data-user-menu-toggle]');
      const panel = menu.querySelector('[data-user-menu-panel]');
      if (!trigger || !panel) return;

      const openMenu = () => {
        if (!panel.hidden && openState?.menu === menu) return;
        closeActiveMenu();
        panel.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        const firstItem = panel.querySelector('.user-menu-item');
        if (firstItem) {
          firstItem.focus({ preventScroll: true });
        }
        openState = { menu, trigger, panel };
        document.addEventListener('click', handleDocumentClick);
        document.addEventListener('keydown', handleEscapeKey);
      };

      const toggleMenu = (event) => {
        event.preventDefault();
        if (panel.hidden) {
          openMenu();
        } else {
          closeActiveMenu();
        }
      };

      trigger.addEventListener('click', toggleMenu);
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' && panel.hidden) {
          event.preventDefault();
          openMenu();
        }
      });

      panel.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        event.preventDefault();
        closeActiveMenu();

        const action = (actionEl.dataset.action || '').toLowerCase();
        if (action === 'profile') {
          const profileUrl = menu.dataset.profileUrl || '/pages/profile.html';
          window.location.href = profileUrl;
        } else if (action === 'logout') {
          performLogout();
        }
      });

      panel.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          closeActiveMenu(true);
        }
      });
    });
  }

  function findBestSectionId(contentRoot, guessId) {
    if (!guessId) return null;
    // exact
    const exact = contentRoot.querySelector(`#${CSS.escape(guessId)}`);
    if (exact) return exact.id;
    const sections = qsAll(contentRoot, '.content-section[id]');
    // starts-with
    const starts = sections.find((s) => s.id.startsWith(guessId));
    if (starts) return starts.id;
    // contains (either direction)
    const contains = sections.find(
      (s) => s.id.includes(guessId) || guessId.includes(s.id)
    );
    if (contains) return contains.id;
    return null;
  }

  function normalizeLinkToSection(navEl, contentRoot) {
    const links = qsAll(navEl, '.sidebar-item');

    links.forEach((a) => {
      // role filter
      const role = getRole();
      const roles = (a.dataset.roles || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (roles.length && !roles.includes(role)) {
        a.setAttribute('hidden', '');
        a.classList.add('is-hidden-role');
        return;
      }

      // resolve target section
      let target = (a.dataset.section || a.dataset.target || '').trim();
      if (!target) {
        // infer from id="nav-xxx"
        const id = a.id || '';
        if (id.startsWith('nav-')) target = id.slice(4);
      }
      if (target) {
        const best = findBestSectionId(contentRoot, target);
        if (best) {
          a.dataset.section = best;
        } else {
          // mark as external if no matching section in this page
          a.dataset.external = 'true';
        }
      } else {
        a.dataset.external = 'true';
      }
    });

    return links.filter((a) => a.dataset.external !== 'true');
  }

  function activateSection({ navEl, contentRoot, links, targetId, save = true, focus = true }) {
    if (!targetId) return;
    const sections = qsAll(contentRoot, '.content-section');

    // Active link state
    links.forEach((l) => {
      const isActive = l.dataset.section === targetId;
      l.classList.toggle('active', isActive);
      if (isActive) l.setAttribute('aria-current', 'page');
      else l.removeAttribute('aria-current');
    });

    // Show/hide sections (uses [hidden] for a11y and .active for styling)
    sections.forEach((s) => {
      const on = s.id === targetId;
      s.classList.toggle('active', on);
      s.toggleAttribute('hidden', !on);
    });

    // Persist + update hash
    if (save) {
      const key = `${STORAGE_NS}:last:${getDashboardId()}:${getRole()}`;
      try {
        localStorage.setItem(key, targetId);
      } catch {}
      const h = `#${encodeURIComponent(targetId)}`;
      if (location.hash !== h) history.replaceState(null, '', h);
    }

    // Focus section without scrolling
    if (focus) {
      const activeSection = contentRoot.querySelector(
        `#${CSS.escape(targetId)}`
      );
      if (activeSection) {
        activeSection.setAttribute('tabindex', '-1');
        activeSection.focus({ preventScroll: true });
      }
    }
  }

  function initScope(scopeEl) {
    const navEl = scopeEl.querySelector('.left-sidebar');
    const contentRoot =
      scopeEl.querySelector('.content-container') || document;
    if (!navEl) return;

    const toggleBtn = scopeEl.querySelector('.mobile-nav-toggle');
    const body = document.body;
    const mq = window.matchMedia('(max-width: 980px)');
    let closeSidebar = () => {};
    let openSidebar = () => {};

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-controls', navEl.id || 'left-sidebar');
      toggleBtn.setAttribute('aria-expanded', 'false');

      const updateAria = () =>
        toggleBtn.setAttribute(
          'aria-expanded',
          body.classList.contains('sidebar-open') ? 'true' : 'false'
        );

      const handleEscape = (event) => {
        if (event.key === 'Escape') {
          closeSidebar();
        }
      };

      const handleOutsideClick = (event) => {
        if (!body.classList.contains('sidebar-open')) return;
        const target = event.target;
        if (!target) return;
        if (toggleBtn.contains(target)) return;
        if (navEl.contains(target)) return;
        closeSidebar();
      };

      closeSidebar = () => {
        body.classList.remove('sidebar-open');
        updateAria();
        document.removeEventListener('keydown', handleEscape);
        document.removeEventListener('click', handleOutsideClick);
      };

      openSidebar = () => {
        body.classList.add('sidebar-open');
        updateAria();
        document.addEventListener('keydown', handleEscape);
        document.addEventListener('click', handleOutsideClick);
      };

      toggleBtn.addEventListener('click', () => {
        if (body.classList.contains('sidebar-open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });

      mq.addEventListener?.('change', (evt) => {
        if (!evt.matches) {
          closeSidebar();
        }
      });
      if (!mq.addEventListener) {
        // Safari fallback
        mq.addListener((evt) => {
          if (!evt.matches) {
            closeSidebar();
          }
        });
      }
    }

    // Build link->section map (and filter by role)
    const links = normalizeLinkToSection(navEl, contentRoot);
    const sections = qsAll(contentRoot, '.content-section');

    // Delegate clicks
    navEl.addEventListener('click', (e) => {
      const a = e.target.closest('.sidebar-item');
      if (!a) return;
      if (a.dataset.external === 'true') return; // let real links go
      e.preventDefault();
      activateSection({
        navEl,
        contentRoot,
        links,
        targetId: a.dataset.section,
        save: true,
        focus: true,
      });

      if (mq.matches) {
        closeSidebar();
      }
    });

    // Sidebar toggle (right panel)
    qsAll(scopeEl, '.sidebar-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rs = scopeEl.querySelector('.right-sidebar');
        if (rs) rs.classList.toggle('visible');
      });
    });

    // Initial route selection
    const hashId = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    const key = `${STORAGE_NS}:last:${getDashboardId()}:${getRole()}`;
    const saved = localStorage.getItem(key);
    const defaultId = links[0]?.dataset.section;

    const isValid = (id) => id && sections.some((s) => s.id === id);
    const initial = isValid(hashId)
      ? hashId
      : isValid(saved)
      ? saved
      : defaultId;

    if (initial) {
      activateSection({
        navEl,
        contentRoot,
        links,
        targetId: initial,
        save: true,
        focus: false,
      });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyAvatarInitial();
    initUserMenus();
    const scopes = document.querySelectorAll('[data-dashboard-scope]');
    if (scopes.length) {
      scopes.forEach(initScope);
    } else {
      // default: whole document as one scope
      initScope(document);
    }
  });
})();
