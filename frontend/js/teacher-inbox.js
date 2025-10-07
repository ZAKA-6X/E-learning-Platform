(function () {
  const inbox = document.querySelector('[data-teacher-inbox]');
  if (!inbox) return;

  const els = {
    studentList: inbox.querySelector('[data-inbox-student-list]'),
    studentsLoading: inbox.querySelector('[data-inbox-students-loading]'),
    studentsEmpty: inbox.querySelector('[data-inbox-students-empty]'),
    studentsError: inbox.querySelector('[data-inbox-students-error]'),
    studentsErrorText: inbox.querySelector('[data-inbox-students-error-text]'),
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
    students: [],
    conversations: new Map(),
    loadedConversations: new Set(),
    lastMessagePreview: new Map(),
    activeStudentId: null,
    loadingConversation: false,
    loadingConversationFor: null,
    activeConversationRequest: null,
    conversationError: null,
    conversationErrorStudentId: null,
    composerEnabled: false,
    sendingMessage: false,
  };

  let conversationRequestSeq = 0;

  if (els.textarea) {
    els.textarea.addEventListener('input', handleComposerInput);
  }
  if (els.composer) {
    els.composer.addEventListener('submit', handleComposerSubmit);
  }

  toggleComposer(false);
  setComposerVisible(false);

  if (!token) {
    showStudentsError('Session expirée. Veuillez vous reconnecter.');
    setConversationPlaceholder('Connectez-vous pour accéder à votre messagerie.');
    toggleConversationPlaceholder(true);
    return;
  }

  showStudentsLoading();
  loadStudents();

  function renderStudentList() {
    if (!els.studentList) return;

    const students = state.students
      .slice()
      .sort((a, b) => getLastMessageTimestamp(b.id) - getLastMessageTimestamp(a.id));

    els.studentList.innerHTML = '';
    if (!students.length) {
      showStudentsEmpty();
      return;
    }

    showStudentsList();

    students.forEach((student) => {
      const item = document.createElement('li');
      item.className = 'inbox-teacher-item';
      item.dataset.studentId = student.id;

      if (student.id === state.activeStudentId) {
        item.classList.add('is-active');
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'inbox-teacher-button';
      button.dataset.studentId = student.id;
      button.addEventListener('click', () => selectStudent(student.id));

      const header = document.createElement('div');
      header.className = 'inbox-teacher-top';

      const name = document.createElement('span');
      name.className = 'inbox-teacher-name';
      name.textContent = student.name;
      header.appendChild(name);

      const time = document.createElement('time');
      time.className = 'inbox-teacher-time';
      const lastTimestamp = getLastMessageTimestamp(student.id);
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
        getLastMessagePreview(student.id) || buildStudentSubtitle(student);

      button.appendChild(header);
      button.appendChild(preview);
      item.appendChild(button);

      els.studentList.appendChild(item);
    });
  }

  async function loadStudents() {
    try {
      const res = await fetch('/api/inbox/students', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        showStudentsError('Session expirée. Veuillez vous reconnecter.');
        setConversationPlaceholder('Session expirée. Veuillez vous reconnecter.');
        toggleConversationPlaceholder(true);
        toggleComposer(false);
        return;
      }

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body?.error || 'Impossible de charger les élèves.');
      }

      const students = Array.isArray(body?.students) ? body.students : [];

      state.students = students.map(normalizeStudent).filter(Boolean);
      state.conversations = new Map();
      state.loadedConversations = new Set();
      state.lastMessagePreview = new Map();
      state.activeStudentId = null;
      state.loadingConversation = false;
      state.loadingConversationFor = null;
      state.activeConversationRequest = null;
      state.conversationError = null;
      state.conversationErrorStudentId = null;

      state.students.forEach((student) => {
        if (student.lastMessage) {
          state.lastMessagePreview.set(student.id, student.lastMessage);
        }
      });

      renderStudentList();
      renderConversation();
      toggleComposer(false);
    } catch (err) {
      console.error('[teacher-inbox] loadStudents failed', err);
      showStudentsError(err.message || 'Impossible de charger les élèves.');
      setConversationPlaceholder('Impossible de charger les élèves.');
      toggleConversationPlaceholder(true);
      toggleComposer(false);
    }
  }

  function selectStudent(studentId) {
    if (!studentId) return;

    const alreadyActive = state.activeStudentId === studentId;
    state.activeStudentId = studentId;
    state.conversationError = null;
    state.conversationErrorStudentId = null;

    const alreadyLoaded = state.loadedConversations.has(studentId);
    state.loadingConversation = !alreadyLoaded;
    state.loadingConversationFor = studentId;

    renderStudentList();
    renderConversation();

    loadConversation(studentId, { silent: alreadyLoaded && alreadyActive });
  }

  async function loadConversation(studentId, options = {}) {
    if (!studentId || !token) return;

    const student = getStudentById(studentId);
    if (!student) return;

    const { silent = false } = options;
    const requestId = ++conversationRequestSeq;
    state.activeConversationRequest = requestId;
    state.loadingConversationFor = studentId;

    if (!silent) {
      state.loadingConversation = true;
      renderConversation();
    }

    try {
      const res = await fetch(`/api/inbox/students/${studentId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 401) {
        state.conversations.delete(studentId);
        state.loadedConversations.delete(studentId);
        if (state.activeConversationRequest === requestId) {
          state.loadingConversation = false;
          state.loadingConversationFor = null;
          state.activeConversationRequest = null;
        }
        showConversationError('Session expirée. Veuillez vous reconnecter.', studentId);
        if (state.activeStudentId === studentId) {
          toggleComposer(false);
          renderConversation();
        }
        return;
      }

      if (!res.ok) {
        throw new Error(body?.error || 'Impossible de charger les messages.');
      }

      const messages = Array.isArray(body?.messages)
        ? body.messages.map(normalizeMessage).filter(Boolean)
        : [];

      state.conversations.set(studentId, messages);
      state.loadedConversations.add(studentId);
      if (messages.length) {
        const last = messages[messages.length - 1];
        state.lastMessagePreview.set(studentId, {
          text: last.text,
          author: last.author,
          createdAt: last.createdAt,
        });
      }

      if (state.activeConversationRequest === requestId) {
        state.conversationError = null;
        state.conversationErrorStudentId = null;
        state.loadingConversation = false;
        state.loadingConversationFor = null;
        state.activeConversationRequest = null;
        if (state.activeStudentId === studentId) {
          renderConversation();
        }
      }

      renderStudentList();
    } catch (err) {
      console.error('[teacher-inbox] loadConversation failed', err);
      state.loadedConversations.delete(studentId);
      if (state.activeConversationRequest === requestId) {
        state.loadingConversation = false;
        state.loadingConversationFor = null;
        state.activeConversationRequest = null;
        showConversationError(err.message || 'Impossible de charger les messages.', studentId);
        if (state.activeStudentId === studentId) {
          renderConversation();
        }
      }
    }
  }

  function normalizeMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const text = typeof raw.text === 'string' ? raw.text : raw.body || '';
    const author = raw.author === 'student' ? 'student' : 'teacher';
    const id =
      raw.id ||
      raw.message_id ||
      `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const createdRaw =
      raw.createdAt || raw.created_at || raw.created || new Date().toISOString();
    const createdDate = new Date(createdRaw);
    const createdAt = Number.isNaN(createdDate.getTime())
      ? new Date().toISOString()
      : createdDate.toISOString();

    return {
      id,
      author,
      text,
      createdAt,
      readAt: raw.readAt || raw.read_at || null,
    };
  }

  function renderConversation() {
    const student = getActiveStudent();

    if (!student || !els.messages) {
      clearMessages();
      const placeholder = state.students.length
        ? 'Sélectionnez un élève dans la liste pour ouvrir la conversation.'
        : 'Aucun élève associé pour le moment.';
      setText(els.conversationTitle, 'Choisissez un élève');
      setText(els.conversationMeta, 'Les messages apparaîtront ici.');
      setConversationPlaceholder(placeholder);
      toggleConversationPlaceholder(true);
      toggleComposer(false);
      setComposerVisible(false);
      return;
    }

    setComposerVisible(true);
    setText(els.conversationTitle, student.name);
    const subtitle = buildStudentSubtitle(student);
    setText(els.conversationMeta, subtitle);

    if (state.loadingConversation && state.loadingConversationFor === student.id) {
      clearMessages();
      setText(els.conversationMeta, 'Chargement de la conversation…');
      setConversationPlaceholder('Chargement des messages…', 'loading');
      toggleConversationPlaceholder(true);
      toggleComposer(false);
      setComposerVisible(true);
      return;
    }

    if (state.conversationError && state.conversationErrorStudentId === student.id) {
      clearMessages();
      setText(els.conversationMeta, state.conversationError);
      setConversationPlaceholder(state.conversationError, 'error');
      toggleConversationPlaceholder(true);
      toggleComposer(false);
      setComposerVisible(true);
      return;
    }

    const conversation = state.conversations.get(student.id) || [];
    const isLoaded = state.loadedConversations.has(student.id);

    if (!isLoaded) {
      clearMessages();
      const preview = state.lastMessagePreview.get(student.id);
      if (preview) {
        toggleConversationPlaceholder(false);
        clearMessages();
        const bubble = document.createElement('div');
        bubble.className = `inbox-message inbox-message--${preview.author === 'teacher' ? 'me' : 'teacher'}`;
        bubble.dataset.author = preview.author;

        const content = document.createElement('p');
        content.className = 'inbox-message-text';
        content.textContent = preview.text;
        bubble.appendChild(content);

        const time = document.createElement('time');
        time.textContent = formatTime(preview.createdAt);
        time.setAttribute('datetime', new Date(preview.createdAt).toISOString());
        bubble.appendChild(time);

        els.messages.appendChild(bubble);
      } else {
        setConversationPlaceholder('Sélectionnez un élève pour afficher la conversation.');
        toggleConversationPlaceholder(true);
      }
      toggleComposer(false);
      setComposerVisible(true);
      return;
    }

    if (conversation.length === 0) {
      clearMessages();
      setConversationPlaceholder('Aucun message pour le moment. Écrivez votre premier message.');
      toggleConversationPlaceholder(true);
      toggleComposer(true);
      setComposerVisible(true);
      return;
    }

    toggleConversationPlaceholder(false);
    clearMessages();

    conversation.forEach((message) => {
      const bubble = document.createElement('div');
      bubble.className = `inbox-message inbox-message--${message.author === 'teacher' ? 'me' : 'teacher'}`;
      bubble.dataset.author = message.author;

      const content = document.createElement('p');
      content.className = 'inbox-message-text';
      content.textContent = message.text;
      bubble.appendChild(content);

      const time = document.createElement('time');
      time.textContent = formatTime(message.createdAt);
      time.setAttribute('datetime', new Date(message.createdAt).toISOString());
      bubble.appendChild(time);

      els.messages.appendChild(bubble);
    });

    els.messages.scrollTop = els.messages.scrollHeight;
    toggleComposer(true);
    setComposerVisible(true);
  }

  function handleComposerInput() {
    updateComposerControls();
  }

  async function handleComposerSubmit(event) {
    event.preventDefault();
    if (state.sendingMessage) return;

    const student = getActiveStudent();
    if (!student || !els.textarea) return;

    const messageText = els.textarea.value.trim();
    if (!messageText) {
      updateComposerControls();
      return;
    }

    state.sendingMessage = true;
    updateComposerControls();

    try {
      const res = await fetch(`/api/inbox/students/${student.id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: messageText }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 401) {
        showConversationError('Session expirée. Veuillez vous reconnecter.', student.id);
        toggleComposer(false);
        renderConversation();
        return;
      }

      if (!res.ok) {
        throw new Error(body?.error || "Impossible d'envoyer le message.");
      }

      const message = normalizeMessage(body?.message);
      if (!message) {
        throw new Error('Réponse inattendue du serveur.');
      }

      const conversation = state.conversations.get(student.id) || [];
      conversation.push(message);
      state.conversations.set(student.id, conversation);
      state.loadedConversations.add(student.id);
      state.conversationError = null;
      state.conversationErrorStudentId = null;
      state.lastMessagePreview.set(student.id, {
        text: message.text,
        author: message.author,
        createdAt: message.createdAt,
      });

      els.textarea.value = '';
      renderConversation();
      renderStudentList();
    } catch (err) {
      console.error('[teacher-inbox] sendMessage failed', err);
      const errorText = err.message || "Impossible d'envoyer le message.";
      if (els.conversationMeta && state.activeStudentId === student.id) {
        const defaultMeta = buildStudentSubtitle(student);
        setText(els.conversationMeta, errorText);
        window.setTimeout(() => {
          if (state.activeStudentId === student.id && els.conversationMeta.textContent === errorText) {
            setText(els.conversationMeta, defaultMeta);
          }
        }, 4000);
      }
      if ((state.conversations.get(student.id) || []).length === 0) {
        setConversationPlaceholder(errorText, 'error');
        toggleConversationPlaceholder(true);
      }
    } finally {
      state.sendingMessage = false;
      updateComposerControls();
    }
  }

  function updateComposerControls() {
    const hasText = !!(els.textarea && els.textarea.value.trim().length > 0);
    if (els.sendButton) {
      const disabled = !state.composerEnabled || state.sendingMessage || !hasText;
      els.sendButton.disabled = disabled;
    }
  }

  function toggleConversationPlaceholder(show) {
    if (!els.conversationEmpty || !els.messages) return;
    if (show) {
      if (els.conversationEmpty.parentNode !== els.messages) {
        els.messages.appendChild(els.conversationEmpty);
      }
      els.conversationEmpty.removeAttribute('hidden');
    } else {
      els.conversationEmpty.setAttribute('hidden', 'hidden');
    }
  }

  function toggleComposer(enable) {
    state.composerEnabled = !!enable;
    if (els.textarea) {
      els.textarea.disabled = !state.composerEnabled;
      if (!state.composerEnabled) {
        els.textarea.value = '';
      }
    }
    updateComposerControls();
  }

  function setComposerVisible(visible) {
    if (!els.composer) return;
    if (visible) {
      els.composer.removeAttribute('hidden');
    } else {
      els.composer.setAttribute('hidden', 'hidden');
    }
  }

  function clearMessages() {
    if (!els.messages) return;
    const nodes = Array.from(els.messages.children);
    nodes.forEach((node) => {
      if (node === els.conversationEmpty) return;
      node.remove();
    });
  }

  function setConversationPlaceholder(message, variant = 'default') {
    if (!els.conversationEmpty) return;
    const textNode = els.conversationEmpty.querySelector('p');
    if (textNode) {
      textNode.textContent = message;
    }
    const icon = els.conversationEmpty.querySelector('i');
    if (icon) {
      if (variant === 'loading') {
        icon.className = 'fa-solid fa-circle-notch fa-spin';
      } else if (variant === 'error') {
        icon.className = 'fa-solid fa-triangle-exclamation';
      } else {
        icon.className = 'fa-regular fa-message';
      }
      icon.setAttribute('aria-hidden', 'true');
    }
    els.conversationEmpty.classList.toggle('inbox-empty--error', variant === 'error');
  }

  function showConversationError(message, studentId) {
    state.conversationError = message;
    state.conversationErrorStudentId = studentId;
  }

  function getActiveStudent() {
    return getStudentById(state.activeStudentId);
  }

  function getStudentById(id) {
    if (!id) return null;
    return state.students.find((student) => student.id === id) || null;
  }

  function getLastMessageTimestamp(studentId) {
    const conversation = state.conversations.get(studentId) || [];
    if (conversation.length > 0) {
      const last = conversation[conversation.length - 1];
      return new Date(last.createdAt).getTime();
    }
    const preview = state.lastMessagePreview.get(studentId);
    if (preview?.createdAt) {
      return new Date(preview.createdAt).getTime();
    }
    return 0;
  }

  function getLastMessagePreview(studentId) {
    const conversation = state.conversations.get(studentId) || [];
    if (conversation.length > 0) {
      const last = conversation[conversation.length - 1];
      return truncate(last.text, 60);
    }
    const preview = state.lastMessagePreview.get(studentId);
    if (preview?.text) {
      return truncate(preview.text, 60);
    }
    return '';
  }

  function buildStudentSubtitle(student) {
    if (!student) return 'Élève';
    if (student.className) return `Classe • ${student.className}`;
    if (student.email) return student.email;
    return 'Élève';
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

  function normalizeStudent(raw) {
    if (!raw || typeof raw !== 'object' || !raw.id) {
      return null;
    }

    const id = String(raw.id).trim();
    const fullName =
      raw.full_name ||
      buildName(raw.first_name, raw.last_name) ||
      raw.email ||
      'Élève';

    const className =
      raw.class?.name ||
      raw.class_name ||
      (raw.class && raw.class.title) ||
      null;

    let lastMessage = null;
    if (raw.last_message && typeof raw.last_message === 'object') {
      const lm = raw.last_message;
      const created = lm.createdAt || lm.created_at || null;
      lastMessage = {
        text: typeof lm.text === 'string' ? lm.text : lm.body || '',
        author: lm.author === 'student' ? 'student' : 'teacher',
        createdAt: created,
      };
    }

    return {
      id,
      email: raw.email || '',
      name: fullName,
      className,
      lastMessage,
    };
  }

  function buildName(first, last) {
    return [first, last].filter(Boolean).join(' ').trim();
  }

  function showStudentsLoading() {
    toggle(els.studentList, true);
    toggle(els.studentsEmpty, true);
    toggle(els.studentsError, true);
    toggle(els.studentsLoading, false);
  }

  function showStudentsEmpty() {
    toggle(els.studentList, true);
    toggle(els.studentsLoading, true);
    toggle(els.studentsError, true);
    toggle(els.studentsEmpty, false);
  }

  function showStudentsError(message) {
    if (els.studentsErrorText) {
      setText(els.studentsErrorText, message || 'Impossible de charger les élèves.');
    }
    if (els.studentList) {
      els.studentList.innerHTML = '';
    }
    toggle(els.studentList, true);
    toggle(els.studentsLoading, true);
    toggle(els.studentsEmpty, true);
    toggle(els.studentsError, false);
  }

  function showStudentsList() {
    toggle(els.studentList, false);
    toggle(els.studentsLoading, true);
    toggle(els.studentsEmpty, true);
    toggle(els.studentsError, true);
  }
})();
