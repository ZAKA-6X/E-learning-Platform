'use strict';

(function () {
  const SUMMARY_SELECTOR = '[data-dashboard-summary]';
  const MAX_CLASSMATES = 6;

  const roleLabels = {
    admin: 'Administrateur',
    teacher: 'Enseignant',
    student: 'Étudiant',
    parent: 'Parent',
    guardian: 'Parent / Tuteur',
  };

  document.addEventListener('DOMContentLoaded', () => {
    const summaryRoot = document.querySelector(SUMMARY_SELECTOR);
    if (!summaryRoot) return;

    renderRandomExams();
    renderRandomCourses();
    renderRandomInbox();
    loadTodos();
    loadClassmates();
  });

  function getToken() {
    return localStorage.getItem('token');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderSummary(listId, items, emptyMessage, renderItem) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    if (!items || !items.length) {
      listEl.innerHTML = `<li class="summary-empty">${emptyMessage}</li>`;
      return;
    }

    listEl.innerHTML = items.map(renderItem).join('');
  }

  function formatFutureDate(daysAhead) {
    const target = new Date();
    target.setDate(target.getDate() + Number(daysAhead || 0));
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(target);
  }

  function pickItems(pool, count) {
    const copy = Array.from(pool || []);
    const picked = [];
    while (copy.length && picked.length < count) {
      const index = Math.floor(Math.random() * copy.length);
      picked.push(copy.splice(index, 1)[0]);
    }
    return picked;
  }

  function renderRandomExams() {
    const examPool = [
      { subject: 'Mathématiques', type: 'Contrôle continu', days: 2, room: 'Salle 203' },
      { subject: 'Physique', type: 'TP noté', days: 4, room: 'Laboratoire 2' },
      { subject: 'Histoire', type: 'QCM', days: 5, room: 'Salle 112' },
      { subject: 'Anglais', type: 'Oral', days: 3, room: 'Salle 305' },
      { subject: 'SVT', type: 'Projet', days: 6, room: 'Salle 216' },
    ];

    const items = pickItems(examPool, 2).map((exam) => {
      const title = `${exam.subject} — ${exam.type}`;
      const meta = `${formatFutureDate(exam.days)} • ${exam.room}`;
      return { title, meta };
    });

    renderSummary(
      'summary-exams',
      items,
      'Aucun examen imminent.',
      (item) =>
        `<li class="summary-item">
          <p class="summary-item-title">${escapeHtml(item.title)}</p>
          <p class="summary-item-meta">${escapeHtml(item.meta)}</p>
        </li>`
    );
  }

  function renderRandomCourses() {
    const coursePool = [
      { course: 'Physique — Ondes', teacher: 'Mme Benali', time: '08:00', room: 'Bât. B • 204' },
      { course: 'Maths — Intégrales', teacher: 'M. Diallo', time: '10:00', room: 'Bât. C • 101' },
      { course: 'Français — Dissertation', teacher: 'Mme Dupont', time: '11:30', room: 'Salle polyvalente' },
      { course: 'SVT — Génétique', teacher: 'M. Moreau', time: '14:00', room: 'Laboratoire 1' },
      { course: 'EPS — Basket', teacher: 'Coach Karim', time: '16:00', room: 'Gymnase' },
    ];

    const items = pickItems(coursePool, 2).map((course) => {
      const title = `${course.course}`;
      const meta = `${course.time} • ${course.teacher} • ${course.room}`;
      return { title, meta };
    });

    renderSummary(
      'summary-courses',
      items,
      'Aucun cours planifié.',
      (item) =>
        `<li class="summary-item">
          <p class="summary-item-title">${escapeHtml(item.title)}</p>
          <p class="summary-item-meta">${escapeHtml(item.meta)}</p>
        </li>`
    );
  }

  function renderRandomInbox() {
    const inboxPool = [
      { author: 'Prof. Martin', subject: 'Retour sur votre exposé', time: 'Aujourd’hui • 09:15' },
      { author: 'Vie scolaire', subject: 'Rappel : sortie pédagogique', time: 'Hier • 18:42' },
      { author: 'Prof. Ndiaye', subject: 'Nouvelle ressource en physique', time: 'Hier • 14:27' },
      { author: 'Administration', subject: 'Réunion parents/professeurs', time: 'Lundi • 11:05' },
      { author: 'Club Robotique', subject: 'Atelier spécial samedi', time: 'Dimanche • 16:10' },
    ];

    const items = pickItems(inboxPool, 2);

    renderSummary(
      'summary-inbox',
      items,
      'Aucun nouveau message.',
      (item) =>
        `<li class="summary-item">
          <p class="summary-item-title">${escapeHtml(item.author)}</p>
          <p class="summary-item-meta">${escapeHtml(item.subject)} • ${escapeHtml(item.time)}</p>
        </li>`
    );
  }

  async function loadTodos() {
    const listId = 'summary-todos';
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    const token = getToken();
    if (!token) {
      listEl.innerHTML = '<li class="summary-empty">Connectez-vous pour voir vos tâches.</li>';
      return;
    }

    try {
      const res = await fetch('/todos', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const todos = await res.json();
      const upcoming = Array.isArray(todos) ? todos.slice(0, 2) : [];

      if (!upcoming.length) {
        listEl.innerHTML = '<li class="summary-empty">Aucune tâche en attente.</li>';
        return;
      }

      listEl.innerHTML = upcoming
        .map((todo) => {
          const status = todo.status ? 'Terminé' : 'À faire';
          return `
            <li class="summary-item">
              <p class="summary-item-title">${escapeHtml(todo.data || 'Tâche')}</p>
              <p class="summary-item-meta">${status}</p>
            </li>
          `;
        })
        .join('');
    } catch (err) {
      console.error('Failed to load summary todos:', err);
      listEl.innerHTML = '<li class="summary-empty">Impossible de charger les tâches.</li>';
    }
  }

  async function loadClassmates() {
    const listEl = document.getElementById('classmates-list');
    const metaEl = document.getElementById('classmates-meta');
    if (!listEl) return;

    const token = getToken();
    if (!token) {
      if (metaEl) metaEl.textContent = 'Non connecté';
      listEl.innerHTML = '<li class="summary-empty">Connectez-vous pour voir vos camarades.</li>';
      return;
    }

    try {
      const res = await fetch('/api/users/classmates', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      const classmates = Array.isArray(body?.classmates)
        ? body.classmates.slice(0, MAX_CLASSMATES)
        : [];

      if (metaEl) {
        const countTotal = Array.isArray(body?.classmates) ? body.classmates.length : 0;
        const className = body?.class?.name || null;
        const countLabel = countTotal
          ? `${countTotal} camarade${countTotal > 1 ? 's' : ''}`
          : 'Aucun camarade';
        metaEl.textContent = className ? `${className} • ${countLabel}` : countLabel;
      }

      if (!classmates.length) {
        listEl.innerHTML = '<li class="summary-empty">Aucun camarade pour le moment.</li>';
        return;
      }

      listEl.innerHTML = classmates
        .map((mate) => {
          const displayName = mate.full_name || mate.first_name || mate.email || 'Camarade';
          const initial = (displayName || ' ')[0]?.toUpperCase() || 'C';
          const roleLabel = roleLabels[mate.role] || mate.role || 'Étudiant';
          const email = mate.email ? ` • ${mate.email}` : '';

          return `
            <li class="classmate-row">
              <span class="classmate-avatar" aria-hidden="true">${escapeHtml(initial)}</span>
              <div>
                <p class="classmate-info-title">${escapeHtml(displayName)}</p>
                <p class="classmate-info-meta">${escapeHtml(roleLabel)}${escapeHtml(email)}</p>
              </div>
            </li>
          `;
        })
        .join('');

      const remaining = Array.isArray(body?.classmates)
        ? Math.max(0, body.classmates.length - classmates.length)
        : 0;

      if (remaining > 0) {
        listEl.insertAdjacentHTML(
          'beforeend',
          `<li class="summary-empty">+${remaining} autre${remaining > 1 ? 's' : ''} camarade${
            remaining > 1 ? 's' : ''
          }</li>`
        );
      }
    } catch (err) {
      console.error('Failed to load classmates:', err);
      if (metaEl) metaEl.textContent = 'Erreur';
      listEl.innerHTML = '<li class="summary-empty">Impossible de charger les camarades.</li>';
    }
  }
})();
