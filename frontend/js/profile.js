// frontend/js/profile.js
(function () {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/pages/login.html';
    return;
  }

  const storedUser = safeParse(localStorage.getItem('user'));

  const el = {
    card: document.querySelector('.profile-card'),
    errorCard: document.getElementById('profile-error'),
    errorMessage: document.getElementById('profile-error-message'),
    retry: document.getElementById('profile-retry'),
    avatar: document.getElementById('profile-avatar'),
    roleBadge: document.getElementById('profile-role'),
    name: document.getElementById('profile-name'),
    fullName: document.getElementById('profile-fullname'),
    email: document.getElementById('profile-email'),
    phone: document.getElementById('profile-phone'),
    roleName: document.getElementById('profile-role-name'),
    school: document.getElementById('profile-school'),
    className: document.getElementById('profile-class'),
    status: document.getElementById('profile-status'),
    created: document.getElementById('profile-created'),
    homeLink: document.getElementById('profile-home-link'),
    backLink: document.getElementById('profile-back'),
  };

  const roleLabels = {
    admin: 'Administrateur',
    teacher: 'Enseignant',
    student: 'Étudiant',
    parent: 'Parent',
    guardian: 'Parent / Tuteur',
  };

  const dashboardRoutes = {
    admin: '/pages/admin-dashboard.html',
    teacher: '/pages/teacher-dashboard.html',
    student: '/pages/student-dashboard.html',
  };

  setupNavigation(storedUser?.role);
  loadProfile();

  el.retry?.addEventListener('click', (e) => {
    e.preventDefault();
    loadProfile();
  });

  function setupNavigation(role) {
    const homeHref = dashboardRoutes[role] || '/pages/teacher-dashboard.html';
    if (el.homeLink) el.homeLink.href = homeHref;
    if (el.backLink) el.backLink.href = homeHref;
  }

  async function loadProfile() {
    toggleError(false);
    try {
      const res = await fetch('/api/users/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || `${res.status} ${res.statusText}`);
      }

      populateProfile(body.profile);
    } catch (err) {
      console.error('profile load failed:', err);
      toggleError(true, err.message || 'Erreur inattendue');
    }
  }

  function populateProfile(profile) {
    if (!profile) {
      toggleError(true, "Profil introuvable");
      return;
    }

    const fullName = profile.full_name || buildName(profile.first_name, profile.last_name);
    const roleLabel = roleLabels[profile.role] || profile.role || '—';
    const schoolName = profile.school?.name || '—';
    const className = profile.class?.name ? formatClass(profile.class) : '—';

    setText(el.name, fullName || profile.email || 'Mon profil');
    setText(el.fullName, fullName || '—');
    setText(el.email, profile.email || '—');
    setText(el.phone, profile.phone || '—');
    setText(el.roleName, roleLabel);
    setText(el.status, formatStatus(profile.status));
    setText(el.school, schoolName);
    setText(el.className, className);
    setText(el.created, formatDate(profile.created_at));
    setText(el.roleBadge, roleLabel);

    const initial = (fullName || profile.email || ' ')[0]?.toUpperCase() || 'U';
    if (el.avatar) el.avatar.textContent = initial;

    // Save for other pages (avatar initial etc.)
    try {
      localStorage.setItem('user_profile_name', fullName || '');
    } catch {}
  }

  function toggleError(show, message) {
    if (el.errorCard) {
      el.errorCard.classList.toggle('hidden', !show);
    }
    if (el.card) {
      el.card.classList.toggle('hidden', show);
    }
    if (el.errorMessage) {
      el.errorMessage.textContent = message || '';
    }
  }

  function buildName(first, last) {
    return [first, last].filter(Boolean).join(' ').trim();
  }

  function formatDate(value) {
    if (!value) return '—';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '—';
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
    } catch {
      return '—';
    }
  }

  function formatStatus(status) {
    if (!status) return '—';
    switch (String(status).toLowerCase()) {
      case 'active':
        return 'Actif';
      case 'inactive':
        return 'Inactif';
      default:
        return status;
    }
  }

  function formatClass(klass) {
    if (!klass) return '—';
    if (klass.room) return `${klass.name} · salle ${klass.room}`;
    return klass.name;
  }

  function setText(node, text) {
    if (!node) return;
    node.textContent = text ?? '—';
  }

  function safeParse(json) {
    if (!json) return null;
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
})();
