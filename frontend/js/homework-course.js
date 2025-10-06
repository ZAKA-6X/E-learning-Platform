'use strict';

(function () {
  const API_BASE = '/api/library/student';
  const SELECTORS = {
    loading: '[data-homework-loading]',
    error: '[data-homework-error]',
    errorText: '#homework-error-text',
    retry: '[data-homework-retry]',
    empty: '[data-homework-empty]',
    content: '[data-homework-content]',
    list: '[data-exercise-list]',
    title: '#homework-title',
    meta: '#homework-meta',
    breadcrumb: '#homework-breadcrumb',
    summaryWrap: '#homework-summary',
    summaryCount: '#homework-summary-count',
    summaryProgress: '#homework-summary-progress',
  };

  const state = {
    courseId: null,
    token: null,
    course: null,
    summary: { total: 0, submitted: 0, pending: 0 },
    exercises: [],
  };

  document.addEventListener('DOMContentLoaded', () => {
    state.courseId = getQueryParam('courseId');
    if (!state.courseId) {
      showError('Cours introuvable.');
      hideElement(select(SELECTORS.loading));
      return;
    }

    hydrateHeaderFromQuery();
    setupBackButton();
    setupRetryButton();
    fetchExercises();
  });

  function getToken() {
    return localStorage.getItem('token');
  }

  function getQueryParam(key) {
    const params = new URLSearchParams(window.location.search || '');
    return params.get(key);
  }

  function select(selector) {
    return document.querySelector(selector);
  }

  function hydrateHeaderFromQuery() {
    const title = getQueryParam('courseTitle');
    const subjectName = getQueryParam('subjectName');
    const teacherName = getQueryParam('teacherName');

    if (title) {
      select(SELECTORS.title).textContent = title;
    }
    const metaParts = [];
    if (subjectName) metaParts.push(subjectName);
    if (teacherName) metaParts.push(teacherName);
    if (metaParts.length) {
      select(SELECTORS.meta).textContent = metaParts.join(' • ');
    }
  }

  function setupBackButton() {
    const backBtn = document.getElementById('homework-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.location.href = 'student-dashboard.html#devoirs';
      });
    }
  }

  function setupRetryButton() {
    const retryBtn = select(SELECTORS.retry);
    if (retryBtn) {
      retryBtn.addEventListener('click', fetchExercises);
    }
  }

  async function fetchExercises() {
    const loadingEl = select(SELECTORS.loading);
    const errorEl = select(SELECTORS.error);
    const emptyEl = select(SELECTORS.empty);
    const contentEl = select(SELECTORS.content);

    showElement(loadingEl);
    hideElement(errorEl);
    hideElement(emptyEl);
    hideElement(contentEl);

    state.token = getToken();
    if (!state.token) {
      showError('Veuillez vous reconnecter pour accéder aux exercices.');
      hideElement(loadingEl);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/courses/${state.courseId}/exercises`, {
        headers: {
          Authorization: `Bearer ${state.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (res.status === 401) {
        showError('Votre session a expiré. Merci de vous reconnecter.');
        hideElement(loadingEl);
        return;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const body = await res.json();
      state.course = body?.course || null;
      state.summary = normalizeSummary(body?.summary);
      state.exercises = Array.isArray(body?.exercises) ? body.exercises : [];

      renderHeader();
      renderSummary();
      renderExercises();

      if (!state.exercises.length) {
        showElement(emptyEl);
        hideElement(contentEl);
      } else {
        showElement(contentEl);
        hideElement(emptyEl);
      }
    } catch (err) {
      console.error('[homework-course] fetch error', err);
      showError("Impossible de charger les exercices.");
    } finally {
      hideElement(select(SELECTORS.loading));
    }
  }

  function normalizeSummary(summary) {
    const total = Number(summary?.total) || 0;
    const submitted = Number(summary?.submitted) || 0;
    const safeSubmitted = submitted > total ? total : submitted;
    const pending = total > safeSubmitted ? total - safeSubmitted : 0;
    return { total, submitted: safeSubmitted, pending };
  }

  function renderHeader() {
    if (!state.course) return;
    const titleEl = select(SELECTORS.title);
    const metaEl = select(SELECTORS.meta);
    const breadcrumbEl = select(SELECTORS.breadcrumb);

    if (state.course.title) titleEl.textContent = state.course.title;

    const metaParts = [];
    if (state.course.subject?.name) metaParts.push(state.course.subject.name);
    if (state.course.teacher?.name) metaParts.push(state.course.teacher.name);
    if (metaParts.length) {
      metaEl.textContent = metaParts.join(' • ');
    }

    if (state.course.class?.name) {
      breadcrumbEl.textContent = `Classe : ${state.course.class.name}`;
    }
  }

  function renderSummary() {
    const wrap = select(SELECTORS.summaryWrap);
    if (!wrap) return;

    if (!state.summary.total) {
      wrap.hidden = true;
      return;
    }

    const countEl = select(SELECTORS.summaryCount);
    const progressEl = select(SELECTORS.summaryProgress);
    const percentage = state.summary.total
      ? Math.round((state.summary.submitted / state.summary.total) * 100)
      : 0;

    countEl.textContent = `${state.summary.submitted}/${state.summary.total}`;
    progressEl.style.width = `${percentage}%`;
    const progressWrap = progressEl.parentElement;
    if (progressWrap) {
      progressWrap.setAttribute('aria-valuenow', String(percentage));
    }
    wrap.hidden = false;
  }

  function renderExercises() {
    const list = select(SELECTORS.list);
    if (!list) return;

    list.innerHTML = '';

    state.exercises.forEach((exercise) => {
      list.appendChild(buildExerciseCard(exercise));
    });
  }

  function buildExerciseCard(exercise) {
    const card = document.createElement('li');
    card.className = 'exercise-card';
    card.dataset.itemId = exercise.id;

    const header = document.createElement('div');
    header.className = 'exercise-card__header';

    const title = document.createElement('h3');
    title.className = 'exercise-card__title';
    title.textContent = exercise.name || 'Exercice';
    header.appendChild(title);

    const status = document.createElement('span');
    status.className = 'exercise-card__status';
    status.dataset.state = exercise.submission ? 'done' : 'pending';
    status.textContent = exercise.submission ? 'Remis' : 'À faire';
    header.appendChild(status);

    card.appendChild(header);

    const metaParts = [];
    if (exercise.section?.title) metaParts.push(exercise.section.title);
    const updatedValue = formatDate(exercise.updated_at || exercise.created_at);
    if (updatedValue) metaParts.push(`Mis à jour : ${updatedValue}`);
    if (exercise.size_bytes) metaParts.push(formatBytes(exercise.size_bytes));

    if (metaParts.length) {
      const meta = document.createElement('p');
      meta.className = 'exercise-card__meta';
      meta.textContent = metaParts.join(' • ');
      card.appendChild(meta);
    }

    const actions = document.createElement('div');
    actions.className = 'exercise-card__actions';
    if (exercise.url) {
      const viewLink = document.createElement('a');
      viewLink.href = buildMediaReaderUrl(exercise);
      viewLink.target = '_blank';
      viewLink.rel = 'noopener noreferrer';
      viewLink.className = 'exercise-card__action';
      viewLink.innerHTML = '<i class="fa-solid fa-eye"></i><span>Voir la ressource</span>';
      actions.appendChild(viewLink);
    } else {
      const unavailable = document.createElement('span');
      unavailable.className = 'exercise-card__action exercise-card__action--disabled';
      unavailable.textContent = 'Ressource indisponible';
      actions.appendChild(unavailable);
    }
    card.appendChild(actions);

    card.appendChild(buildSubmissionBlock(exercise));

    return card;
  }

  function buildSubmissionBlock(exercise) {
    const block = document.createElement('div');
    block.className = 'exercise-card__submission';

    if (exercise.submission) {
      const info = document.createElement('p');
      info.className = 'exercise-card__submission-info';
      const submittedDate = formatDate(exercise.submission.submitted_at);
      const label = submittedDate ? `Remis le ${submittedDate}` : 'Remis';
      info.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${label}`;
      if (exercise.submission.file_url) {
        const fileLink = document.createElement('a');
        fileLink.href = exercise.submission.file_url;
        fileLink.target = '_blank';
        fileLink.rel = 'noopener noreferrer';
        fileLink.className = 'exercise-card__submission-link';
        fileLink.textContent = exercise.submission.file_name || 'Télécharger';
        info.appendChild(document.createTextNode(' • '));
        info.appendChild(fileLink);
      }
      block.appendChild(info);
    } else {
      const info = document.createElement('p');
      info.className = 'exercise-card__submission-info';
      info.innerHTML = '<i class="fa-regular fa-circle"></i> Copier à rendre';
      block.appendChild(info);
    }

    block.appendChild(buildSubmissionForm(exercise));
    return block;
  }

  function buildSubmissionForm(exercise) {
    const form = document.createElement('form');
    form.className = 'exercise-card__form';
    form.enctype = 'multipart/form-data';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.name = 'submission';
    fileInput.accept = '.pdf,.doc,.docx,.txt,.md,.odt,.zip,.rar,.jpg,.jpeg,.png';
    fileInput.required = true;
    fileInput.className = 'exercise-card__file-input';

    const chooseBtn = document.createElement('label');
    chooseBtn.className = 'exercise-card__file-button';
    chooseBtn.innerHTML = '<i class="fa-solid fa-upload"></i><span>Choisir un fichier</span>';
    chooseBtn.appendChild(fileInput);

    const fileName = document.createElement('span');
    fileName.className = 'exercise-card__file-name';
    fileName.textContent = exercise.submission?.file_name || 'Aucun fichier sélectionné';

    fileInput.addEventListener('change', () => {
      fileName.textContent = fileInput.files?.[0]?.name || 'Aucun fichier sélectionné';
    });

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'exercise-card__submit';
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i><span>${
      exercise.submission ? 'Mettre à jour ma copie' : 'Envoyer ma copie'
    }</span>`;

    form.appendChild(chooseBtn);
    form.appendChild(fileName);
    form.appendChild(submitBtn);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!fileInput.files || !fileInput.files.length) {
        alert('Veuillez sélectionner un fichier.');
        return;
      }
      submitHomework(exercise, fileInput, submitBtn);
    });

    return form;
  }

  async function submitHomework(exercise, fileInput, submitBtn) {
    if (!state.token) {
      alert('Session expirée.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('is-loading');

    const formData = new FormData();
    formData.append('submission', fileInput.files[0]);

    try {
      const res = await fetch(
        `${API_BASE}/courses/${state.courseId}/exercises/${exercise.id}/submissions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${state.token}`,
          },
          body: formData,
        }
      );

      if (res.status === 401) {
        alert('Votre session a expiré. Merci de vous reconnecter.');
        return;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      await fetchExercises();
      fileInput.value = '';
    } catch (err) {
      console.error('[homework-course] submit error', err);
      alert("Échec de l'envoi du fichier. Veuillez réessayer.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('is-loading');
    }
  }

  function buildMediaReaderUrl(exercise) {
    if (!exercise?.url) return '#';
    const params = new URLSearchParams();
    params.set('file', exercise.url);
    if (exercise.name) params.set('title', exercise.name);
    params.set('kind', normalizeKind(exercise.kind, exercise.url));
    if (exercise.updated_at || exercise.created_at) {
      params.set('updated', exercise.updated_at || exercise.created_at);
    }
    if (state.course?.teacher?.name) params.set('author', state.course.teacher.name);
    const audienceParts = [];
    if (state.course?.title) audienceParts.push(state.course.title);
    if (state.course?.subject?.name) audienceParts.push(state.course.subject.name);
    if (exercise.section?.title) audienceParts.push(exercise.section.title);
    if (audienceParts.length) params.set('audience', audienceParts.join(' • '));
    if (exercise.section?.title) params.set('description', exercise.section.title);
    if (exercise.name) params.set('filename', exercise.name);
    params.set('returnView', 'homework');
    params.set('returnCourse', state.courseId);
    return `/pages/media-reader.html?${params.toString()}`;
  }

  function normalizeKind(kind, url) {
    const value = String(kind || '').toLowerCase();
    if (value && value !== 'other') return value;
    const clean = (url || '').split('?')[0].split('#')[0];
    const ext = clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
    if (['pdf', 'image', 'video', 'audio', 'link'].includes(ext)) return ext;
    if (['md', 'markdown'].includes(ext)) return 'markdown';
    return 'document';
  }

  function showError(message) {
    const errorEl = select(SELECTORS.error);
    const errorTextEl = select(SELECTORS.errorText);
    if (errorTextEl) errorTextEl.textContent = message;
    hideElement(select(SELECTORS.content));
    showElement(errorEl);
  }

  function showElement(el) {
    if (el) el.hidden = false;
  }

  function hideElement(el) {
    if (el) el.hidden = true;
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
})();
