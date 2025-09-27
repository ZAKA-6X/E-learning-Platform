(function () {
  const inbox = document.querySelector('[data-inbox]');
  if (!inbox) return;

  const els = {
    teacherList: inbox.querySelector('[data-inbox-teacher-list]'),
    teachersLoading: inbox.querySelector('[data-inbox-teachers-loading]'),
    teachersEmpty: inbox.querySelector('[data-inbox-teachers-empty]'),
    teachersError: inbox.querySelector('[data-inbox-teachers-error]'),
    teachersErrorText: inbox.querySelector('[data-inbox-teachers-error-text]'),
    conversationTitle: inbox.querySelector('[data-inbox-conversation-title]'),
    conversationMeta: inbox.querySelector('[data-inbox-conversation-meta]'),
    conversationHeader: inbox.querySelector('[data-inbox-conversation-header]'),
    messages: inbox.querySelector('[data-inbox-messages]'),
    conversationEmpty: inbox.querySelector('[data-inbox-conversation-empty]'),
    composer: inbox.querySelector('[data-inbox-composer]'),
    textarea: inbox.querySelector('[data-inbox-input]'),
    sendButton: inbox.querySelector('[data-inbox-send]'),
  };

  const token = localStorage.getItem('token');

  const state = {
    teachers: [],
    conversations: new Map(),
    activeTeacherId: null,
  };

  toggleComposer(false);

  if (!token) {
    showTeachersError('Session expirée. Veuillez vous reconnecter.');
    return;
  }

  showTeachersLoading();
  loadTeachers();

  function renderTeacherList() {
    if (!els.teacherList) return;

    const teachers = state.teachers
      .slice()
      .sort((a, b) => getLastMessageTimestamp(b.id) - getLastMessageTimestamp(a.id));

    els.teacherList.innerHTML = '';
    if (teachers.length === 0) {
      showTeachersEmpty();
      return;
    }

    showTeachersList();

    teachers.forEach((teacher) => {
      const item = document.createElement('li');
      item.className = 'inbox-teacher-item';
      item.dataset.teacherId = teacher.id;

      if (teacher.id === state.activeTeacherId) {
        item.classList.add('is-active');
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inbox-teacher-button';
      button.dataset.teacherId = teacher.id;
      button.addEventListener('click', () => selectTeacher(teacher.id));

      const header = document.createElement('div');
      header.className = 'inbox-teacher-top';

      const name = document.createElement('span');
      name.className = 'inbox-teacher-name';
      name.textContent = teacher.name;
      header.appendChild(name);

      const time = document.createElement('time');
      time.className = 'inbox-teacher-time';
      const lastTimestamp = getLastMessageTimestamp(teacher.id);
      if (lastTimestamp > 0) {
        time.textContent = formatRelativeTime(lastTimestamp);
        time.setAttribute('datetime', new Date(lastTimestamp).toISOString());
      } else {
        time.textContent = '';
      }
      header.appendChild(time);

      const preview = document.createElement('p');
      preview.className = 'inbox-teacher-preview';
      preview.textContent =
        getLastMessagePreview(teacher.id) || buildTeacherSubtitle(teacher);

      button.appendChild(header);
      button.appendChild(preview);
      item.appendChild(button);

      els.teacherList.appendChild(item);
    });
  }

  async function loadTeachers() {
    try {
      const res = await fetch('/api/users/teachers', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        showTeachersError('Session expirée. Veuillez vous reconnecter.');
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Impossible de charger les enseignants.');
      }

      const body = await res.json().catch(() => ({}));
      const teachers = Array.isArray(body?.teachers) ? body.teachers : [];

      state.teachers = teachers.map(normalizeTeacher);
      state.conversations = new Map(state.teachers.map((teacher) => [teacher.id, []]));
      state.activeTeacherId = null;

      renderTeacherList();
      renderConversation();
      toggleComposer(false);
    } catch (err) {
      console.error('[inbox] loadTeachers failed', err);
      showTeachersError(err.message || 'Impossible de charger les enseignants.');
    }
  }

  function selectTeacher(teacherId) {
    if (!teacherId) return;
    state.activeTeacherId = teacherId;

    renderTeacherList();
    renderConversation();
    toggleComposer(false);
  }

  function renderConversation() {
    const teacher = getActiveTeacher();
    if (!teacher || !els.messages) {
      toggleConversationPlaceholder(true);
      toggleComposer(false);
      setText(els.conversationTitle, 'Choisissez un enseignant');
      setText(els.conversationMeta, 'Les messages apparaîtront ici.');
      return;
    }

    setText(els.conversationTitle, teacher.name);
    setText(els.conversationMeta, buildTeacherSubtitle(teacher));

    const conversation = state.conversations.get(teacher.id) || [];

    if (conversation.length === 0) {
      els.messages.innerHTML = '';
      toggleConversationPlaceholder(true);
      return;
    }

    toggleConversationPlaceholder(false);
    els.messages.innerHTML = '';

    conversation.forEach((message) => {
      const bubble = document.createElement('div');
      bubble.className = `inbox-message inbox-message--${message.author === 'student' ? 'me' : 'teacher'}`;
      bubble.dataset.author = message.author;
      bubble.textContent = message.text;

      const time = document.createElement('time');
      time.textContent = formatTime(message.createdAt);
      time.setAttribute('datetime', new Date(message.createdAt).toISOString());
      bubble.appendChild(time);

      els.messages.appendChild(bubble);
    });

    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function toggleConversationPlaceholder(show) {
    toggle(els.conversationEmpty, !show);
  }

  function toggleComposer(enable) {
    const disabled = !enable;
    if (els.textarea) {
      els.textarea.disabled = disabled;
      if (disabled) {
        els.textarea.value = '';
      }
    }
    if (els.sendButton) {
      els.sendButton.disabled = disabled;
    }
  }

  function getActiveTeacher() {
    return state.teachers.find((teacher) => teacher.id === state.activeTeacherId) || null;
  }

  function getLastMessageTimestamp(teacherId) {
    const conversation = state.conversations.get(teacherId) || [];
    if (conversation.length === 0) return 0;
    const last = conversation[conversation.length - 1];
    return new Date(last.createdAt).getTime();
  }

  function getLastMessagePreview(teacherId) {
    const conversation = state.conversations.get(teacherId) || [];
    if (conversation.length === 0) return '';
    const last = conversation[conversation.length - 1];
    return truncate(last.text, 60);
  }

  function buildTeacherSubtitle(teacher) {
    if (!teacher) return 'Enseignant';
    if (teacher.subject) return `Enseignant en ${teacher.subject}`;
    if (teacher.className) return `Référent · ${teacher.className}`;
    if (teacher.schoolName) return `Établissement · ${teacher.schoolName}`;
    if (teacher.email) return teacher.email;
    return 'Enseignant';
  }

  function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMinutes = Math.round(diffMs / 60000);

    if (diffMinutes < 1) return 'À l’instant';
    if (diffMinutes < 60) return `Il y a ${diffMinutes} min`;

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `Il y a ${diffHours} h`;

    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'short',
    }).format(new Date(timestamp));
  }

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      return new Intl.DateTimeFormat('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function truncate(value, length) {
    if (!value) return '';
    if (value.length <= length) return value;
    return `${value.slice(0, length).trim()}…`;
  }

  function toggle(node, hide) {
    if (!node) return;
    if (hide) {
      node.setAttribute('hidden', 'hidden');
    } else {
      node.removeAttribute('hidden');
    }
  }

  function setText(node, text) {
    if (!node) return;
    node.textContent = text ?? '';
  }

  function normalizeTeacher(raw) {
    if (!raw || typeof raw !== 'object') {
      return {
        id: `temp-${Date.now()}`,
        name: 'Enseignant',
        subject: null,
        email: '',
        className: null,
        schoolName: null,
      };
    }

    const fullName = raw.full_name || buildName(raw.first_name, raw.last_name);
    const className = raw.class?.name || null;
    const schoolName = raw.school?.name || null;

    return {
      id: raw.id,
      name: fullName || raw.email || 'Enseignant',
      email: raw.email || '',
      subject: raw.subject || null,
      className,
      schoolName,
    };
  }

  function buildName(first, last) {
    return [first, last].filter(Boolean).join(' ').trim();
  }

  function showTeachersLoading() {
    toggle(els.teacherList, true);
    toggle(els.teachersEmpty, true);
    toggle(els.teachersError, true);
    toggle(els.teachersLoading, false);
  }

  function showTeachersEmpty() {
    toggle(els.teacherList, true);
    toggle(els.teachersLoading, true);
    toggle(els.teachersError, true);
    toggle(els.teachersEmpty, false);
  }

  function showTeachersError(message) {
    if (els.teachersErrorText) {
      setText(els.teachersErrorText, message || 'Impossible de charger les enseignants.');
    }
    if (els.teacherList) {
      els.teacherList.innerHTML = '';
    }
    toggle(els.teacherList, true);
    toggle(els.teachersLoading, true);
    toggle(els.teachersEmpty, true);
    toggle(els.teachersError, false);
  }

  function showTeachersList() {
    toggle(els.teacherList, false);
    toggle(els.teachersLoading, true);
    toggle(els.teachersEmpty, true);
    toggle(els.teachersError, true);
  }
})();
