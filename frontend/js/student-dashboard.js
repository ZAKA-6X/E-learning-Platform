'use strict';

(function () {
  const SUMMARY_SELECTOR = '[data-dashboard-summary]';
  const MAX_CLASSMATES = 6;
  const TODO_API_BASE = '/api/todos';
  const STUDENT_LIBRARY_API_BASE = '/api/library/student';
  const HOMEWORK_DETAIL_PAGE = '/pages/homework-course.html';

  const roleLabels = {
    admin: 'Administrateur',
    teacher: 'Enseignant',
    student: 'Étudiant',
    parent: 'Parent',
    guardian: 'Parent / Tuteur',
  };

  const libraryState = {
    assignments: [],
    cache: new Map(),
    subjectIndex: new Map(),
    panel: null,
    refs: {},
    view: 'subjects',
    activeSubjectId: null,
    activeCourse: null,
    currentClassName: '',
    restore: null,
  };

  const homeworkState = {
    panel: null,
    refs: {},
  };

  const libraryRestoreQuery = (() => {
    const params = new URLSearchParams(window.location.search || '');
    const viewRaw = params.get('libraryView');
    if (!viewRaw) return null;
    return {
      view: viewRaw.toLowerCase(),
      subject: params.get('librarySubject'),
      course: params.get('libraryCourse'),
      section: params.get('librarySection'),
    };
  })();

  if (libraryRestoreQuery) {
    libraryState.restore = libraryRestoreQuery;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const summaryRoot = document.querySelector(SUMMARY_SELECTOR);
    if (summaryRoot) {
      renderRandomExams();
      renderRandomCourses();
      renderRandomInbox();
    }

    loadTodos();
    loadClassmates();
    initHomeworkPanel();
    initLibraryPanel();
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
      const res = await fetch(TODO_API_BASE, {
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

  function initHomeworkPanel() {
    const panel = document.querySelector('[data-homework-panel]');
    if (!panel) return;

    homeworkState.panel = panel;
    homeworkState.refs = {
      loading: panel.querySelector('[data-homework-loading]'),
      error: panel.querySelector('[data-homework-error]'),
      errorText: panel.querySelector('[data-homework-error-text]'),
      empty: panel.querySelector('[data-homework-empty]'),
      content: panel.querySelector('[data-homework-content]'),
      retry: panel.querySelector('[data-homework-retry]'),
    };

    const { retry } = homeworkState.refs;
    if (retry && !retry.dataset.bound) {
      retry.dataset.bound = '1';
      retry.addEventListener('click', () => {
        showHomeworkLoading();
        loadStudentCourses();
      });
    }

    showHomeworkLoading();
  }

  function showHomeworkLoading() {
    if (!homeworkState.panel) return;
    const { loading, error, empty, content } = homeworkState.refs;
    if (content) content.innerHTML = '';
    showElement(loading);
    hideElement(error);
    hideElement(empty);
    hideElement(content);
  }

  function showHomeworkError(message) {
    if (!homeworkState.panel) return;
    const { loading, error, errorText, empty, content } = homeworkState.refs;
    if (content) {
      content.innerHTML = '';
      hideElement(content);
    }
    hideElement(loading);
    hideElement(empty);
    if (errorText) {
      errorText.textContent = message || 'Impossible de charger les devoirs.';
    }
    showElement(error);
  }

  function showHomeworkEmpty(message) {
    if (!homeworkState.panel) return;
    const { loading, error, empty, content } = homeworkState.refs;
    if (content) {
      content.innerHTML = '';
      hideElement(content);
    }
    hideElement(loading);
    hideElement(error);
    if (empty) {
      if (message) {
        const textEl = empty.querySelector('p');
        if (textEl) textEl.textContent = message;
      }
      showElement(empty);
    }
  }

  function renderHomeworkAssignments(assignments) {
    if (!homeworkState.panel) return;
    const { loading, error, empty, content } = homeworkState.refs;

    hideElement(loading);
    hideElement(error);

    if (!content) return;

    content.innerHTML = '';

    const courseEntries = [];
    (assignments || []).forEach((assignment) => {
      const courses = Array.isArray(assignment?.courses) ? assignment.courses : [];
      courses.forEach((course) => {
        courseEntries.push({ course, assignment });
      });
    });

    const actionableCourses = courseEntries.filter(({ course }) => {
      const summary = normalizeExerciseSummary(course?.exercise_summary);
      return summary.total > 0 && summary.submitted < summary.total;
    });

    if (!actionableCourses.length) {
      showHomeworkEmpty();
      return;
    }

    hideElement(empty);
    showElement(content);

    actionableCourses
      .sort((a, b) => {
        const dateA = new Date(a.course.updated_at || a.course.created_at || 0).getTime();
        const dateB = new Date(b.course.updated_at || b.course.created_at || 0).getTime();
        return dateB - dateA;
      })
      .forEach(({ course, assignment }) => {
        content.appendChild(buildHomeworkCard(course, assignment));
      });
  }

  function buildHomeworkCard(course, assignment) {
    const card = document.createElement('article');
    card.className = 'homework-card';

    const summary = normalizeExerciseSummary(course?.exercise_summary);
    const statusLabel = computeHomeworkStatus(summary, course?.status);
    const completion = summary.total ? Math.round((summary.submitted / summary.total) * 100) : 0;

    const header = document.createElement('div');
    header.className = 'homework-card__header';

    const title = document.createElement('h3');
    title.className = 'homework-card__title';
    title.textContent = course?.title || 'Cours';
    header.appendChild(title);

    if (statusLabel) {
      const status = document.createElement('span');
      status.className = 'homework-card__status';
      status.dataset.state = summary.total && summary.submitted >= summary.total ? 'done' : 'pending';
      status.textContent = statusLabel;
      header.appendChild(status);
    }

    card.appendChild(header);

    const infoParts = [];
    if (assignment?.subject?.name) {
      infoParts.push(`Matière : ${assignment.subject.name}`);
    }
    if (assignment?.teacher) {
      const teacherLabel = formatTeacherName(assignment.teacher);
      if (teacherLabel && teacherLabel !== 'Enseignant') {
        infoParts.push(`Enseignant : ${teacherLabel}`);
      }
    }
    if (infoParts.length) {
      const meta = document.createElement('p');
      meta.className = 'homework-card__meta';
      meta.textContent = infoParts.join(' • ');
      card.appendChild(meta);
    }

    const updatedValue = formatDate(course?.updated_at || course?.created_at);
    if (updatedValue) {
      const updated = document.createElement('p');
      updated.className = 'homework-card__meta';
      updated.textContent = `Mis à jour : ${updatedValue}`;
      card.appendChild(updated);
    }

    const stats = document.createElement('div');
    stats.className = 'homework-card__stats';
    if (summary.total > 0) {
      stats.textContent = `${summary.submitted}/${summary.total} exercice${summary.total > 1 ? 's' : ''} complété${summary.submitted > 1 ? 's' : ''}`;
    } else {
      stats.textContent = 'Aucun exercice disponible pour le moment.';
    }
    card.appendChild(stats);

    if (summary.total > 0) {
      const progress = document.createElement('div');
      progress.className = 'homework-card__progress';
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '100');
      progress.setAttribute('aria-valuenow', String(completion));

      const progressFill = document.createElement('div');
      progressFill.className = 'homework-card__progress-fill';
      progressFill.style.width = `${completion}%`;
      progress.appendChild(progressFill);
      card.appendChild(progress);
    }

    const footer = document.createElement('div');
    footer.className = 'homework-card__footer';
    const detailLink = document.createElement('a');
    detailLink.className = 'homework-card__action';
    detailLink.href = buildHomeworkDetailLink(course, assignment);
    detailLink.innerHTML = '<span>Voir les exercices</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    footer.appendChild(detailLink);
    card.appendChild(footer);

    return card;
  }

  function buildHomeworkDetailLink(course, assignment) {
    const params = new URLSearchParams();
    if (course?.id) params.set('courseId', course.id);
    if (course?.title) params.set('courseTitle', course.title);
    if (assignment?.subject?.id) params.set('subjectId', assignment.subject.id);
    if (assignment?.subject?.name) params.set('subjectName', assignment.subject.name);
    const teacherLabel = formatTeacherName(assignment?.teacher);
    if (teacherLabel) params.set('teacherName', teacherLabel);
    return `${HOMEWORK_DETAIL_PAGE}?${params.toString()}`;
  }

  function normalizeExerciseSummary(summary) {
    const total = Number(summary?.total) || 0;
    const submitted = Number(summary?.submitted) || 0;
    const safeSubmitted = submitted > total ? total : submitted;
    const pending = total > safeSubmitted ? total - safeSubmitted : 0;
    return { total, submitted: safeSubmitted, pending };
  }

  function computeHomeworkStatus(summary, courseStatus) {
    if (!summary.total) {
      return courseStatus ? formatCourseStatus(courseStatus) : 'En attente';
    }
    if (summary.submitted >= summary.total) return 'Terminé';
    if (summary.submitted > 0) return 'En cours';
    return 'À faire';
  }

  function formatCourseStatus(status) {
    if (!status) return null;
    const normalized = String(status).toLowerCase();
    switch (normalized) {
      case 'published':
        return 'Publié';
      case 'draft':
        return 'Brouillon';
      default:
        return status;
    }
  }

  function initLibraryPanel() {
    const panel = document.querySelector('[data-library-panel]');
    if (!panel) return;

    libraryState.panel = panel;
    libraryState.refs = {
      loading: panel.querySelector('[data-library-loading]'),
      error: panel.querySelector('[data-library-error]'),
      errorText: panel.querySelector('[data-library-error-text]'),
      empty: panel.querySelector('[data-library-empty]'),
      content: panel.querySelector('[data-library-content]'),
      meta: panel.querySelector('[data-library-meta]'),
      breadcrumb: panel.querySelector('[data-library-breadcrumb]'),
      backSubjects: panel.querySelector('[data-library-back-subjects]'),
      backCourses: panel.querySelector('[data-library-back-courses]'),
      subjects: panel.querySelector('[data-library-subjects]'),
      courses: panel.querySelector('[data-library-courses]'),
      detail: panel.querySelector('[data-library-detail]'),
    };

    const retryBtn = panel.querySelector('[data-library-retry]');
    if (retryBtn && !retryBtn.dataset.bound) {
      retryBtn.dataset.bound = '1';
      retryBtn.addEventListener('click', () => loadStudentCourses());
    }

    const { backSubjects, backCourses } = libraryState.refs;
    if (backSubjects && !backSubjects.dataset.bound) {
      backSubjects.dataset.bound = '1';
      backSubjects.addEventListener('click', () => showSubjects());
    }
    if (backCourses && !backCourses.dataset.bound) {
      backCourses.dataset.bound = '1';
      backCourses.addEventListener('click', () => {
        if (libraryState.activeSubjectId) {
          showCourses(libraryState.activeSubjectId);
        } else {
          showSubjects();
        }
      });
    }

    loadStudentCourses();
  }

  async function loadStudentCourses() {
    const panel = libraryState.panel;
    if (!panel) {
      showHomeworkLoading();
      return;
    }
    const { loading, error, errorText, empty, content } = libraryState.refs;

    libraryState.assignments = [];
    showElement(loading);
    hideElement(error);
    hideElement(empty);
    hideElement(content);
    showHomeworkLoading();

    const token = getToken();
    if (!token) {
      hideElement(loading);
      if (errorText) errorText.textContent = 'Veuillez vous reconnecter pour accéder à la bibliothèque.';
      showElement(error);
      showHomeworkError('Veuillez vous reconnecter pour accéder aux devoirs.');
      return;
    }

    try {
      const res = await fetch(`${STUDENT_LIBRARY_API_BASE}/courses`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      libraryState.assignments = Array.isArray(body?.assignments) ? body.assignments : [];
      libraryState.subjectIndex = buildSubjectIndex(libraryState.assignments);
      libraryState.cache.clear();
      libraryState.activeSubjectId = null;
      libraryState.activeCourse = null;
      libraryState.currentClassName = body?.class?.name || libraryState.assignments?.[0]?.class?.name || '';

      renderHomeworkAssignments(libraryState.assignments);
      showSubjects();
      restoreLibraryViewIfNeeded();
    } catch (err) {
      console.error('Failed to load library courses:', err);
      if (errorText) errorText.textContent = 'Impossible de récupérer les cours.';
      hideElement(content);
      hideElement(empty);
      showElement(error);
      showHomeworkError('Impossible de charger les devoirs.');
    } finally {
      hideElement(loading);
      if (homeworkState.refs?.loading) hideElement(homeworkState.refs.loading);
    }
  }

  function buildSubjectIndex(assignments) {
    const map = new Map();
    (assignments || []).forEach((assignment) => {
      const subject = assignment?.subject;
      const key = subject?.id || `assignment-${assignment?.id}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          id: subject?.id || null,
          name: subject?.name || 'Matière',
          assignments: [],
          teacherNames: new Set(),
          courseCount: 0,
        });
      }
      const entry = map.get(key);
      entry.assignments.push(assignment);
      const teacherName = formatTeacherName(assignment?.teacher);
      if (teacherName) entry.teacherNames.add(teacherName);
      const courses = Array.isArray(assignment?.courses) ? assignment.courses : [];
      entry.courseCount += courses.length;
    });
    return map;
  }

  function showSubjects() {
    const { content, empty, subjects, courses, detail } = libraryState.refs;
    if (!subjects) return;

    libraryState.view = 'subjects';
    libraryState.activeSubjectId = null;
    libraryState.activeCourse = null;

    const entries = Array.from(libraryState.subjectIndex.values());
    subjects.innerHTML = '';

    if (!entries.length) {
      hideElement(content);
      showElement(empty);
      updateBreadcrumb();
      return;
    }

    showElement(content);
    hideElement(empty);

    entries
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' }))
      .forEach((entry) => {
        subjects.appendChild(buildSubjectCard(entry));
      });

    subjects.hidden = false;
    if (courses) courses.hidden = true;
    if (detail) detail.hidden = true;

    updateBreadcrumb();
  }

  function buildSubjectCard(entry) {
    const card = document.createElement('article');
    card.className = 'subject-card';

    const title = document.createElement('h3');
    title.className = 'subject-card__title';
    title.textContent = entry.name || 'Matière';
    card.appendChild(title);

    const teachersCount = entry.teacherNames.size;
    const teacherMeta = document.createElement('p');
    teacherMeta.className = 'subject-card__meta';
    teacherMeta.textContent = teachersCount
      ? teachersCount === 1
        ? `Enseignant : ${Array.from(entry.teacherNames)[0]}`
        : `${teachersCount} enseignants`
      : 'Aucun enseignant assigné';
    card.appendChild(teacherMeta);

    const courseMeta = document.createElement('p');
    courseMeta.className = 'subject-card__meta';
    courseMeta.textContent = entry.courseCount
      ? `${entry.courseCount} cours publiés`
      : 'Aucun cours publié pour le moment';
    card.appendChild(courseMeta);

    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'subject-card__action';
    action.textContent = entry.courseCount ? 'Voir les cours' : 'Voir les enseignants';
    action.addEventListener('click', () => showCourses(entry.key));
    card.appendChild(action);

    return card;
  }

  function showCourses(subjectKey) {
    const entry = libraryState.subjectIndex.get(subjectKey);
    if (!entry) {
      showSubjects();
      return;
    }

    const { content, empty, subjects, courses, detail } = libraryState.refs;
    if (!courses) return;

    libraryState.view = 'courses';
    libraryState.activeSubjectId = subjectKey;
    libraryState.activeCourse = null;

    hideElement(empty);
    showElement(content);

    subjects.hidden = true;
    courses.hidden = false;
    if (detail) detail.hidden = true;

    courses.innerHTML = '';

    const items = [];
    entry.assignments.forEach((assignment) => {
      const courseList = Array.isArray(assignment?.courses) ? assignment.courses : [];
      courseList.forEach((course) => {
        items.push({ course, assignment });
      });
    });

    if (!items.length) {
      const msg = document.createElement('div');
      msg.className = 'library-inline-message';
      msg.textContent = 'Aucun cours publié pour cette matière pour le moment.';
      courses.appendChild(msg);
    } else {
      items
        .sort((a, b) => {
          const dateA = new Date(a.course.updated_at || a.course.created_at || 0).getTime();
          const dateB = new Date(b.course.updated_at || b.course.created_at || 0).getTime();
          return dateB - dateA;
        })
        .forEach((item) => {
          courses.appendChild(buildCourseCard(item.course, item.assignment));
        });
    }

    updateBreadcrumb();
  }

  function buildCourseCard(course, assignment) {
    const card = document.createElement('article');
    card.className = 'library-card';

    const header = document.createElement('div');
    header.className = 'library-card__header';

    const title = document.createElement('h3');
    title.className = 'library-card__title';
    title.textContent = course.title || 'Cours';
    header.appendChild(title);

    card.appendChild(header);

    const metaList = document.createElement('ul');
    metaList.className = 'library-card__meta';

    const teacherItem = document.createElement('li');
    teacherItem.textContent = `Enseignant : ${formatTeacherName(assignment?.teacher)}`;
    metaList.appendChild(teacherItem);

    if (assignment?.subject?.name) {
      const subjectItem = document.createElement('li');
      subjectItem.textContent = `Matière : ${assignment.subject.name}`;
      metaList.appendChild(subjectItem);
    }

    const updatedItem = document.createElement('li');
    updatedItem.textContent = `Mis à jour : ${formatDate(course.updated_at || course.created_at)}`;
    metaList.appendChild(updatedItem);

    card.appendChild(metaList);

    const footer = document.createElement('div');
    footer.className = 'library-card__footer';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'library-card__action';
    openBtn.innerHTML = '<span>Voir le contenu</span><i class="fa-solid fa-arrow-right" aria-hidden="true"></i>';
    openBtn.addEventListener('click', () => openCourseDetail(course, assignment));
    footer.appendChild(openBtn);

    card.appendChild(footer);

    return card;
  }

  function openCourseDetail(course, assignment) {
    const { subjects, courses, detail } = libraryState.refs;
    if (!detail) return;

    libraryState.view = 'detail';
    libraryState.activeCourse = { course, assignment };

    if (subjects) subjects.hidden = true;
    if (courses) courses.hidden = true;
    detail.hidden = false;

    const teacherLabel = formatTeacherName(assignment?.teacher);
    const subjectLabel = assignment?.subject?.name || '';

    detail.innerHTML = `
      <div class="library-detail__header">
        <h3 class="library-detail__title">${escapeHtml(course.title || 'Cours')}</h3>
        <p class="library-detail__meta">${escapeHtml([subjectLabel, teacherLabel].filter(Boolean).join(' • '))}</p>
        <p class="library-detail__meta">Mis à jour : ${escapeHtml(formatDate(course.updated_at || course.created_at))}</p>
      </div>
      <div class="library-detail__body">
        <div class="library-sections__loading" data-library-detail-loading>
          <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
          <span>Chargement des ressources…</span>
        </div>
        <div class="library-sections__error" data-library-detail-error hidden>
          <span>Impossible de charger ce cours.</span>
        </div>
        <div class="library-sections" data-library-detail-container hidden></div>
      </div>
    `;

    updateBreadcrumb();

    const loadingEl = detail.querySelector('[data-library-detail-loading]');
    const errorEl = detail.querySelector('[data-library-detail-error]');
    const container = detail.querySelector('[data-library-detail-container]');

    if (libraryState.cache.has(course.id)) {
      hideElement(loadingEl);
      renderLibrarySections(container, libraryState.cache.get(course.id));
      showElement(container);
      return;
    }

    showElement(loadingEl);
    hideElement(errorEl);
    hideElement(container);

    fetchStudentLibrary(course.id)
      .then((data) => {
        libraryState.cache.set(course.id, data);
        hideElement(loadingEl);
        renderLibrarySections(container, data);
        showElement(container);
      })
      .catch((err) => {
        console.error('Failed to load library content:', err);
        hideElement(loadingEl);
        showElement(errorEl);
      });
  }

  function restoreLibraryViewIfNeeded() {
    const restore = libraryState.restore;
    if (!restore) return;

    // ensure we only use it once
    libraryState.restore = null;

    const subjectKey = restore.subject && libraryState.subjectIndex.has(restore.subject)
      ? restore.subject
      : restore.subject
      ? restore.subject
      : null;

    if (restore.view === 'subjects' || !restore.view) {
      updateBreadcrumb();
      return;
    }

    if (subjectKey && libraryState.subjectIndex.has(subjectKey)) {
      showCourses(subjectKey);
    } else {
      if (restore.view === 'courses' || restore.view === 'detail') {
        // fallback: show first subject with courses
        const firstKey = Array.from(libraryState.subjectIndex.keys())[0];
        if (firstKey) {
          showCourses(firstKey);
          restore.subject = firstKey;
        } else {
          updateBreadcrumb();
          return;
        }
      }
    }

    if (restore.view === 'courses') {
      updateBreadcrumb();
      return;
    }

    if (restore.view === 'detail') {
      const effectiveSubject = restore.subject || Array.from(libraryState.subjectIndex.keys())[0];
      if (!effectiveSubject || !libraryState.subjectIndex.has(effectiveSubject)) {
        updateBreadcrumb();
        return;
      }

      const entry = libraryState.subjectIndex.get(effectiveSubject);
      if (!entry) {
        updateBreadcrumb();
        return;
      }

      let target = null;
      entry.assignments.some((assignment) => {
        const courses = Array.isArray(assignment?.courses) ? assignment.courses : [];
        const found = courses.find((course) => String(course.id) === String(restore.course));
        if (found) {
          target = { course: found, assignment };
          return true;
        }
        return false;
      });

      if (target) {
        openCourseDetail(target.course, target.assignment);
      } else {
        // fallback to first available course if any
        for (const assignment of entry.assignments) {
          const courseList = Array.isArray(assignment?.courses) ? assignment.courses : [];
          if (courseList.length) {
            openCourseDetail(courseList[0], assignment);
            break;
          }
        }
      }
    }

    updateBreadcrumb();
  }

  function updateBreadcrumb() {
    const { breadcrumb, backSubjects, backCourses, meta } = libraryState.refs;
    if (!breadcrumb) return;

    const className = libraryState.currentClassName;
    const subjectEntry = libraryState.activeSubjectId
      ? libraryState.subjectIndex.get(libraryState.activeSubjectId)
      : null;

    if (libraryState.view === 'subjects') {
      if (meta) {
        meta.textContent = className ? `Classe : ${className}` : '';
        meta.hidden = !className;
      }
      breadcrumb.hidden = !(meta && !meta.hidden);
      hideElement(backSubjects);
      hideElement(backCourses);
      return;
    }

    breadcrumb.hidden = false;
    if (meta) meta.hidden = false;

    if (libraryState.view === 'courses') {
      showElement(backSubjects);
      hideElement(backCourses);
      if (meta) {
        const subjectName = subjectEntry?.name || 'Matière';
        meta.textContent = className ? `${subjectName} • ${className}` : subjectName;
      }
      return;
    }

    if (libraryState.view === 'detail') {
      showElement(backSubjects);
      showElement(backCourses);
      if (meta) {
        const subjectName = subjectEntry?.name || 'Matière';
        const courseTitle = libraryState.activeCourse?.course?.title || 'Cours';
        meta.textContent = `${subjectName} • ${courseTitle}`;
      }
    }
  }

  async function fetchStudentLibrary(libraryId) {
    const token = getToken();
    if (!token) throw new Error('AUTH_MISSING');

    const res = await fetch(`${STUDENT_LIBRARY_API_BASE}/libraries/${libraryId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `HTTP ${res.status}`);
    }

    return res.json();
  }

  function renderLibrarySections(container, payload) {
    if (!container) return;
    container.innerHTML = '';

    const sections = Array.isArray(payload?.library?.sections)
      ? payload.library.sections
      : [];
    const courseCtx = libraryState.activeCourse || {};
    const assignmentCtx = courseCtx.assignment || null;
    const courseInfo = courseCtx.course || payload?.library || {};

    if (!sections.length) {
      const empty = document.createElement('p');
      empty.className = 'library-sections__empty';
      empty.textContent = 'Aucune ressource disponible pour le moment.';
      container.appendChild(empty);
      return;
    }

    sections.forEach((section) => {
      const sectionEl = document.createElement('article');
      sectionEl.className = 'library-section';

      const sectionTitle = document.createElement('h4');
      sectionTitle.className = 'library-section__title';
      sectionTitle.textContent = section.title || 'Section';
      sectionEl.appendChild(sectionTitle);

      const resourcesWrap = document.createElement('div');
      resourcesWrap.className = 'resource-grid';

      const items = Array.isArray(section?.items) ? section.items : [];
      if (!items.length) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'library-section__empty';
        emptyMsg.textContent = 'Aucune ressource dans cette section.';
        sectionEl.appendChild(emptyMsg);
      } else {
        items.forEach((item) => {
          resourcesWrap.appendChild(
            buildResourceCard(item, {
              section,
              assignment: assignmentCtx,
              course: courseInfo,
            })
          );
        });
        sectionEl.appendChild(resourcesWrap);
      }

      container.appendChild(sectionEl);
    });
  }

  function buildResourceCard(item, context = {}) {
    const card = document.createElement('div');
    card.className = 'resource-card';

    const top = document.createElement('div');
    top.className = 'resource-card__top';

    const iconWrap = document.createElement('span');
    iconWrap.className = 'resource-card__icon';
    iconWrap.innerHTML = iconForKind(item.kind);

    const infoWrap = document.createElement('div');

    const title = document.createElement('p');
    title.className = 'resource-card__title';
    title.textContent = item.name || 'Ressource';

    const meta = document.createElement('p');
    meta.className = 'resource-card__meta';
    meta.textContent = resourceMeta(item, context.section);

    infoWrap.appendChild(title);
    infoWrap.appendChild(meta);

    top.appendChild(iconWrap);
    top.appendChild(infoWrap);
    card.appendChild(top);

    const actions = document.createElement('div');
    actions.className = 'resource-card__actions';

    if (item.url) {
      const readerLink = document.createElement('a');
      readerLink.href = buildMediaReaderUrl(item, context);
      readerLink.rel = 'noopener noreferrer';
      readerLink.textContent = 'Lire';
      actions.appendChild(readerLink);

      const downloadLink = document.createElement('a');
      downloadLink.href = item.url;
      downloadLink.target = '_blank';
      downloadLink.rel = 'noopener noreferrer';
      downloadLink.textContent = 'Télécharger';
      actions.appendChild(downloadLink);
    } else {
      const unavailable = document.createElement('span');
      unavailable.textContent = 'Ressource indisponible';
      unavailable.className = 'muted';
      actions.appendChild(unavailable);
    }

    card.appendChild(actions);

    return card;
  }

  function buildMediaReaderUrl(item, context = {}) {
    const params = new URLSearchParams();
    const course = context.course || {};
    const assignment = context.assignment || {};
    const section = context.section || {};

    if (item.url) params.set('file', item.url);
    if (item.name) params.set('title', item.name);

    const extension = (() => {
      const source = item?.url || item?.name || '';
      if (!source) return '';
      const clean = source.split('?')[0].split('#')[0];
      const parts = clean.split('.');
      return parts.length > 1 ? parts.pop().toLowerCase() : '';
    })();

    let kindParam = item.kind || 'document';
    if (extension && ['md', 'markdown', 'mdown', 'mkd'].includes(extension)) {
      kindParam = 'markdown';
    }
    params.set('kind', kindParam);
    if (item.updated_at || item.created_at) {
      params.set('updated', item.updated_at || item.created_at);
    }
    const teacherName = formatTeacherName(assignment?.teacher);
    if (teacherName) params.set('author', teacherName);
    const audienceParts = [];
    if (course?.title) audienceParts.push(course.title);
    if (assignment?.subject?.name) audienceParts.push(assignment.subject.name);
    if (section?.title) audienceParts.push(section.title);
    if (audienceParts.length) params.set('audience', audienceParts.join(' • '));
    if (section?.title) params.set('description', section.title);
    if (item.name) params.set('filename', item.name);

    if (libraryState.view === 'detail' || libraryState.view === 'courses') {
      params.set('returnView', 'detail');
      if (libraryState.activeSubjectId) params.set('returnSubject', libraryState.activeSubjectId);
      const courseId = course?.id || libraryState.activeCourse?.course?.id;
      if (courseId) params.set('returnCourse', courseId);
      if (context.section?.id) params.set('returnSection', context.section.id);
    }

    return `/pages/media-reader.html?${params.toString()}`;
  }

  function resourceMeta(item, section) {
    const parts = [];
    const kindLabel = labelForKind(item.kind);
    if (kindLabel) parts.push(kindLabel);
    if (Number.isFinite(Number(item.size_bytes))) {
      parts.push(formatBytes(Number(item.size_bytes)));
    }
    const dateValue = item.updated_at || item.created_at;
    if (dateValue) {
      parts.push(formatDate(dateValue));
    }
    if (section?.title) {
      parts.push(section.title);
    }
    return parts.join(' • ');
  }

  function labelForKind(kind) {
    switch (String(kind || '').toLowerCase()) {
      case 'pdf':
        return 'PDF';
      case 'image':
        return 'Image';
      case 'video':
        return 'Vidéo';
      case 'audio':
        return 'Audio';
      case 'link':
        return 'Lien';
      default:
        return 'Ressource';
    }
  }

  function iconForKind(kind) {
    switch (String(kind || '').toLowerCase()) {
      case 'pdf':
        return '<i class="fa-solid fa-file-pdf"></i>';
      case 'image':
        return '<i class="fa-solid fa-image"></i>';
      case 'video':
        return '<i class="fa-solid fa-film"></i>';
      case 'audio':
        return '<i class="fa-solid fa-music"></i>';
      case 'link':
        return '<i class="fa-solid fa-link"></i>';
      default:
        return '<i class="fa-solid fa-file"></i>';
    }
  }

  function formatTeacherName(teacher) {
    if (!teacher) return 'Inconnu';
    const parts = [];
    if (teacher.first_name) parts.push(teacher.first_name);
    if (teacher.last_name) parts.push(teacher.last_name);
    const joined = parts.join(' ').trim();
    if (joined) return joined;
    if (teacher.email) return teacher.email;
    return 'Enseignant';
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso));
    } catch (err) {
      return iso;
    }
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return '';
    const units = ['octets', 'Ko', 'Mo', 'Go', 'To'];
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    const formatted = unitIndex === 0 ? `${Math.round(size)} ${units[unitIndex]}` : `${size.toFixed(1)} ${units[unitIndex]}`;
    return formatted.replace('.', ',');
  }

  function showElement(el) {
    if (el) el.hidden = false;
  }

  function hideElement(el) {
    if (el) el.hidden = true;
  }
})();
